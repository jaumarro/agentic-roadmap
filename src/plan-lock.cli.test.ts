import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { initRoadmap, readRoadmap } from './roadmap.repository.ts';

const runAsync = promisify(execFile);
const CLI = fileURLToPath(new URL('cli.ts', import.meta.url));

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
  git(root, 'commit', '-qm', 'feat: start');
  return root;
}

function start(root: string, ...args: string[]) {
  return runAsync(process.execPath, [CLI, ...args], { cwd: root });
}

describe('sessions changing one checkout at once', () => {
  it('keeps every close and every add', async () => {
    const root = repo();
    const sha = git(root, 'rev-parse', '--short', 'HEAD');
    const adds = ['A', 'B', 'C', 'D'].map((title) =>
      start(root, 'add', 'GET', title, '--done-when', 'x', '--lines', '5'),
    );

    await Promise.all([start(root, 'close', 'GET.1', '--commit', sha), ...adds]);

    const tasks = readRoadmap(root).blocks[0]?.tasks ?? [];
    expect(tasks).toHaveLength(6);
    expect(tasks.find((task) => task.id === 'GET.1')?.commit).toBe(sha);
  });

  it('keeps the focus and every block', async () => {
    const root = repo();
    const codes = ['AAA', 'BBB', 'CCC', 'DDD'];

    await Promise.all([start(root, 'focus', 'GET'), ...codes.map((code) => start(root, 'add-block', code, 'Name'))]);

    const roadmap = readRoadmap(root);
    expect(roadmap.focus).toEqual(['GET']);
    expect(roadmap.blocks.map((block) => block.code).toSorted()).toEqual(['GET', ...codes].toSorted());
  });
});
