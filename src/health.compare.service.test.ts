import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from './cli.ts';
import { compareHealth, listNewProblems } from './health.compare.service.ts';
import { measureHealth } from './health.service.ts';
import type { Roadmap, Task } from './roadmap.model.ts';
import { initRoadmap } from './roadmap.repository.ts';

function git(root: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
}

function capture(args: string[], cwd: string) {
  let text = '';
  const write = (written: string) => (text += written);
  const code = run(args, { cwd, env: {}, out: write, err: write });
  return { code, text };
}

/** A repo whose roadmap sits in `folder` below its top, committed on main, with a branch `more` adding a chain to it. */
function repo(folder = '.'): string {
  const top = mkdtempSync(join(tmpdir(), 'agentic-roadmap-'));
  git(top, 'init', '-q', '-b', 'main');
  const root = join(top, folder);
  mkdirSync(root, { recursive: true });
  initRoadmap(root);
  git(top, 'add', '-A');
  git(top, 'commit', '-qm', 'docs: start the roadmap');
  git(top, 'switch', '-q', '-c', 'more');
  capture(['add', 'GET', 'Third', '--requires', 'GET.2', '--done-when', 'x', '--lines', '200'], root);
  return root;
}

function task(id: string, requires: string[] = []): Task {
  return { id, title: id, requires, doneWhen: 'x', lines: 10 };
}

function plan(...tasks: Task[]): Roadmap {
  return { blocks: [{ code: 'A', name: 'A', tasks }] };
}

function listNew(before: Roadmap, after: Roadmap) {
  return listNewProblems(compareHealth('before', measureHealth(before), measureHealth(after)));
}

describe('listNewProblems', () => {
  const chain = [task('A.1'), task('A.2', ['A.1'])];

  it('finds nothing new when a redundant requirement is dropped', () => {
    const before = plan(...chain, task('A.3', ['A.1', 'A.2']), task('A.4', ['A.1', 'A.2']));
    const after = plan(...chain, task('A.3', ['A.2']), task('A.4', ['A.1', 'A.2']));

    expect(listNew(before, after)).toEqual([]);
  });

  it('names only the requirement that was not there before', () => {
    const before = plan(...chain, task('A.3', ['A.1', 'A.2']));
    const after = plan(...chain, task('A.3', ['A.1', 'A.2']), task('A.4', ['A.1', 'A.2']));

    expect(listNew(before, after)).toEqual([
      { kind: 'redundant', requirements: [{ id: 'A.4', requires: 'A.1', through: 'A.2' }] },
    ]);
  });
});

describe('health --against', () => {
  it('shows each figure against the other branch and marks what got worse', () => {
    const { code, text } = capture(['health', '--against', 'main'], repo());

    expect(code).toBe(0);
    expect(text).toContain('Plan health here against main:');
    expect(text).toContain('Critical path   ~40 → ~240 lines  (worse)');
    expect(text).toContain('Parallelism     1.0 → 1.0\n');
    expect(text).toContain('Problems        0 → 3  (worse)');
    expect(text).toContain('New problems:\n  1. GET.3 is ~200 lines, over the cap of 150');
  });

  it('reads the other branch from a roadmap below the repo top, without checking it out', () => {
    const root = repo('packages/app');

    expect(capture(['health', '--against', 'main'], root).text).toContain('Tasks left      2 → 3');
    expect(git(root, 'branch', '--show-current')).toBe('more');
  });

  it('fails with --strict when something got worse, and gives the comparison as JSON', () => {
    const root = repo();

    expect(capture(['health', '--against', 'main', '--strict'], root).code).toBe(1);
    const comparison: unknown = JSON.parse(capture(['health', '--against', 'main', '--json'], root).text);
    expect(comparison).toMatchObject({ against: 'main', worse: ['criticalPath', 'problems'] });
  });

  it('refuses a branch the repo does not have', () => {
    expect(capture(['health', '--against', 'nope'], repo())).toEqual({
      code: 1,
      text: 'This repo has no nope to compare with.\n',
    });
  });
});
