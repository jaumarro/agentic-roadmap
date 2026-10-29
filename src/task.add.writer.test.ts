import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from './cli.ts';
import { renderDelta } from './health.view.ts';
import { compareHealth } from './health.compare.service.ts';
import { measureHealth } from './health.service.ts';
import { initRoadmap, readRoadmap } from './roadmap.repository.ts';

function git(root: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
}

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'agentic-roadmap-'));
  git(root, 'init', '-q', '-b', 'main');
  initRoadmap(root);
  git(root, 'add', '-A');
  git(root, 'commit', '-qm', 'docs: start the roadmap');
  return root;
}

function capture(args: string[], cwd: string) {
  let text = '';
  const write = (written: string) => (text += written);
  const code = run(args, { cwd, env: {}, out: write, err: write });
  return { code, text };
}

const ADD = ['--done-when', 'it is there', '--lines', '30'];

describe('add, on the plan health', () => {
  it('ends with the figures it moved, worse ones marked, and the problems it brought in', () => {
    const text = capture(['add', 'GET', 'Big', '--done-when', 'x', '--lines', '300'], repo()).text;

    expect(text).toContain(
      'Health: critical path 40 → 300 (worse) · parallelism 1.0 → 1.1 · width 1 → 2 · problems 0 → 2 (worse)\n',
    );
    expect(text).toContain('  New problem: GET.3 is ~300 lines, over the cap of 150: split it into slices\n');
  });

  it('does not call a problem new when only its figure moved', () => {
    const root = repo();
    capture(['add', 'GET', 'Chained', '--requires', 'GET.2', ...ADD], root);

    const text = capture(['add', 'GET', 'Free', '--done-when', 'x', '--lines', '5'], root).text;
    expect(text).toContain('Health: parallelism 1.0 → 1.1 · width 1 → 2\n');
    expect(text).not.toContain('New problem');
  });

  it('says when no figure moved', () => {
    const health = measureHealth(readRoadmap(repo()));

    expect(renderDelta(compareHealth('before', health, health))).toBe('Health: no figure moved.\n');
  });
});

