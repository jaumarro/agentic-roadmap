import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from './cli.ts';
import { readKnownCommits } from './git.ts';
import { initRoadmap, readRoadmap } from './source.ts';

function git(root: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
}

function commit(root: string, subject: string): string {
  writeFileSync(join(root, `${subject.length}-${Date.now()}.txt`), subject);
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', subject);
  return git(root, 'rev-parse', '--short', 'HEAD');
}

/** A repo with a fresh roadmap committed. */
function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'agentic-roadmap-'));
  git(root, 'init', '-q');
  initRoadmap(root);
  commit(root, 'docs: start the roadmap');
  return root;
}

function capture(args: string[], cwd: string) {
  let text = '';
  const write = (written: string) => (text += written);
  const code = run(args, { cwd, env: {}, out: write, err: write });
  return { code, text };
}

describe('close', () => {
  it('closes a task with the last commit that is not a docs one, and next moves on', () => {
    const root = repo();
    const work = commit(root, 'feat: write the first block');
    commit(root, 'docs: note it');

    expect(capture(['close', 'GET.1'], root).code).toBe(0);

    expect(readRoadmap(root).blocks[0]?.tasks[0]?.commit).toBe(work);
    expect(capture(['next'], root).text).toContain('Next: GET.2');
  });

  it("takes the task branch's own build commit, not a feature an earlier task merged", () => {
    const root = repo();
    git(root, 'branch', '-M', 'main');
    // GET.1 as a task that changes code, as a build-only one does, rather than the document the example block has.
    const block = join(root, 'roadmap', 'GET.yaml');
    writeFileSync(block, readFileSync(block, 'utf8').replace('lines: doc', 'lines: 5'));
    commit(root, 'feat: an earlier task');
    git(root, 'switch', '-q', '-c', 'get-1/node');
    const build = commit(root, 'build: run on older Node');
    commit(root, 'docs: say so');

    capture(['close', 'GET.1'], root);

    expect(readRoadmap(root).blocks[0]?.tasks[0]?.commit).toBe(build);
  });

  it('refuses on a fresh task branch with no commit of its own, rather than take an earlier task’s', () => {
    const root = repo();
    git(root, 'branch', '-M', 'main');
    commit(root, 'feat: an earlier task');
    git(root, 'switch', '-q', '-c', 'get-1/fresh');

    const closed = capture(['close', 'GET.1'], root);

    expect(closed.code).toBe(1);
    expect(closed.text).toContain('No commit to close it with');
  });

  it('still closes with the task’s own work when a backup branch sits at its tip', () => {
    const root = repo();
    git(root, 'branch', '-M', 'main');
    git(root, 'switch', '-q', '-c', 'get-1/work');
    const work = commit(root, 'feat: write the first block');
    git(root, 'branch', 'backup');

    capture(['close', 'GET.1'], root);

    expect(readRoadmap(root).blocks[0]?.tasks[0]?.commit).toBe(work);
  });

  it('takes only the commits a stacked branch added over the task below it', () => {
    const root = repo();
    git(root, 'branch', '-M', 'main');
    git(root, 'switch', '-q', '-c', 'get-1/below');
    commit(root, 'feat: the task below');
    capture(['close', 'GET.1'], root);
    commit(root, 'docs: close GET.1');
    git(root, 'switch', '-q', '-c', 'get-2/above');
    const above = commit(root, 'feat: the task above');

    capture(['close', 'GET.2'], root);

    expect(readRoadmap(root).blocks[0]?.tasks[1]?.commit).toBe(above);
  });

  it('keeps the feature when the branch was pushed before its tests', () => {
    const root = repo();
    git(root, 'branch', '-M', 'main');
    const remote = join(mkdtempSync(join(tmpdir(), 'agentic-roadmap-')), 'remote.git');
    git(root, 'init', '-q', '--bare', remote);
    git(root, 'remote', 'add', 'origin', remote);
    git(root, 'push', '-q', 'origin', 'main');
    git(root, 'switch', '-q', '-c', 'get-1/work');
    const feature = commit(root, 'feat: write the first block');
    git(root, 'push', '-q', 'origin', 'get-1/work');
    commit(root, 'test: cover the first block');

    capture(['close', 'GET.1'], root);

    expect(readRoadmap(root).blocks[0]?.tasks[0]?.commit).toBe(feature);
  });

  it('refuses a stacked branch fresh from the close of the task below', () => {
    const root = repo();
    git(root, 'branch', '-M', 'main');
    git(root, 'switch', '-q', '-c', 'get-1/below');
    commit(root, 'feat: the task below');
    capture(['close', 'GET.1'], root);
    commit(root, 'docs: close GET.1');
    git(root, 'switch', '-q', '-c', 'get-2/above');

    expect(capture(['close', 'GET.2'], root).text).toContain('No commit to close it with');
  });

  it('warns, not fails, on cited commits a shallow clone cannot see', () => {
    const root = repo();
    commit(root, 'feat: write the first block');
    capture(['close', 'GET.1'], root);
    commit(root, 'docs: close GET.1');
    commit(root, 'docs: later');
    const shallow = join(mkdtempSync(join(tmpdir(), 'agentic-roadmap-')), 'shallow');
    git(root, 'clone', '-q', '--depth', '1', `file://${root}`, shallow);

    const checked = capture(['check'], shallow);

    expect(checked.code).toBe(0);
    expect(checked.text).toMatch(/^The plan is sound\.\n/);
    expect(checked.text).toContain('this clone is shallow');
  });

  it('takes the feature over a newer tooling build commit', () => {
    const root = repo();
    git(root, 'branch', '-M', 'main');
    git(root, 'switch', '-q', '-c', 'get-1/work');
    const feature = commit(root, 'feat: write the first block');
    commit(root, 'build: update the tooling');

    capture(['close', 'GET.1'], root);

    expect(readRoadmap(root).blocks[0]?.tasks[0]?.commit).toBe(feature);
  });

  it('closes a doc-only task with its docs commit, not a tooling build one', () => {
    const root = repo();
    git(root, 'branch', '-M', 'main');
    git(root, 'switch', '-q', '-c', 'get-1/write');
    const written = commit(root, 'docs: write the first block');
    commit(root, 'build: update the tooling');

    capture(['close', 'GET.1'], root);

    expect(readRoadmap(root).blocks[0]?.tasks[0]?.commit).toBe(written);
  });

  it('names an unknown task before it looks for a commit', () => {
    const root = repo();
    git(root, 'switch', '-q', '-c', 'get-1/fresh');

    expect(capture(['close', 'NOPE.1'], root)).toEqual({ code: 1, text: 'No task NOPE.1 in this roadmap.\n' });
  });

  it('asks for base: when it can tell no base, rather than take older history', () => {
    const root = repo();
    git(root, 'branch', '-M', 'develop');
    commit(root, 'feat: old unrelated work');
    git(root, 'switch', '-q', '-c', 'get-1/x');

    expect(capture(['close', 'GET.1'], root)).toEqual({
      code: 1,
      text: 'close cannot tell which branch tasks start from: set base: in roadmap.yaml, or pass --commit.\n',
    });
  });

  it('fails on a base roadmap.yaml names that is no branch', () => {
    const root = repo();
    writeFileSync(join(root, 'roadmap', 'roadmap.yaml'), 'blocks: [GET]\nbase: typo-does-not-exist\n');
    commit(root, 'feat: an earlier task');
    git(root, 'switch', '-q', '-c', 'get-1/fresh');

    expect(capture(['close', 'GET.1'], root)).toEqual({
      code: 1,
      text: 'base: typo-does-not-exist in roadmap.yaml names no branch here.\n',
    });
  });

  it('bounds the commits by the base roadmap.yaml names', () => {
    const root = repo();
    git(root, 'branch', '-M', 'trunk');
    writeFileSync(join(root, 'roadmap', 'roadmap.yaml'), 'blocks: [GET]\nbase: trunk\n');
    commit(root, 'feat: an earlier task');
    git(root, 'switch', '-q', '-c', 'get-1/fresh');

    expect(capture(['close', 'GET.1'], root).text).toContain('No commit to close it with');
  });

  it('closes a docs-only task with the newest docs commit of its branch', () => {
    const root = repo();
    git(root, 'branch', '-M', 'main');
    git(root, 'switch', '-q', '-c', 'get-1/write');
    const written = commit(root, 'docs: write the first block');

    capture(['close', 'GET.1'], root);

    expect(readRoadmap(root).blocks[0]?.tasks[0]?.commit).toBe(written);
  });

  it('takes the feature commit over the tests that follow it', () => {
    const root = repo();
    const feature = commit(root, 'feat: write the first block');
    commit(root, 'test: cover the first block');

    capture(['close', 'GET.1'], root);

    expect(readRoadmap(root).blocks[0]?.tasks[0]?.commit).toBe(feature);
  });

  it('takes the newest commit that is not a docs one when none is a conventional change', () => {
    const root = repo();
    const work = commit(root, 'write the first block');
    commit(root, 'docs: note it');

    capture(['close', 'GET.1'], root);

    expect(readRoadmap(root).blocks[0]?.tasks[0]?.commit).toBe(work);
  });

  it('writes the commit quoted and keeps the file as it was otherwise', () => {
    const root = repo();
    const before = readFileSync(join(root, 'roadmap', 'GET.yaml'), 'utf8');
    const work = commit(root, 'feat: work');

    capture(['close', 'GET.1'], root);

    const after = readFileSync(join(root, 'roadmap', 'GET.yaml'), 'utf8');
    expect(after.replace(`    commit: '${work}'\n`, '')).toBe(before);
  });

  it('refuses a commit the repo does not have, a task it does not know and one already done', () => {
    const root = repo();
    commit(root, 'feat: work');

    expect(capture(['close', 'GET.1', '--commit', 'abcdef1'], root).text).toContain('no commit abcdef1');
    expect(capture(['close', 'GET.9'], root).text).toContain('No task GET.9');
    capture(['close', 'GET.1'], root);
    expect(capture(['close', 'GET.1'], root).text).toContain('GET.1 is already done');
  });

  it('records a done task again with the commit given, as after a rebase rewrote it', () => {
    const root = repo();
    commit(root, 'feat: work');
    capture(['close', 'GET.1'], root);
    const rewritten = commit(root, 'feat: work, rewritten');

    expect(capture(['close', 'GET.1'], root).text).toContain('pass --commit to record another');
    const { code, text } = capture(['close', 'GET.1', '--commit', rewritten], root);
    expect(code).toBe(0);
    expect(text).toContain(`GET.1 was done with`);
    expect(readRoadmap(root).blocks[0]?.tasks[0]?.commit).toBe(rewritten);
  });
});

