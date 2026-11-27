import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from './cli.ts';
import { initRoadmap, readRoadmap } from './roadmap.repository.ts';

const BLOCK = `name: Getting started
tasks:
  # the base
  - id: GET.1
    title: One
    doneWhen: x
    lines: 10
  - id: GET.2
    title: Two # said twice
    requires: [GET.1]
    confirmed: [GET.1]
    doneWhen: x
    lines: 20
  - id: GET.3
    title: Three
    doneWhen: x
    lines: 30
`;

function plan(): string {
  const root = mkdtempSync(join(tmpdir(), 'agentic-roadmap-'));
  initRoadmap(root);
  writeFileSync(join(root, 'roadmap', 'GET.yaml'), BLOCK);
  return root;
}

function capture(args: string[], cwd: string) {
  let text = '';
  const write = (written: string) => (text += written);
  const code = run(args, { cwd, env: {}, out: write, err: write });
  return { code, text };
}

function readBlock(root: string): string {
  return readFileSync(join(root, 'roadmap', 'GET.yaml'), 'utf8');
}

function readRequires(root: string, id: string): string[] | undefined {
  return readRoadmap(root)
    .blocks.flatMap((block) => block.tasks)
    .find((task) => task.id === id)?.requires;
}

describe('requires', () => {
  it('adds a requirement to a task that had none, after its title, and says what it did to the health', () => {
    const root = plan();

    const { code, text } = capture(['requires', 'GET.3', '--add', 'GET.2'], root);

    expect(code).toBe(0);
    expect(text).toMatch(
      /^GET\.3 now requires GET\.2\. Commit it as «docs: plan GET\.3»\.\nHealth: critical path 30 → 60/,
    );
    expect(readBlock(root)).toContain('    title: Three\n    requires: [GET.2]\n    doneWhen: x\n');
  });

  it('drops a requirement and its confirmation, keeping the comments', () => {
    const root = plan();

    expect(capture(['requires', 'GET.2', '--drop', 'GET.1'], root).text).toContain('GET.2 now requires nothing.');

    expect(readBlock(root)).toBe(BLOCK.replace('    requires: [GET.1]\n    confirmed: [GET.1]\n', ''));
  });

  it('keeps a list written one per line, and the comment on a requirement that stays', () => {
    const root = plan();
    const listed = BLOCK.replace('    requires: [GET.1]\n', '    requires:\n      - GET.1 # needs the base\n');
    writeFileSync(join(root, 'roadmap', 'GET.yaml'), listed);

    capture(['requires', 'GET.2', '--add', 'GET.3'], root);

    expect(readBlock(root)).toContain('    requires:\n      - GET.1 # needs the base\n      - GET.3\n');
  });

  it('adds and drops in one go', () => {
    const root = plan();

    capture(['requires', 'GET.2', '--add', 'GET.3', '--drop', 'GET.1'], root);

    expect(readRequires(root, 'GET.2')).toEqual(['GET.3']);
  });

  it('writes nothing when the change would leave the plan unsound', () => {
    const root = plan();

    expect(capture(['requires', 'GET.1', '--add', 'GET.2'], root)).toEqual({
      code: 1,
      text: 'Not changed: a cycle: GET.1 → GET.2 → GET.1.\n',
    });
    expect(capture(['requires', 'GET.3', '--add', 'GET.9'], root).text).toBe(
      'Not changed: GET.3 requires GET.9, which no task has.\n',
    );
    expect(readBlock(root)).toBe(BLOCK);
  });

  it('refuses a requirement the task already has, one it lacks, a task the plan lacks, and no change at all', () => {
    const root = plan();

    expect(capture(['requires', 'GET.2', '--add', 'GET.1'], root).text).toBe('GET.2 already requires GET.1.\n');
    expect(capture(['requires', 'GET.2', '--drop', 'GET.3'], root).text).toBe('GET.2 does not require GET.3.\n');
    expect(capture(['requires', 'GET.9', '--add', 'GET.1'], root).text).toBe('No task GET.9 in this roadmap.\n');
    expect(capture(['requires', 'GET.2'], root).text).toBe(
      'Say what changes: requires <ID> --add ID,ID, --drop ID,ID, or both.\n',
    );
  });
});