describe('add', () => {
  it('adds a task with the next id, in the plan as the rest is written', () => {
    const root = repo();

    const { code, text } = capture(['add', 'GET', 'Third step', '--requires', 'GET.2', ...ADD], root);
    expect(code).toBe(0);
    expect(text).toMatch(/^Added GET\.3 · Third step to roadmap\/GET\.yaml\.\n/);
    expect(readFileSync(join(root, 'roadmap', 'GET.yaml'), 'utf8')).toContain(
      '  - id: GET.3\n    title: Third step\n    requires: [GET.2]\n    doneWhen: it is there\n    lines: 30\n',
    );
    expect(capture(['check'], root).code).toBe(0);
  });

  it('refuses a requirement on a later chapter, as check does', () => {
    const root = repo();
    writeFileSync(
      join(root, 'roadmap', 'roadmap.yaml'),
      'blocks: [GET, LAT]\nchapters: [{ name: First, blocks: [GET] }, { name: Later, blocks: [LAT] }]\n',
    );
    writeFileSync(
      join(root, 'roadmap', 'LAT.yaml'),
      'name: Later\ntasks:\n  - id: LAT.1\n    title: Later\n    doneWhen: x\n    lines: 5\n',
    );

    expect(capture(['add', 'GET', 'Too soon', '--requires', 'LAT.1', ...ADD], root).text).toContain(
      'GET.3 requires LAT.1, from a later chapter',
    );
    expect(capture(['check'], root).code).toBe(0);
  });

  it("sees ids and started tasks on another clone's branches once fetched", () => {
    const origin = repo();
    git(origin, 'switch', '-q', '-c', 'get-1/elsewhere');
    capture(['add', 'GET', 'From the other clone', ...ADD], origin);
    git(origin, 'commit', '-qam', 'docs: plan it');
    git(origin, 'switch', '-q', 'main');
    const clone = join(mkdtempSync(join(tmpdir(), 'agentic-roadmap-')), 'clone');
    git(origin, 'clone', '-q', origin, clone);

    expect(capture(['add', 'GET', 'From here', ...ADD], clone).text).toMatch(/^Added GET\.4 /);
    expect(capture(['list', '--state', 'started'], clone).text).toContain('GET.1  started');
  });

  it('sees an id another branch committed when the roadmap sits in a subfolder', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'agentic-roadmap-'));
    git(repoRoot, 'init', '-q', '-b', 'main');
    const root = join(repoRoot, 'app');
    mkdirSync(root);
    initRoadmap(root);
    git(repoRoot, 'add', '-A');
    git(repoRoot, 'commit', '-qm', 'docs: start the roadmap');
    git(repoRoot, 'switch', '-q', '-c', 'one');
    capture(['add', 'GET', 'From one', ...ADD], root);
    git(repoRoot, 'commit', '-qam', 'docs: plan one');
    git(repoRoot, 'switch', '-q', '-c', 'two', 'main');

    expect(capture(['add', 'GET', 'From two', ...ADD], root).text).toMatch(/^Added GET\.4 /);
  });

  it('gives two worktrees adding to one block before either commits different ids', () => {
    const root = repo();
    const other = join(mkdtempSync(join(tmpdir(), 'agentic-roadmap-')), 'other');
    git(root, 'worktree', 'add', '-q', '-b', 'two', other);

    expect(capture(['add', 'GET', 'From here', ...ADD], root).text).toMatch(/^Added GET\.3 /);
    expect(capture(['add', 'GET', 'From there', ...ADD], other).text).toMatch(/^Added GET\.4 /);
    expect(capture(['add', 'GET', 'Here again', ...ADD], root).text).toMatch(/^Added GET\.5 /);
  });

  it('gives two branches adding to the same block different ids, and the plan stays sound once both merge', () => {
    const root = repo();

    git(root, 'switch', '-q', '-c', 'one');
    capture(['add', 'GET', 'From one', ...ADD], root);
    git(root, 'commit', '-qam', 'docs: plan one');

    git(root, 'switch', '-q', 'main');
    git(root, 'switch', '-q', '-c', 'two');
    expect(capture(['add', 'GET', 'From two', ...ADD], root).text).toContain('Added GET.4');
    git(root, 'commit', '-qam', 'docs: plan two');

    git(root, 'switch', '-q', 'main');
    git(root, 'merge', '-q', 'one');
    // Both appended at the end of the same file, so git asks; keeping both tasks is the whole resolution.
    const file = join(root, 'roadmap', 'GET.yaml');
    const fromTwo = git(root, 'show', 'two:roadmap/GET.yaml');
    expect(() => git(root, 'merge', '-q', '--no-edit', 'two')).toThrow(/Command failed/);
    const added = fromTwo.slice(fromTwo.indexOf('  - id: GET.4'));
    writeFileSync(file, `${git(root, 'show', 'one:roadmap/GET.yaml')}\n${added}\n`);
    git(root, 'commit', '-qam', 'docs: merge two');

    expect(readRoadmap(root).blocks[0]?.tasks.map((task) => task.id)).toEqual(['GET.1', 'GET.2', 'GET.3', 'GET.4']);
    const checked = capture(['check'], root);
    expect(checked.code).toBe(0);
    expect(checked.text).toMatch(/^The plan is sound\.\n/);
  });

  it('reads a title and a done-when that start with a dash as text, not as options', () => {
    const root = repo();

    const { code, text } = capture(
      ['add', 'GET', '--where compares with = != >', '--done-when', '- it compares', '--lines', '30'],
      root,
    );
    expect(code).toBe(0);
    expect(text).toMatch(/^Added GET\.3 · --where compares with = != > to roadmap\/GET\.yaml\.\n/);
    expect(readRoadmap(root).blocks[0]?.tasks[2]).toMatchObject({
      title: '--where compares with = != >',
      doneWhen: '- it compares',
    });
  });

  it('writes a document size and leaves out requires when there are none', () => {
    const root = repo();
    capture(['add', 'GET', 'Write it down', '--done-when', 'the README says so', '--lines', 'doc'], root);

    expect(readFileSync(join(root, 'roadmap', 'GET.yaml'), 'utf8')).toContain(
      '  - id: GET.3\n    title: Write it down\n    doneWhen: the README says so\n    lines: doc\n',
    );
  });

  it.each([
    [['add', 'GET', 'X', '--lines', '30'], 'Say when it is done'],
    [['add', 'GET', 'X', '--done-when', 'y'], '--lines is a positive whole number, or doc'],
    [['add', 'GET', 'X', '--done-when', 'y', '--lines', '0'], '--lines is a positive whole number, or doc'],
    [['add', 'XYZ', 'X', ...ADD], 'No block XYZ in this roadmap'],
    [['add', 'GET', 'X', '--requires', 'GET.9', ...ADD], 'Not added: GET.3 requires GET.9, which no task has'],
    [['add', 'GET'], 'Say the block and the title'],
  ])('refuses %j and writes nothing', (args, message) => {
    const root = repo();
    const before = readFileSync(join(root, 'roadmap', 'GET.yaml'), 'utf8');

    const { code, text } = capture(args, root);

    expect(code).toBe(1);
    expect(text).toContain(message);
    expect(readFileSync(join(root, 'roadmap', 'GET.yaml'), 'utf8')).toBe(before);
  });
});
