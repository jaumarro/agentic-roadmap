import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from './cli.ts';
import { initRoadmap } from './source.ts';

const BLOCK = `name: Getting started
tasks:
  - id: GET.1
    title: First
    doneWhen: one works
    lines: 10
    commit: 'abc1234'
  - id: GET.2
    title: Second
    requires: [GET.1]
    doneWhen: two works
    lines: 20
  - id: GET.3
    title: Third
    requires: [GET.2]
    doneWhen: three works
    lines: doc
`;

function plan(): string {
  const root = mkdtempSync(join(tmpdir(), 'agentic-roadmap-'));
  initRoadmap(root);
  writeFileSync(join(root, 'roadmap', 'GET.yaml'), BLOCK);
  return root;
}

function capture(args: string[], cwd: string) {
  let text = '';
  const code = run(args, { cwd, env: {}, out: (written) => (text += written) });
  return { code, text };
}

describe('show', () => {
  it('prints a task with its block, size, state, requirements and what it unblocks', () => {
    expect(capture(['show', 'GET.2'], plan()).text).toBe(
      [
        'GET.2 · Second',
        '  Block: GET · Getting started',
        '  Done when: two works',
        '  Size: ~20 lines',
        '  Ready to take.',
        'Requires:',
        '  GET.1 · First (done)',
        'Unblocks:',
        '  GET.3 · Third (waiting)',
        '',
      ].join('\n'),
    );
  });

  it('gives the same as JSON', () => {
    const shown: unknown = JSON.parse(capture(['show', 'GET.1', '--json'], plan()).text);

    expect(shown).toMatchObject({ id: 'GET.1', state: 'done', commit: 'abc1234', unblocks: [{ id: 'GET.2' }] });
  });

  it('fails on a task the plan does not have', () => {
    expect(capture(['show', 'GET.9'], plan())).toEqual({ code: 1, text: 'No task GET.9 in this roadmap.\n' });
  });

  it('marks a risky task in show and in list', () => {
    const root = plan();
    writeFileSync(
      join(root, 'roadmap', 'GET.yaml'),
      BLOCK.replace('    lines: 20\n', '    lines: 20\n    risky: true\n'),
    );

    const shown = capture(['show', 'GET.2'], root).text;
    expect(shown).toMatch(/^GET\.2 · Second ⚠︎\n/);
    expect(shown).toContain('  Risky: it gets a full review.\n');
    expect(capture(['list'], root).text).toContain('GET.2  ready    Second ⚠︎\n');
    expect(capture(['list'], root).text).toContain('GET.3  waiting  Third\n');
  });
});

describe('why', () => {
  it('walks what a task waits on down to what can be taken', () => {
    expect(capture(['why', 'GET.3'], plan()).text).toBe('GET.3 waits on:\n  GET.2 · Second (ready)\n');
  });

  it('says a ready task waits on nothing and a done one is done', () => {
    const root = plan();

    expect(capture(['why', 'GET.2'], root).text).toBe('GET.2 waits on nothing: it is ready.\n');
    expect(capture(['why', 'GET.1'], root).text).toBe('GET.1 is done.\n');
  });

  it('gives the tree as JSON', () => {
    const answer: unknown = JSON.parse(capture(['why', 'GET.3', '--json'], plan()).text);

    expect(answer).toEqual({
      id: 'GET.3',
      state: 'waiting',
      waitsOn: [{ id: 'GET.2', title: 'Second', state: 'ready', seenAbove: false, waitsOn: [] }],
    });
  });
});
