import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from './cli.ts';
import { initRoadmap, readRoadmap } from './roadmap.repository.ts';

function project(): string {
  const root = mkdtempSync(join(tmpdir(), 'agentic-roadmap-'));
  initRoadmap(root);
  return root;
}

function capture(args: string[], cwd: string) {
  let text = '';
  const write = (written: string) => (text += written);
  const code = run(args, { cwd, env: {}, out: write, err: write });
  return { code, text };
}

describe('add-block', () => {
  it('starts a block after the others, keeping roadmap.yaml as it was written', () => {
    const root = project();

    expect(capture(['add-block', 'LOG', 'Login: email'], root)).toEqual({
      code: 0,
      text: 'Started LOG in roadmap/LOG.yaml. Add its tasks with add LOG "…", then commit it as «docs: plan LOG».\n',
    });
    expect(readFileSync(join(root, 'roadmap', 'roadmap.yaml'), 'utf8')).toMatch(
      /^# The blocks of the plan.*\nblocks: \[GET, LOG\]\n$/,
    );
    expect(readRoadmap(root).blocks.at(-1)).toEqual({ code: 'LOG', name: 'Login: email', tasks: [] });
  });

  it('takes tasks from add once started', () => {
    const root = project();
    capture(['add-block', 'LOG', 'Login'], root);

    expect(capture(['add', 'LOG', 'Sign in', '--done-when', 'x', '--lines', '20'], root).code).toBe(0);
    expect(
      readRoadmap(root)
        .blocks.at(-1)
        ?.tasks.map((task) => task.id),
    ).toEqual(['LOG.1']);
  });

  it('refuses a code the plan has, a code that is no code, and a file already there', () => {
    const root = project();
    writeFileSync(join(root, 'roadmap', 'OLD.yaml'), 'name: Old\ntasks: []\n');

    expect(capture(['add-block', 'GET', 'Again'], root).text).toBe('The plan already has GET.\n');
    expect(capture(['add-block', 'log', 'Login'], root).text).toBe(
      'log is no block code: capital letters and digits, as ABC.\n',
    );
    expect(capture(['add-block', 'OLD', 'Old'], root).text).toBe(
      'roadmap/OLD.yaml already exists; add OLD to roadmap.yaml.\n',
    );
  });

  it('refuses a name a title could not hold, and writes nothing', () => {
    const root = project();

    expect(capture(['add-block', 'NEW', 'a\u001b[31m'], root)).toEqual({
      code: 1,
      text: 'The name holds a control character, as an escape sequence.\n',
    });
    expect(existsSync(join(root, 'roadmap', 'NEW.yaml'))).toBe(false);
  });
});
