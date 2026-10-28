import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from './cli.ts';

function capture(args: string[], cwd = tmpdir(), env: Record<string, string> = {}) {
  let text = '';
  let errors = '';
  const code = run(args, {
    cwd,
    env,
    out: (written) => {
      text += written;
    },
    err: (written) => {
      errors += written;
    },
  });
  return { code, text: text + errors, out: text, err: errors };
}

function project(): string {
  return mkdtempSync(join(tmpdir(), 'agentic-roadmap-'));
}

describe('the binary', () => {
  it('stops quietly when its reader closes the pipe early', () => {
    const root = project();
    capture(['init'], root);
    const cli = fileURLToPath(new URL('cli.ts', import.meta.url));

    const result = spawnSync('sh', ['-c', `node "${cli}" next | head -c 1`], { cwd: root, encoding: 'utf8' });

    expect(result.stderr).toBe('');
  });

  it('writes an error to stderr only, so a JSON reader on stdout sees nothing', () => {
    const cli = fileURLToPath(new URL('cli.ts', import.meta.url));

    const result = spawnSync('node', [cli, 'next', '--json'], { cwd: project(), encoding: 'utf8' });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('agentic-roadmap init');
  });
});

describe('run', () => {
  it('prints the usage with no command', () => {
    const { code, text } = capture([]);

    expect(code).toBe(0);
    expect(text).toContain('Usage: agentic-roadmap');
  });

  it('fails on a command it does not know, on the error stream', () => {
    const result = capture(['launch']);

    expect(result.code).toBe(1);
    expect(result.out).toBe('');
    expect(result.err).toContain('Unknown command: launch');
  });

  it('names the first ready task of a fresh roadmap and its branch', () => {
    const root = project();
    capture(['init'], root);

    const { code, text } = capture(['next'], root);

    expect(code).toBe(0);
    expect(text).toContain('Next: GET.1 · Write the first real block of this roadmap');
    expect(text).toContain('get-1/');
  });

  it('reads the roadmap the environment points at', () => {
    const root = project();
    capture(['init'], root);

    expect(capture(['next'], project(), { AGENTIC_ROADMAP_ROOT: root }).text).toContain('Next: GET.1');
  });

  it('fails with a hint when there is no roadmap', () => {
    const { code, text } = capture(['next'], project());

    expect(code).toBe(1);
    expect(text).toContain('agentic-roadmap init');
  });
});
