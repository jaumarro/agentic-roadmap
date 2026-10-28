import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from './cli.ts';
import { initRoadmap } from './source.ts';

function plan(): string {
  const root = mkdtempSync(join(tmpdir(), 'agentic-roadmap-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  initRoadmap(root);
  writeFileSync(join(root, 'roadmap', 'roadmap.yaml'), 'blocks: [GET, MOR]\n');
  writeFileSync(
    join(root, 'roadmap', 'GET.yaml'),
    "name: Getting started\ntasks:\n  - id: GET.1\n    title: First\n    doneWhen: x\n    lines: 1\n    commit: 'abc1234'\n  - id: GET.2\n    title: Second\n    requires: [GET.1]\n    doneWhen: x\n    lines: 1\n",
  );
  writeFileSync(
    join(root, 'roadmap', 'MOR.yaml'),
    'name: More\ntasks:\n  - id: MOR.1\n    title: Later\n    requires: [GET.2]\n    doneWhen: x\n    lines: 1\n',
  );
  return root;
}

function capture(args: string[], cwd: string) {
  let text = '';
  const code = run(args, { cwd, env: {}, out: (written) => (text += written) });
  return { code, text };
}

describe('list', () => {
  it('gives every task by block, with its state', () => {
    expect(capture(['list'], plan()).text).toBe(
      [
        'GET · Getting started (1/2 done)',
        '  GET.1  done     First',
        '  GET.2  ready    Second',
        'MOR · More (0/1 done)',
        '  MOR.1  waiting  Later',
        '',
      ].join('\n'),
    );
  });

  it('narrows by block and by state', () => {
    const root = plan();

    expect(capture(['list', '--block', 'MOR'], root).text).toBe('MOR · More (0/1 done)\n  MOR.1  waiting  Later\n');
    expect(capture(['list', '--state', 'ready'], root).text).toBe(
      'GET · Getting started (1/2 done)\n  GET.2  ready    Second\n',
    );
  });

  it('shows a task on a branch as started', () => {
    const root = plan();
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'x'], {
      cwd: root,
    });
    execFileSync('git', ['branch', 'get-2/second'], { cwd: root });

    expect(capture(['list', '--state', 'started'], root).text).toContain('GET.2  started  Second');
  });

  it('gives the rows as JSON', () => {
    const rows: unknown = JSON.parse(capture(['list', '--state', 'waiting', '--json'], plan()).text);

    expect(rows).toEqual([
      {
        id: 'MOR.1',
        block: 'MOR',
        state: 'waiting',
        title: 'Later',
        risky: false,
        wave: 2,
        critical: true,
        track: false,
      },
    ]);
  });

  it('refuses a state or block it does not know, and says when nothing matches', () => {
    const root = plan();

    expect(capture(['list', '--state', 'blocked'], root)).toEqual({
      code: 1,
      text: '--state is one of done, started, ready, waiting.\n',
    });
    expect(capture(['list', '--block', 'XYZ'], root)).toEqual({ code: 1, text: 'No block XYZ in this roadmap.\n' });
    expect(capture(['list', '--block', 'MOR', '--state', 'done'], root).text).toBe('No task matches.\n');
  });
});

function task(id: string, lines: number, requires = '', commit = ''): string {
  return `  - id: ${id}\n    title: Do ${id}\n${requires}    doneWhen: x\n    lines: ${lines}\n${commit}`;
}

function waves(focus = ''): string {
  const root = mkdtempSync(join(tmpdir(), 'agentic-roadmap-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  initRoadmap(root);
  writeFileSync(
    join(root, 'roadmap', 'roadmap.yaml'),
    `blocks: [GET, SID]\nchapters: [{ name: Main, blocks: [GET] }]\n${focus}`,
  );
  writeFileSync(
    join(root, 'roadmap', 'GET.yaml'),
    `name: G\ntasks:\n${[
      task('GET.1', 10, '', "    commit: 'abc1234'\n"),
      task('GET.2', 30, '    requires: [GET.1]\n'),
      task('GET.3', 10),
      task('GET.4', 50, '    requires: [GET.2]\n'),
    ].join('')}`,
  );
  writeFileSync(join(root, 'roadmap', 'SID.yaml'), `name: S\ntasks:\n${task('SID.1', 10)}`);
  return root;
}

describe('list --by wave', () => {
  it('gives the tasks left in waves, critical ones marked, and the parallel tracks apart', () => {
    expect(capture(['list', '--by', 'wave'], waves()).text).toBe(
      [
        'Wave 1 · 2 tasks',
        '  GET.2  ready    Do GET.2 (critical)',
        '  GET.3  ready    Do GET.3',
        'Wave 2 · 1 task',
        '  GET.4  waiting  Do GET.4 (critical)',
        '',
        'Parallel tracks',
        'Wave 1 · 1 task',
        '  SID.1  ready    Do SID.1',
        '',
      ].join('\n'),
    );
  });

  it('puts focused tasks first within their wave, without moving them to another', () => {
    const text = capture(['list', '--by', 'wave'], waves('focus: [GET.3, GET.4]\n')).text;

    expect(text).toMatch(/^Wave 1 · 2 tasks\n {2}GET\.3 .*\n {2}GET\.2 .*\nWave 2 · 1 task\n {2}GET\.4 /);
  });

  it('gives each row its wave as JSON, and refuses a grouping it does not know', () => {
    const root = waves();
    const rows: unknown = JSON.parse(capture(['list', '--by', 'wave', '--json'], root).text);

    expect(rows).toMatchObject([
      { id: 'GET.2', wave: 1 },
      { id: 'GET.3', wave: 1 },
      { id: 'GET.4', wave: 2 },
      { id: 'SID.1' },
    ]);
    expect(capture(['list', '--by', 'size'], root)).toEqual({ code: 1, text: '--by is block or wave.\n' });
  });
});
