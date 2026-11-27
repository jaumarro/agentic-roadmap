import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from './cli.ts';
import { initRoadmap } from './roadmap.repository.ts';

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
    // The share of requirements across blocks says nothing to act on: it stays in --json only.
    expect(text).not.toContain('Across blocks');
  });

  it('asks about the requirements whose absence would shorten the critical path', () => {
    expect(capture(['health'], roadmap(QUEUE)).text).toContain(
      "Worth asking, as a no shortens the critical path; a yes goes under the task's confirmed: and is not asked again:\n" +
        '  Does GET.2 need GET.1? Without it, ~40 lines shorter.\n' +
        '  Does GET.3 need GET.2? Without it, ~40 lines shorter.\n',
    );
  });

  it('stops asking about a requirement the task lists as confirmed', () => {
    const confirmed = QUEUE.replace('    requires: [GET.1]\n', '    requires: [GET.1]\n    confirmed: [GET.1]\n');
    const text = capture(['health'], roadmap(confirmed)).text;

    expect(text).not.toContain('Does GET.2 need GET.1?');
    expect(text).toContain('Does GET.3 need GET.2?');
  });

  it('fails check on a confirmed requirement the task does not have', () => {
    const stray = QUEUE.replace('    requires: [GET.1]\n', '    requires: [GET.1]\n    confirmed: [GET.3]\n');

    expect(capture(['check'], roadmap(stray)).text).toContain('  GET.2 confirms GET.3, which it does not require\n');
  });

  it('fails with --strict when there is a problem', () => {
    expect(capture(['health', '--strict'], roadmap(QUEUE)).code).toBe(1);
  });

  it('gives the same figures as JSON', () => {
    const health: unknown = JSON.parse(capture(['health', '--json'], roadmap(QUEUE)).text);

    expect(health).toMatchObject({ width: 1, workLeft: 120 });
  });

  it('adds how long N sessions take, as text and as JSON, and refuses a number that is none', () => {
    const root = roadmap(QUEUE);

    expect(capture(['health', '--sessions', '2'], root).text).toContain(
      '  Sessions        2 sessions take ~120 lines end to end, ~0 over the critical path · idle 50 % of the time\n',
    );
    const health: unknown = JSON.parse(capture(['health', '--sessions', '2', '--json'], root).text);
    expect(health).toMatchObject({ workLeft: 120, sessions: { count: 2, span: 120, idle: 0.5 } });
    expect(capture(['health', '--sessions', 'many'], root)).toEqual({
      code: 1,
      text: '--sessions is a positive whole number of sessions.\n',
    });
    expect(capture(['health', '--sessions', '2', '--against', 'main'], root).text).toBe(
      'health takes --sessions or --against, not both.\n',
    );
  });

  it('says there is nothing to measure once everything is done', () => {
    const done = "name: G\ntasks:\n  - id: GET.1\n    title: a\n    doneWhen: x\n    lines: 1\n    commit: 'abc1234'\n";

    expect(capture(['health'], roadmap(done)).text).toBe('Everything is done: there is no plan left to measure.\n');
  });
});
