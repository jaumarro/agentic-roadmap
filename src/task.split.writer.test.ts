import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from './cli.ts';
import { initRoadmap, readRoadmap } from './roadmap.repository.ts';

const GET = `name: Getting started
tasks:
  - id: GET.1
    title: One
    doneWhen: one works
    lines: 10
    commit: 'abc1234'
  # the big one
  - id: GET.2
    title: Two
    requires: [GET.1]
    doneWhen: two works
    lines: 200
    risky: true
    ref: docs/spec.md#two
  - id: GET.3
    title: Three
    requires:
      - GET.2 # the whole of it
      - GET.1
    confirmed: [GET.2]
    doneWhen: three works
    lines: 30
`;

const MOR = `name: More
tasks:
  - id: MOR.1
    title: Later
    requires: [GET.2]
    doneWhen: later works
    lines: 20
`;

function plan(): string {
  const root = mkdtempSync(join(tmpdir(), 'agentic-roadmap-'));
  initRoadmap(root);
  writeFileSync(join(root, 'roadmap', 'roadmap.yaml'), 'blocks: [GET, MOR]\n');
  writeFileSync(join(root, 'roadmap', 'GET.yaml'), GET);
  writeFileSync(join(root, 'roadmap', 'MOR.yaml'), MOR);
  return root;
}

function capture(args: string[], cwd: string) {
  let text = '';
  const write = (written: string) => (text += written);
  const code = run(args, { cwd, env: {}, out: write, err: write });
  return { code, text };
}

function readFiles(root: string): string {
  return ['GET', 'MOR'].map((code) => readFileSync(join(root, 'roadmap', `${code}.yaml`), 'utf8')).join('');
}

const SECOND = ['Two, the rest', '--done-when', 'the rest works', '--lines', '80'];

describe('split', () => {
  it('keeps the task as the first part and puts the second after it, with what waited on it moved over', () => {
    const root = plan();

    const { code, text } = capture(['split', 'GET.2', ...SECOND], root);

    expect(code).toBe(0);
    expect(text).toContain('Split GET.2: it keeps ~120 lines, and GET.4 · Two, the rest, after it, is ~80 lines.\n');
    expect(text).toContain('What waited on GET.2 now waits on GET.4: GET.3, MOR.1.\n');
    expect(text).toContain("Review GET.2's «Done when» in roadmap/GET.yaml, then commit it as «docs: plan GET.2».\n");
    expect(text).toContain('Health: ');
    const [get, more] = readRoadmap(root).blocks;
    expect(get?.tasks.map((task) => task.id)).toEqual(['GET.1', 'GET.2', 'GET.4', 'GET.3']);
    expect(get?.tasks[1]).toMatchObject({ lines: 120, requires: ['GET.1'], doneWhen: 'two works' });
    expect(get?.tasks[2]).toEqual({
      id: 'GET.4',
      title: 'Two, the rest',
      requires: ['GET.2'],
      doneWhen: 'the rest works',
      lines: 80,
      risky: true,
      ref: 'docs/spec.md#two',
    });
    expect(get?.tasks[3]?.requires).toEqual(['GET.4', 'GET.1']);
    // Confirmed for the whole of GET.2, not for its second part: health asks again.
    expect(get?.tasks[3]?.confirmed).toBeUndefined();
    expect(more?.tasks[0]?.requires).toEqual(['GET.4']);
    expect(readFiles(root)).toContain('  # the big one\n  - id: GET.2\n');
    expect(readFiles(root)).toContain('    requires:\n      - GET.4 # the whole of it\n      - GET.1\n');
    expect(capture(['check'], root).text).not.toContain('requires');
  });

  it('takes what the first part keeps when told, and asks when the second part would leave it nothing', () => {
    const root = plan();

    expect(capture(['split', 'GET.2', 'All of it', '--done-when', 'x', '--lines', '200'], root)).toEqual({
      code: 1,
      text: "The second part takes all of GET.2's ~200 lines: say what it keeps, --keep N.\n",
    });
    capture(['split', 'GET.2', 'All of it', '--done-when', 'x', '--lines', '200', '--keep', '50'], root);
    expect(readRoadmap(root).blocks[0]?.tasks[1]?.lines).toBe(50);
  });

  it('says the size of each part when the second takes nothing from the first', () => {
    const text = capture(['split', 'GET.2', 'Write it up', '--done-when', 'x', '--lines', 'doc'], plan()).text;

    expect(text).toContain('Split GET.2: it keeps ~200 lines, and GET.4 · Write it up, after it, is a document.\n');
  });

  it('changes no block file when one of them cannot be written', () => {
    const root = plan();
    const before = readFiles(root);
    chmodSync(join(root, 'roadmap', 'MOR.yaml'), 0o444);

    expect(capture(['split', 'GET.2', ...SECOND], root)).toEqual({
      code: 1,
      text: 'Could not write roadmap/MOR.yaml: EACCES.\n',
    });
    expect(readFiles(root)).toBe(before);
  });

  it('refuses a done task, a task the plan lacks, and a second part with no title or done when', () => {
    const root = plan();
    const before = readFiles(root);

    expect(capture(['split', 'GET.1', ...SECOND], root).text).toBe(
      'GET.1 is done with abc1234: only a task left to do splits.\n',
    );
    expect(capture(['split', 'GET.9', ...SECOND], root).text).toBe('No task GET.9 in this roadmap.\n');
    expect(capture(['split', 'GET.2'], root).text).toContain('Say the task and the second part');
    expect(capture(['split', 'GET.2', 'Rest', '--lines', '5'], root).text).toBe(
      'Say when the second part is done: --done-when TEXT.\n',
    );
    expect(capture(['split', 'GET.2', 'a\nb', '--done-when', 'x', '--lines', '5'], root).text).toBe(
      'Not split: title holds a line break, and it is one line.\n',
    );
    expect(capture(['split', '../../x.1', ...SECOND], root).text).toBe('No task ../../x.1 in this roadmap.\n');
    expect(readFiles(root)).toBe(before);
  });
});
