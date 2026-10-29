import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { run } from './cli.ts';
import { initRoadmap } from './roadmap.repository.ts';

function git(root: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function capture(args: string[], cwd: string) {
  let text = '';
  const write = (written: string) => (text += written);
  const code = run(args, { cwd, env: {}, out: write, err: write });
  return { code, text };
}

function commits(root: string, message: string): boolean {
  try {
    git(root, 'commit', '-qm', message);
    return true;
  } catch {
    return false;
  }
}

const BLOCK = join('roadmap', 'GET.yaml');

function startRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'agentic-roadmap-'));
  git(root, 'init', '-q', '-b', 'main');
  initRoadmap(root);
  return root;
}

function breakRequires(root: string): void {
  const path = join(root, BLOCK);
  writeFileSync(path, readFileSync(path, 'utf8').replace('requires: [GET.1]', 'requires: [GET.9]'));
}

describe('check --staged', () => {
  it('checks the plan in the index, not the working tree', () => {
    const root = startRepo();
    git(root, 'add', '-A');
    breakRequires(root);

    const staged = capture(['check', '--staged'], root);
    expect(staged.code).toBe(0);
    expect(staged.text).toMatch(/^The plan is sound/);
    expect(capture(['check'], root).code).toBe(1);

    git(root, 'add', '-A');
    expect(capture(['check', '--staged'], root).text).toContain('GET.2 requires GET.9, which no task has');
  });
});

describe('install-hook', () => {
  it('refuses a commit that breaks the plan and lets the rest through', () => {
    const root = startRepo();
    capture(['install-hook'], root);
    git(root, 'add', '-A');
    expect(commits(root, 'docs: start the roadmap')).toBe(true);

    breakRequires(root);
    git(root, 'add', '-A');
    expect(commits(root, 'docs: break it')).toBe(false);

    git(root, 'restore', '--staged', BLOCK);
    writeFileSync(join(root, 'notes.txt'), 'x\n');
    git(root, 'add', 'notes.txt');
    expect(commits(root, 'chore: notes')).toBe(true);
  });

  it('checks a roadmap in a subfolder of the repo', () => {
    const repo = mkdtempSync(join(tmpdir(), 'agentic-roadmap-'));
    git(repo, 'init', '-q', '-b', 'main');
    const root = join(repo, 'app');
    mkdirSync(root);
    initRoadmap(root);
    capture(['install-hook'], root);
    breakRequires(root);
    git(repo, 'add', '-A');

    expect(commits(repo, 'docs: start it broken')).toBe(false);
  });

  it('leaves a hook already there alone and says the line to add', () => {
    const root = startRepo();
    const hook = join(root, '.git', 'hooks', 'pre-commit');
    writeFileSync(hook, '#!/bin/sh\npnpm lint-staged\n');

    const installed = capture(['install-hook'], root);

    expect(installed.code).toBe(1);
    expect(installed.text).toContain('already exists, so it was left alone');
    expect(installed.text).toContain('check --staged');
    expect(readFileSync(hook, 'utf8')).toBe('#!/bin/sh\npnpm lint-staged\n');
  });

  it('calls the installed bin by a path that stays across upgrades, and rewrites a stale line', () => {
    const root = startRepo();
    mkdirSync(join(root, 'node_modules', '.bin'), { recursive: true });
    symlinkSync(
      fileURLToPath(new URL('cli.ts', import.meta.url)),
      join(root, 'node_modules', '.bin', 'agentic-roadmap'),
    );
    const hook = join(root, '.git', 'hooks', 'pre-commit');
    writeFileSync(hook, '#!/bin/sh\n# agentic-roadmap: check the staged plan\nnode /gone/cli.js check --staged\n');

    expect(capture(['install-hook'], root).code).toBe(0);
    const text = readFileSync(hook, 'utf8');
    expect(text).toContain("|| 'node_modules/.bin/agentic-roadmap' check --staged");
    expect(text).not.toContain('/gone/');
  });

  it('installs again over its own hook without complaint', () => {
    const root = startRepo();
    capture(['install-hook'], root);

    expect(capture(['install-hook'], root).code).toBe(0);
  });
});
