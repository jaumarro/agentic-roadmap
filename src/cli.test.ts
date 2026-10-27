import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from './cli.ts';

function capture(args: string[], cwd = tmpdir(), env: Record<string, string> = {}) {
  let text = '';
  const code = run(args, {
    cwd,
    env,
    out: (written) => {
      text += written;
    },
  });
  return { code, text };
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
});

describe('run', () => {
  it('prints the usage with no command', () => {
    const { code, text } = capture([]);

    expect(code).toBe(0);
    expect(text).toContain('Usage: agentic-roadmap');
  });

  it('fails on a command it does not know', () => {
    expect(capture(['launch']).code).toBe(1);
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
