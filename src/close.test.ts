import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from './cli.ts';
import { initRoadmap, readRoadmap } from './source.ts';

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function commit(root: string, subject: string): string {
  writeFileSync(join(root, `${subject.length}-${Date.now()}.txt`), subject);
  git(root, 'add', '-A');
  git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', subject);
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
  const code = run(args, { cwd, env: {}, out: (written) => (text += written) });
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
});

describe('check', () => {
  it('passes a fresh roadmap and fails one citing a commit the repo lacks', () => {
    const root = repo();
    expect(capture(['check'], root)).toEqual({ code: 0, text: 'The plan is sound.\n' });

    const file = join(root, 'roadmap', 'GET.yaml');
    writeFileSync(file, readFileSync(file, 'utf8').replace('lines: doc\n', 'lines: doc\n    commit: "abcdef1"\n'));

    expect(capture(['check'], root)).toEqual({
      code: 1,
      text: 'The plan has problems:\n  GET.1 cites abcdef1, which this repo does not have\n',
    });
  });
});

describe('next', () => {
  it('refuses an unsound plan and says why', () => {
    const root = repo();
    const file = join(root, 'roadmap', 'GET.yaml');
    writeFileSync(file, readFileSync(file, 'utf8').replace('requires: [GET.1]', 'requires: [GET.9]'));

    expect(capture(['next'], root)).toEqual({
      code: 1,
      text: 'The plan has problems; fix them first:\n  GET.2 requires GET.9, which no task has\n\n',
    });
  });

  it('says a task is already started when a branch names it', () => {
    const root = repo();
    git(root, 'branch', 'get-1/first-block');

    expect(capture(['next'], root).text).toContain('Already started on get-1/first-block');
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