describe('readKnownCommits', () => {
  it('keeps the commits the repo has and drops the rest, in one ask', () => {
    const root = repo();
    const work = commit(root, 'feat: work');

    expect(readKnownCommits(root, [work, 'abcdef1', work])).toEqual(new Set([work]));
  });
});

describe('check', () => {
  it('passes a fresh roadmap and fails one citing a commit the repo lacks', () => {
    const root = repo();
    const checked = capture(['check'], root);
    expect(checked.code).toBe(0);
    expect(checked.text).toMatch(/^The plan is sound\.\n/);

    const file = join(root, 'roadmap', 'GET.yaml');
    writeFileSync(file, readFileSync(file, 'utf8').replace('lines: doc\n', 'lines: doc\n    commit: "abcdef1"\n'));

    const broken = capture(['check'], root);
    expect(broken.code).toBe(1);
    expect(broken.text).toMatch(/^The plan has problems:\n {2}GET\.1 cites abcdef1, which this repo does not have\n/);
  });
});

describe('next', () => {
  it('refuses an unsound plan and says why', () => {
    const root = repo();
    const file = join(root, 'roadmap', 'GET.yaml');
    writeFileSync(file, readFileSync(file, 'utf8').replace('requires: [GET.1]', 'requires: [GET.9]'));

    expect(capture(['next'], root)).toEqual({
      code: 1,
      text: 'The plan has problems; fix them first:\n  GET.2 requires GET.9, which no task has\n',
    });
  });

  it('never offers a task a branch started, and lists it as in progress', () => {
    const root = repo();
    git(root, 'branch', 'get-1/first-block');

    const { text } = capture(['next'], root);

    expect(text).not.toContain('Next: GET.1');
    expect(text).toContain(
      'In progress:\n  GET.1 · Write the first real block of this roadmap (on get-1/first-block)\n',
    );
  });
});

