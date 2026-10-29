import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from './cli.ts';
import { initRoadmap } from './roadmap.repository.ts';

function capture(args: string[], cwd: string) {
  let text = '';
  const write = (written: string) => (text += written);
  const code = run(args, { cwd, env: {}, out: write, err: write });
  return { code, text };
}

const SKILL = readFileSync(new URL('../skill/SKILL.md', import.meta.url), 'utf8');
const INSTALLED = join('.claude', 'skills', 'roadmap-workflow', 'SKILL.md');

describe('install-skill', () => {
  it('copies the skill next to roadmap/, from a folder below it', () => {
    const root = mkdtempSync(join(tmpdir(), 'agentic-roadmap-'));
    initRoadmap(root);
    mkdirSync(join(root, 'src'));

    expect(capture(['install-skill'], join(root, 'src'))).toEqual({
      code: 0,
      text: `Installed the roadmap-workflow skill in ${INSTALLED}.\n`,
    });
    expect(readFileSync(join(root, INSTALLED), 'utf8')).toBe(SKILL);
  });

  it('replaces an older copy', () => {
    const root = mkdtempSync(join(tmpdir(), 'agentic-roadmap-'));
    initRoadmap(root);
    mkdirSync(join(root, '.claude', 'skills', 'roadmap-workflow'), { recursive: true });
    writeFileSync(join(root, INSTALLED), 'old');

    capture(['install-skill'], root);
    expect(readFileSync(join(root, INSTALLED), 'utf8')).toBe(SKILL);
  });

  it('covers taking, closing, adding and handing out tasks with the commands that do them', () => {
    for (const command of ['next', 'show', 'close', 'add', 'free', 'focus', 'check', 'health']) {
      expect(SKILL).toContain(`agentic-roadmap ${command}`);
    }
  });
});
