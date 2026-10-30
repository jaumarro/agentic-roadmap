import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from './cli.ts';
import { initRoadmap, readRoadmap } from './roadmap.repository.ts';

const HEADER = '| Key | Block | Task | Requires | Done when | Lines |\n|---|---|---|---|---|---|\n';

function plan(rows: string): string {
  return `# A plan\n\nProse first.\n\n<!-- roadmap -->\n${HEADER}${rows}\nProse after.\n`;
}

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 'agentic-roadmap-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  initRoadmap(root);
  return root;
}

function capture(args: string[], cwd: string) {
  let text = '';
  const write = (written: string) => (text += written);
  const code = run(args, { cwd, env: {}, out: write, err: write });
  return { code, text };
}

describe('add --from', () => {
  it('adds every row with the next ids, keys in Requires swapped for them', () => {
    const root = repo();
    writeFileSync(
      join(root, 'plan.md'),
      plan('| parse | GET | Parse | GET.1 | x | 40 |\n| report | GET | Report | parse | y | 30 |\n'),
    );

    const added = capture(['add', '--from', 'plan.md'], root);

    expect(added.code).toBe(0);
    expect(added.text).toMatch(/^Added 2 tasks:\n {2}GET\.3 · Parse\n {2}GET\.4 · Report\nHealth: /);
    const tasks = readRoadmap(root).blocks[0]?.tasks ?? [];
    expect(tasks.slice(2).map((task) => [task.id, task.requires])).toEqual([
      ['GET.3', ['GET.1']],
      ['GET.4', ['GET.3']],
    ]);
  });

  it('writes nothing when one row breaks the plan, naming the rows by key', () => {
    const root = repo();
    const before = readFileSync(join(root, 'roadmap', 'GET.yaml'), 'utf8');
    writeFileSync(join(root, 'plan.md'), plan('| a | GET | A | b | x | 5 |\n| b | GET | B | a | x | 5 |\n'));

    expect(capture(['add', '--from', 'plan.md'], root)).toEqual({
      code: 1,
      text: 'Nothing added: a cycle: a → b → a.\n',
    });
    expect(readFileSync(join(root, 'roadmap', 'GET.yaml'), 'utf8')).toBe(before);
  });

  it('names a key with a dollar sign as it is written', () => {
    const root = repo();
    writeFileSync(join(root, 'plan.md'), plan('| $& | GET | A | GET.99 | x | 5 |\n'));

    expect(capture(['add', '--from', 'plan.md'], root).text).toBe(
      'Nothing added: $& requires GET.99, which no task has.\n',
    );
  });

  it('puts back what it wrote when a later block cannot be written', () => {
    const root = repo();
    capture(['add-block', 'NEW', 'New'], root);
    const before = readFileSync(join(root, 'roadmap', 'GET.yaml'), 'utf8');
    writeFileSync(join(root, 'plan.md'), plan('| a | GET | A | — | x | 5 |\n| b | NEW | B | — | x | 5 |\n'));
    chmodSync(join(root, 'roadmap', 'NEW.yaml'), 0o444);

    expect(capture(['add', '--from', 'plan.md'], root)).toEqual({
      code: 1,
      text: 'Could not write roadmap/NEW.yaml: EACCES.\n',
    });
    expect(readFileSync(join(root, 'roadmap', 'GET.yaml'), 'utf8')).toBe(before);
  });

  it('refuses a block the roadmap lacks, and a title given with --from', () => {
    const root = repo();
    writeFileSync(join(root, 'plan.md'), plan('| a | NEW | A | — | x | 5 |\n'));

    expect(capture(['add', '--from', 'plan.md'], root).text).toContain('a: no block NEW in this roadmap');
    expect(capture(['add', 'GET', 'Title', '--from', 'plan.md'], root).text).toContain('not both');
  });
});
