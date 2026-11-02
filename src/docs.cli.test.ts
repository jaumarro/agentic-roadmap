import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { run } from './cli.ts';
import { checkRoadmap } from './check.service.ts';
import { readPlanTable } from './plan-table.parser.ts';
import { readRoadmap, readRoadmapWith } from './roadmap.repository.ts';
import type { Task } from './roadmap.model.ts';

const temporary: string[] = [];

function project(): string {
  const root = mkdtempSync(join(tmpdir(), 'agentic-roadmap-docs-'));
  temporary.push(root);
  return root;
}

afterEach(() => {
  for (const root of temporary.splice(0)) rmSync(root, { recursive: true, force: true });
});

function document(file: string): string {
  return readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
}

function fences(text: string, language: string): string[] {
  return [...text.matchAll(new RegExp('```' + language + '\\n([\\s\\S]*?)```', 'g'))].map((match) => match[1] ?? '');
}

function command(root: string, args: string[]): string {
  let out = '';
  let err = '';
  const code = run(args, {
    cwd: root,
    env: {},
    out: (text) => {
      out += text;
    },
    err: (text) => {
      err += text;
    },
  });
  expect({ args, code, err }).toEqual({ args, code: 0, err: '' });
  return out;
}

function git(root: string, args: string[]): void {
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Docs Test',
      '-c',
      'user.email=docs@example.com',
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    { cwd: root, stdio: 'pipe' },
  );
}

describe('documented examples', () => {
  it('takes the README quickstart from a new plan to its first closed task', () => {
    const root = project();
    git(root, ['init', '-b', 'main']);
    const start = document('README.md').split('## Get started\n')[1]?.split('## Use it with coding agents')[0] ?? '';
    const examples = fences(start, 'bash').slice(1); // Dependency installation is outside the workflow under test.
    expect(examples).toHaveLength(3);

    for (const example of examples) {
      for (const line of example.trim().split('\n')) {
        // The quickstart uses only space-separated arguments and double-quoted text, never shell evaluation.
        const args = [...line.matchAll(/"([^"]*)"|(\S+)/g)].map((match) => match[1] ?? match[2] ?? '');
        const prefix = args[0] === 'git' ? ['git'] : ['pnpm', 'exec', 'roadmap'];
        expect(args.slice(0, prefix.length)).toEqual(prefix);
        if (args[0] === 'git') git(root, args.slice(1));
        else {
          if (args[3] === 'close') {
            // The prose between examples asks the reader to implement, check and commit their feature.
            writeFileSync(join(root, 'sign-in.txt'), 'Implemented sign-in for the documentation fixture.\n');
            git(root, ['add', 'sign-in.txt']);
            git(root, ['commit', '-m', 'feat: sign in with email']);
          }
          command(root, args.slice(3));
        }
      }
    }

    const login = readRoadmap(root).blocks.find((block) => block.code === 'LOG');
    expect(login?.tasks[0]?.commit).toMatch(/^[0-9a-f]{7,40}$/);
    expect(login?.tasks[1]?.requires).toEqual(['LOG.1']);
    expect(command(root, ['next', '--json'])).toContain('"id": "LOG.2"');
    expect(JSON.parse(command(root, ['check', '--json']))).toMatchObject({ sound: true, problems: [] });
  });

  it('reads the documented YAML as a valid chapter plan with a parallel track', () => {
    const [config = '', login = ''] = fences(document('docs/format.md'), 'yaml');
    const files: Record<string, string> = {
      'roadmap.yaml': config,
      'LOG.yaml': login,
      'PAY.yaml': 'name: Payments\ntasks: []\n',
      'OPS.yaml': 'name: Operations\ntasks: []\n',
    };
    const roadmap = readRoadmapWith((file) => files[file] ?? null);
    expect(checkRoadmap(roadmap)).toEqual([]);
    expect(roadmap.chapters).toEqual([{ name: 'First release', blocks: ['LOG', 'PAY'] }]);
    expect(roadmap.blocks[0]?.tasks[1]).toMatchObject({ requires: ['LOG.1'], risky: true });
  });

  it.each(['docs/workflow.md', 'skill/SKILL.md'])('imports the task table from %s through the CLI', (file) => {
    const root = project();
    command(root, ['init']);
    const [table = ''] = fences(document(file), 'markdown');
    const rows = readPlanTable(table);
    const keys = new Set(rows.map((row) => row.key));
    const external = [...new Set(rows.flatMap((row) => row.requires).filter((id) => !keys.has(id)))];
    const codes = new Set([...rows.map((row) => row.block), ...external.map((id) => id.split('.')[0] ?? '')]);
    for (const code of codes) {
      command(root, ['add-block', code, code]);
      // Existing dependencies are fixture data; imported rows must resolve both these IDs and their own keys.
      const tasks: Task[] = external
        .filter((id) => id.startsWith(`${code}.`))
        .map((id) => ({
          id,
          title: 'Existing task',
          doneWhen: 'its result is available',
          lines: 20,
          requires: [],
        }));
      writeFileSync(join(root, 'roadmap', `${code}.yaml`), stringify({ name: code, tasks }));
    }
    writeFileSync(join(root, 'plan.md'), table);
    command(root, ['add', '--from', 'plan.md']);

    const tasks = readRoadmap(root).blocks.flatMap((block) => block.tasks);
    const first = tasks.find((task) => task.title === rows[0]?.title);
    const second = tasks.find((task) => task.title === rows[1]?.title);
    expect(first).toBeDefined();
    expect(second).toMatchObject({ risky: true, requires: [first?.id, ...external] });
    expect(checkRoadmap(readRoadmap(root))).toEqual([]);
  });
});
