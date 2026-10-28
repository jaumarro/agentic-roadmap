import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from './cli.ts';
import { initRoadmap } from './source.ts';

function capture(args: string[], cwd: string) {
  let text = '';
  const write = (written: string) => (text += written);
  const code = run(args, { cwd, env: {}, out: write, err: write });
  return { code, text };
}

function task(id: string, requires: string[] = []): string {
  return `  - id: ${id}\n    title: Do ${id}\n    requires: [${requires.join(', ')}]\n    doneWhen: x\n    lines: 10\n`;
}

/** A plan whose blocks hold `tasks`, by code, under `config`. */
function plan(config: string, blocks: Record<string, string[]>): string {
  const root = mkdtempSync(join(tmpdir(), 'agentic-roadmap-'));
  initRoadmap(root);
  writeFileSync(join(root, 'roadmap', 'roadmap.yaml'), config);
  for (const [code, tasks] of Object.entries(blocks)) {
    writeFileSync(join(root, 'roadmap', `${code}.yaml`), `name: Block ${code}\ntasks:\n${tasks.join('')}`);
  }
  return root;
}

const CHAPTERS = `blocks: [ONE, TWO, TRK]
chapters:
  - name: First
    blocks: [ONE]
  - name: Second
    blocks: [TWO]
warnings:
  blockSize: [1, 25]
`;

describe('chapters', () => {
  it('refuses a requirement on a later chapter or on a track, and lets a track require any chapter', () => {
    const root = plan(CHAPTERS, {
      ONE: [task('ONE.1', ['TWO.1']), task('ONE.2', ['TRK.1'])],
      TWO: [task('TWO.1')],
      TRK: [task('TRK.1', ['TWO.1'])],
    });

    expect(capture(['check'], root)).toEqual({
      code: 1,
      text: 'The plan has problems:\n  ONE.1 requires TWO.1, from a later chapter\n  ONE.2 requires TRK.1, from a parallel track\n',
    });
  });

  it('refuses a chapter naming a block the plan lacks, or a block in two chapters', () => {
    const root = plan(
      'blocks: [ONE]\nchapters:\n  - name: A\n    blocks: [ONE, NOPE]\n  - name: B\n    blocks: [ONE]\n',
      {
        ONE: [task('ONE.1')],
      },
    );

    expect(capture(['check'], root).text).toBe(
      'The plan has problems:\n  a chapter names block NOPE, which the plan does not list\n  block ONE is in more than one chapter\n' +
        'Warnings, which do not fail it:\n  ONE has 1 task, outside 5 to 25\n',
    );
  });

  it('leaves a track out of next and free unless the focus names it', () => {
    const root = plan(CHAPTERS, { ONE: [task('ONE.1')], TWO: [task('TWO.1')], TRK: [task('TRK.1')] });

    expect(capture(['free', '9'], root).text).not.toContain('TRK.1');
    writeFileSync(join(root, 'roadmap', 'roadmap.yaml'), `${CHAPTERS}focus: [TRK]\n`);
    expect(capture(['next'], root).text).toMatch(/^Next: TRK\.1/);
  });
});

describe('warnings', () => {
  it('warns on a block outside 5 to 25 tasks and a long chain, without failing check', () => {
    const chain = ['ONE.1', 'ONE.2', 'ONE.3', 'ONE.4', 'ONE.5', 'ONE.6'].map((id, at, ids) =>
      task(id, at === 0 ? [] : [ids[at - 1] ?? '']),
    );
    const root = plan('blocks: [ONE, TWO]\n', { ONE: chain, TWO: [task('TWO.1')] });

    expect(capture(['check'], root)).toEqual({
      code: 0,
      text:
        'The plan is sound.\nWarnings, which do not fail it:\n  TWO has 1 task, outside 5 to 25\n' +
        '  ONE.6 ends a chain of 6 pending tasks in its block\n',
    });
  });

  it('warns on a block waiting on more blocks than the config allows', () => {
    const root = plan('blocks: [AAA, BBB, CCC]\nwarnings:\n  blockSize: [1, 25]\n  blocksWaitedOn: 1\n', {
      AAA: [task('AAA.1')],
      BBB: [task('BBB.1')],
      CCC: [task('CCC.1', ['AAA.1', 'BBB.1'])],
    });

    expect(capture(['check'], root).text).toContain('  CCC waits on AAA, BBB\n');
  });
});
