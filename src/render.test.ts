import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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
    title: Second | with a pipe
    requires: [GET.1]
    doneWhen: two works
    lines: 20
    risky: true
  - id: GET.3
    title: Third
    requires: [GET.2]
    doneWhen: three works
    lines: doc
`;

const RENDERED = `# Roadmap

<!-- Generated from roadmap/ by agentic-roadmap render. Edit the YAML, then run render. -->

## GET · Getting started

| Id | Task | Requires | Done when | Lines |
| - | - | - | - | - |
| ✅ GET.1 | First | — | abc1234: one works | ~10 |
| GET.2 ⚠︎ | Second \\| with a pipe | GET.1 | two works | ~20 |
| GET.3 | Third | GET.2 | three works | doc |
`;

function plan(): string {
  const root = mkdtempSync(join(tmpdir(), 'agentic-roadmap-'));
  initRoadmap(root);
  writeFileSync(join(root, 'roadmap', 'GET.yaml'), BLOCK);
  return root;
}

/** The plan, kept as Markdown at the default path. */
function kept(): string {
  const root = plan();
  writeFileSync(join(root, 'roadmap', 'roadmap.yaml'), 'blocks: [GET]\nmarkdown: docs/roadmap.md\n');
  return root;
}

function capture(args: string[], cwd: string) {
  let text = '';
  const code = run(args, { cwd, env: {}, out: (written) => (text += written) });
  return { code, text };
}

function readRendered(root: string, name = 'docs/roadmap.md'): string {
  return readFileSync(join(root, name), 'utf8');
}

describe('render', () => {
  it('writes the plan as Markdown tables by block, with no progress table', () => {
    const root = plan();

    expect(capture(['render'], root)).toEqual({ code: 0, text: 'Wrote docs/roadmap.md.\n' });
    expect(readRendered(root)).toBe(RENDERED);
  });

  it('writes where the config says, with the focus on top', () => {
    const root = plan();
    writeFileSync(join(root, 'roadmap', 'roadmap.yaml'), 'blocks: [GET]\nfocus: [GET.3]\nmarkdown: PLAN.md\n');

    capture(['render'], root);
    expect(readRendered(root, 'PLAN.md')).toContain('-->\n\nFocus: GET.3\n\n## GET');
    expect(existsSync(join(root, 'docs'))).toBe(false);
  });

  it('writes no Markdown on its own, nor keeps one rendered on demand, unless roadmap.yaml names it', () => {
    const root = plan();
    capture(['add', 'GET', 'Fourth', '--done-when', 'x', '--lines', '5'], root);
    expect(existsSync(join(root, 'docs', 'roadmap.md'))).toBe(false);

    capture(['render'], root);
    writeFileSync(join(root, 'docs', 'roadmap.md'), 'stale\n');
    capture(['add', 'GET', 'Fifth', '--done-when', 'x', '--lines', '5'], root);
    expect(readRendered(root)).toBe('stale\n');
    expect(capture(['check'], root).text).not.toContain('docs/roadmap.md');
  });

  it('keeps the Markdown roadmap.yaml names current when a task is added or the focus changes', () => {
    const root = kept();
    capture(['add', 'GET', 'Fourth', '--done-when', 'x', '--lines', '5'], root);
    expect(readRendered(root)).toContain('| GET.4 | Fourth | — | x | ~5 |\n');
    capture(['focus', 'GET.4'], root);
    expect(readRendered(root)).toContain('Focus: GET.4');
  });

  it('keeps it current when a task is closed', () => {
    const root = kept();
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
    execFileSync(
      'git',
      ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'feat: x'],
      {
        cwd: root,
      },
    );
    capture(['render'], root);

    expect(capture(['close', 'GET.2'], root).code).toBe(0);
    expect(readRendered(root)).toMatch(/\| ✅ GET\.2 ⚠︎ \| .* \| [0-9a-f]{7,}: two works \|/);
  });
});

describe('check on the Markdown', () => {
  it('fails when the Markdown was edited by hand', () => {
    const root = kept();
    capture(['render'], root);
    writeFileSync(join(root, 'docs', 'roadmap.md'), RENDERED.replace('three works', 'three works, roughly'));

    expect(capture(['check'], root).text).toContain(
      'docs/roadmap.md does not match roadmap/: edit the YAML, not the Markdown, then run render',
    );
  });

  it('accepts a table a formatter padded, and a plan with no Markdown at all', () => {
    const root = kept();
    expect(capture(['check'], root).text).not.toContain('docs/roadmap.md');

    const padded = RENDERED.replace('| - | - | - | - | - |', '| ----- | ---- | -------- | --------- | ----- |').replace(
      '| GET.3 | Third |',
      '| GET.3    | Third      |',
    );
    expect(padded).not.toBe(RENDERED);
    capture(['render'], root);
    writeFileSync(join(root, 'docs', 'roadmap.md'), padded);
    expect(capture(['check'], root).text).not.toContain('docs/roadmap.md');
  });
});

describe('status', () => {
  it('shows how much of each block is done, and of the whole plan', () => {
    expect(capture(['status'], plan()).text).toBe(
      'GET · Getting started  1 / 3  33 %\nAll                    1 / 3  33 %\n',
    );
  });

  it('gives it as JSON', () => {
    const progress: unknown = JSON.parse(capture(['status', '--json'], plan()).text);

    expect(progress).toEqual([{ code: 'GET', name: 'Getting started', done: 1, total: 3 }]);
  });
});
