import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from './cli.ts';
import { initRoadmap } from './source.ts';

const BLOCK = `name: G
tasks:
  - id: GET.1
    title: One
    doneWhen: one works
    lines: 10
  - id: GET.2
    title: Two
    doneWhen: two works
    lines: 10
  - id: GET.3
    title: Three
    doneWhen: three works
    lines: 10
  - id: GET.4
    title: Four
    requires: [GET.1]
    doneWhen: four works
    lines: 10
`;

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'agentic-roadmap-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  initRoadmap(root);
  writeFileSync(join(root, 'roadmap', 'GET.yaml'), BLOCK);
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'x'], {
    cwd: root,
  });
  return root;
}

function capture(args: string[], cwd: string) {
  let text = '';
  const code = run(args, { cwd, env: {}, out: (written) => (text += written) });
  return { code, text };
}

describe('free', () => {
  it('hands out different free tasks, one per session, each with its branch', () => {
    expect(capture(['free', '2'], repo()).text).toBe(
      '1. GET.1 · One\n   Branch: get-1/…\n2. GET.2 · Two\n   Branch: get-2/…\n',
    );
  });

  it('leaves out a task a branch started, and says when fewer are free than asked', () => {
    const root = repo();
    execFileSync('git', ['branch', 'get-1/one'], { cwd: root });

    expect(capture(['free', '5'], root).text).toBe(
      '1. GET.2 · Two\n   Branch: get-2/…\n2. GET.3 · Three\n   Branch: get-3/…\nOnly 2 free, of the 5 asked.\n',
    );
  });

  it('gives the same rows as next, as JSON', () => {
    const root = repo();
    const free: unknown = JSON.parse(capture(['free', '3', '--json'], root).text);
    const next: unknown = JSON.parse(capture(['next', '--json'], root).text);

    expect(free).toEqual([
      { id: 'GET.1', block: 'GET', title: 'One', doneWhen: 'one works', branch: 'get-1/' },
      { id: 'GET.2', block: 'GET', title: 'Two', doneWhen: 'two works', branch: 'get-2/' },
      { id: 'GET.3', block: 'GET', title: 'Three', doneWhen: 'three works', branch: 'get-3/' },
    ]);
    expect(next).toMatchObject({ next: { id: 'GET.1' }, ready: [{ id: 'GET.2' }, { id: 'GET.3' }], inProgress: [] });
  });

  it('refuses a count that is not a positive whole number', () => {
    expect(capture(['free', 'two'], repo())).toEqual({
      code: 1,
      text: 'free takes a positive whole number of tasks.\n',
    });
  });
});
