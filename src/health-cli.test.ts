import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from './cli.ts';
import { initRoadmap } from './source.ts';

function roadmap(block: string): string {
  const root = mkdtempSync(join(tmpdir(), 'agentic-roadmap-'));
  initRoadmap(root);
  writeFileSync(join(root, 'roadmap', 'GET.yaml'), block);
  return root;
}

function capture(args: string[], cwd: string) {
  let text = '';
  const write = (written: string) => (text += written);
  const code = run(args, { cwd, env: {}, out: write, err: write });
  return { code, text };
}

const QUEUE = `name: G
tasks:
  - id: GET.1
    title: a
    doneWhen: x
    lines: 40
  - id: GET.2
    title: b
    requires: [GET.1]
    doneWhen: x
    lines: 40
  - id: GET.3
    title: c
    requires: [GET.2]
    doneWhen: x
    lines: 40
`;

describe('health', () => {
  it('prints the shape and the problems, worst first', () => {
    const { code, text } = capture(['health'], roadmap(QUEUE));

    expect(code).toBe(0);
    expect(text).toContain('Plan health: 3 tasks left, ~120 lines');
    expect(text).toContain('Critical path   ~120 lines over 3 tasks: GET.1 → GET.2 → GET.3');
    expect(text).toContain('Parallelism     1.0');
    expect(text).toContain('1. The plan is a queue');
  });

  it('fails with --strict when there is a problem', () => {
    expect(capture(['health', '--strict'], roadmap(QUEUE)).code).toBe(1);
  });

  it('gives the same figures as JSON', () => {
    const health: unknown = JSON.parse(capture(['health', '--json'], roadmap(QUEUE)).text);

    expect(health).toMatchObject({ width: 1, workLeft: 120 });
  });

  it('says there is nothing to measure once everything is done', () => {
    const done = "name: G\ntasks:\n  - id: GET.1\n    title: a\n    doneWhen: x\n    lines: 1\n    commit: 'abc1234'\n";

    expect(capture(['health'], roadmap(done)).text).toBe('Everything is done: there is no plan left to measure.\n');
  });
});
