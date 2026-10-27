import { describe, expect, it } from 'vitest';
import { run } from './cli.ts';

function capture(args: string[]) {
  let text = '';
  const code = run(args, (written) => {
    text += written;
  });
  return { code, text };
}

describe('run', () => {
  it('prints the usage with no command', () => {
    expect(capture([])).toEqual({ code: 0, text: 'Usage: agentic-roadmap <command>\n' });
  });

  it('fails on a command it does not know', () => {
    expect(capture(['launch']).code).toBe(1);
  });
});
