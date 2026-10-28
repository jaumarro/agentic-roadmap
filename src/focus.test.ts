import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from './cli.ts';
import { initRoadmap } from './source.ts';

const CONFIG = `# Blocks in reading order.
blocks: [ABC, XYZ]
`;

const ABC = `name: First
tasks:
  - id: ABC.1
    title: One
    doneWhen: x
    lines: 10
  - id: ABC.2
    title: Two
    doneWhen: x
    lines: 10
  - id: ABC.3
    title: Three
    doneWhen: x
    lines: 10
`;

const XYZ = `name: Second
tasks:
  - id: XYZ.1
    title: Last block
    doneWhen: x
    lines: 10
`;

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'agentic-roadmap-'));
  initRoadmap(root);
  writeFileSync(join(root, 'roadmap', 'roadmap.yaml'), CONFIG);
  writeFileSync(join(root, 'roadmap', 'ABC.yaml'), ABC);
  writeFileSync(join(root, 'roadmap', 'XYZ.yaml'), XYZ);
  return root;
}

function capture(args: string[], cwd: string) {
  let text = '';
  const write = (written: string) => (text += written);
  const code = run(args, { cwd, env: {}, out: write, err: write });
  return { code, text };
}

function readOrder(root: string): string[] {
  const free: unknown = JSON.parse(capture(['free', '9', '--json'], root).text);
  if (!Array.isArray(free)) throw new Error('free --json gave no list');
  return free.map((task: unknown) =>
    typeof task === 'object' && task !== null && 'id' in task ? String(task.id) : '',
  );
}

describe('focus', () => {
  it('puts the blocks and tasks it names first, in its order, and keeps the config comments', () => {
    const root = folder();

    expect(capture(['focus', 'XYZ', 'ABC.3'], root).code).toBe(0);
    expect(readFileSync(join(root, 'roadmap', 'roadmap.yaml'), 'utf8')).toBe(`${CONFIG}focus: [XYZ, ABC.3]\n`);
    expect(readOrder(root)).toEqual(['XYZ.1', 'ABC.3', 'ABC.1', 'ABC.2']);
    expect(capture(['next'], root).text).toMatch(/^Next: XYZ\.1/);
  });

  it('clears the focus, back to the plan as it reads', () => {
    const root = folder();
    capture(['focus', 'XYZ'], root);

    expect(capture(['focus', '--clear'], root).code).toBe(0);
    expect(readFileSync(join(root, 'roadmap', 'roadmap.yaml'), 'utf8')).toBe(CONFIG);
    expect(readOrder(root)).toEqual(['ABC.1', 'ABC.2', 'ABC.3', 'XYZ.1']);
  });

  it('refuses a focus naming no block or task, and check finds one written by hand', () => {
    const root = folder();

    expect(capture(['focus', 'NOPE'], root)).toEqual({
      code: 1,
      text: 'The focus would leave the plan unsound:\n  the focus names NOPE, which is no block or task\n',
    });
    writeFileSync(join(root, 'roadmap', 'roadmap.yaml'), `${CONFIG}focus: [ABC.9]\n`);
    expect(capture(['check'], root).text).toContain('the focus names ABC.9, which is no block or task');
    expect(capture(['focus', 'ABC'], root).code).toBe(0);
  });

  it('asks for something to focus on, or --clear alone', () => {
    const root = folder();

    expect(capture(['focus'], root).code).toBe(1);
    expect(capture(['focus', 'ABC', '--clear'], root).text).toBe('focus takes blocks and tasks, or --clear.\n');
  });
});
