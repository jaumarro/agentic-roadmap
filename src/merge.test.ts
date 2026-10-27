import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from './cli.ts';
import { mergeBlock } from './merge.ts';
import { initRoadmap, readRoadmap } from './source.ts';

const BASE = `name: G
tasks:
  # the first one
  - id: GET.1
    title: One
    doneWhen: x
    lines: 10
  - id: GET.2
    title: Two
    doneWhen: x
    lines: 10
`;

function withTask(text: string, id: string): string {
  return `${text}  - id: ${id}\n    title: New ${id}\n    doneWhen: x\n    lines: 5\n`;
}

describe('mergeBlock', () => {
  it('keeps the tasks both sides added, ours first, and the comments', () => {
    const merged = mergeBlock(BASE, withTask(BASE, 'GET.3'), withTask(BASE, 'GET.4'));

    expect(merged).toEqual({ text: withTask(withTask(BASE, 'GET.3'), 'GET.4') });
  });

  it('takes each side closing a different task', () => {
    const ours = BASE.replace('    lines: 10\n  - id: GET.2', "    lines: 10\n    commit: 'aaaaaaa'\n  - id: GET.2");
    const theirs = `${BASE}    commit: 'bbbbbbb'\n`;

    const merged = mergeBlock(BASE, ours, theirs);

    expect(merged).toEqual({ text: `${ours}    commit: 'bbbbbbb'\n` });
  });

  it('stops on a task both sides changed differently', () => {
    const ours = BASE.replace('title: Two', 'title: Two, ours');
    const theirs = BASE.replace('title: Two', 'title: Two, theirs');

    expect(mergeBlock(BASE, ours, theirs)).toEqual({ conflict: 'both sides changed GET.2' });
  });

  it('drops a task one side removed and the other left alone', () => {
    const ours = BASE.replace(/ {2}- id: GET\.2[\s\S]*$/, '');

    expect(mergeBlock(BASE, ours, withTask(BASE, 'GET.3'))).toEqual({ text: withTask(ours, 'GET.3') });
  });
});

function git(root: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
}

function capture(args: string[], cwd: string) {
  let text = '';
  const code = run(args, { cwd, env: {}, out: (written) => (text += written) });
  return { code, text };
}

const ADD = ['--done-when', 'it is there', '--lines', '30'];

describe('with the merge driver installed', () => {
  it('merges two branches that each added to one block, and two that closed different tasks, with no conflict', () => {
    const root = mkdtempSync(join(tmpdir(), 'agentic-roadmap-'));
    git(root, 'init', '-q', '-b', 'main');
    initRoadmap(root);
    capture(['install-merge-driver'], root);
    git(root, 'add', '-A');
    git(root, 'commit', '-qm', 'docs: start the roadmap');
    expect(readFileSync(join(root, '.gitattributes'), 'utf8')).toBe('roadmap/*.yaml merge=agentic-roadmap\n');

    git(root, 'switch', '-q', '-c', 'one');
    capture(['add', 'GET', 'From one', ...ADD], root);
    git(root, 'commit', '-qam', 'docs: plan one');
    git(root, 'switch', '-q', 'main');
    git(root, 'switch', '-q', '-c', 'two');
    capture(['add', 'GET', 'From two', ...ADD], root);
    git(root, 'commit', '-qam', 'docs: plan two');
    git(root, 'switch', '-q', 'main');
    git(root, 'merge', '-q', 'one');
    git(root, 'merge', '-q', '--no-edit', 'two');

    git(root, 'switch', '-q', '-c', 'close-three');
    git(root, 'commit', '-q', '--allow-empty', '-m', 'feat: three');
    capture(['close', 'GET.1'], root);
    git(root, 'commit', '-qam', 'docs: close GET.1');
    git(root, 'switch', '-q', 'main');
    git(root, 'switch', '-q', '-c', 'close-four');
    git(root, 'commit', '-q', '--allow-empty', '-m', 'feat: four');
    capture(['close', 'GET.3'], root);
    git(root, 'commit', '-qam', 'docs: close GET.3');
    git(root, 'switch', '-q', 'main');
    git(root, 'merge', '-q', '--no-edit', 'close-three');
    git(root, 'merge', '-q', '--no-edit', 'close-four');

    const tasks = readRoadmap(root).blocks[0]?.tasks ?? [];
    expect(tasks.map((task) => task.id)).toEqual(['GET.1', 'GET.2', 'GET.3', 'GET.4']);
    expect(tasks.filter((task) => task.commit !== undefined).map((task) => task.id)).toEqual(['GET.1', 'GET.3']);
    expect(capture(['check'], root)).toEqual({ code: 0, text: 'The plan is sound.\n' });
  });
});
