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

    expect(rows).toEqual([{ id: 'MOR.1', block: 'MOR', state: 'waiting', title: 'Later', risky: false }]);
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