describe('close, against what could corrupt the plan', () => {
  it('writes the commit a branch, a tag or HEAD names, as its sha', () => {
    const root = repo();
    const work = commit(root, 'feat: work');
    git(root, 'tag', '-a', 'v1', '-m', 'one');

    capture(['close', 'GET.1', '--commit', 'v1'], root);

    expect(readRoadmap(root).blocks[0]?.tasks[0]?.commit).toBe(work);
    expect(capture(['check'], root).code).toBe(0);
  });

  it('refuses a task whose requirements are not done', () => {
    const root = repo();
    commit(root, 'feat: work');

    expect(capture(['close', 'GET.2'], root)).toEqual({ code: 1, text: 'GET.2 still waits on GET.1.\n' });
  });

  it('fails cleanly on a block file it cannot write', () => {
    const root = repo();
    commit(root, 'feat: work');
    chmodSync(join(root, 'roadmap', 'GET.yaml'), 0o444);

    expect(capture(['close', 'GET.1'], root)).toEqual({ code: 1, text: 'Could not write roadmap/GET.yaml: EACCES.\n' });
  });

  it('refuses an empty --commit', () => {
    expect(capture(['close', 'GET.1', '--commit', ''], repo()).text).toBe('--commit needs a commit.\n');
  });
});

describe('a commit written as a number', () => {
  it('says to quote it', () => {
    const root = repo();
    const file = join(root, 'roadmap', 'GET.yaml');
    writeFileSync(file, readFileSync(file, 'utf8').replace('lines: doc\n', 'lines: doc\n    commit: 1234567\n'));

    expect(capture(['next'], root).text).toContain('a commit is a quoted sha');
  });
});
