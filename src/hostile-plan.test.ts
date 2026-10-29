import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from './cli.ts';
import { initRoadmap } from './source.ts';

function capture(args: string[], cwd: string) {
  let text = '';
  const write = (written: string) => (text += written);
  const code = run(args, { cwd, env: {}, out: write, err: write });
  return { code, text };
}

/** A repo inside a folder of its own, so a write that escapes it lands where the test can look. */
function repo(): { root: string; outside: string } {
  const outside = mkdtempSync(join(tmpdir(), 'agentic-roadmap-'));
  const root = join(outside, 'repo');
  mkdirSync(root);
  initRoadmap(root);
  return { root, outside };
}

function setConfig(root: string, text: string): void {
  writeFileSync(join(root, 'roadmap', 'roadmap.yaml'), text);
}

describe('a plan from a stranger', () => {
  it('cannot point the Markdown outside the repo', () => {
    const { root, outside } = repo();
    setConfig(root, 'blocks: [GET]\nmarkdown: ../escaped.md\n');

    const result = capture(['render'], root);

    expect(result).toEqual({
      code: 1,
      text: 'roadmap/roadmap.yaml: markdown: a path inside the repo, as docs/roadmap.md\n',
    });
    expect(existsSync(join(outside, 'escaped.md'))).toBe(false);
  });

  it('cannot write the Markdown through a symlink, to a file or out of a folder', () => {
    const { root, outside } = repo();
    writeFileSync(join(outside, 'victim.txt'), 'kept');
    symlinkSync(join(outside, 'victim.txt'), join(root, 'PLAN.md'));
    symlinkSync(outside, join(root, 'docs'));

    setConfig(root, 'blocks: [GET]\nmarkdown: PLAN.md\n');
    const file = capture(['render'], root);
    setConfig(root, 'blocks: [GET]\nmarkdown: docs/plan.md\n');
    const folder = capture(['render'], root);

    expect(file).toEqual({ code: 1, text: 'Refused to write PLAN.md: it is a symlink.\n' });
    expect(folder).toEqual({
      code: 1,
      text: 'Refused to write docs/plan.md: a folder on its way links outside the repo.\n',
    });
    expect(readFileSync(join(outside, 'victim.txt'), 'utf8')).toBe('kept');
    expect(existsSync(join(outside, 'plan.md'))).toBe(false);
  });

  it('cannot make install-skill write through a symlink it committed', () => {
    const { root, outside } = repo();
    writeFileSync(join(outside, 'victim.txt'), 'kept');
    mkdirSync(join(root, '.claude', 'skills', 'roadmap-workflow'), { recursive: true });
    symlinkSync(join(outside, 'victim.txt'), join(root, '.claude', 'skills', 'roadmap-workflow', 'SKILL.md'));

    const result = capture(['install-skill'], root);

    expect(result.code).toBe(1);
    expect(result.text).toContain('it is a symlink');
    expect(readFileSync(join(outside, 'victim.txt'), 'utf8')).toBe('kept');
  });

  it('cannot reach the terminal with an escape sequence in a title', () => {
    const { root } = repo();
    const block = readFileSync(join(root, 'roadmap', 'GET.yaml'), 'utf8');
    const title = 'title: Write the first real block of this roadmap';
    writeFileSync(join(root, 'roadmap', 'GET.yaml'), block.replace(title, 'title: "\\e]0;pwned\\aWrite"'));

    const result = capture(['list'], root);

    expect(result).toEqual({
      code: 1,
      text: 'roadmap/GET.yaml: tasks.0.title: holds a control character, as an escape sequence\n',
    });
  });

  it('refuses an alias bomb as a plan error, not a crash', () => {
    const { root } = repo();
    const levels = ['a: &a [x, x, x, x, x, x, x, x, x, x]'];
    for (const [index, name] of ['b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].entries()) {
      const previous = String.fromCharCode('a'.charCodeAt(0) + index);
      levels.push(`${name}: &${name} [${Array(10).fill(`*${previous}`).join(', ')}]`);
    }
    setConfig(root, `blocks: [GET]\n${levels.join('\n')}\n`);

    const result = capture(['check'], root);

    expect(result.code).toBe(1);
    expect(result.text).toMatch(/^roadmap\/roadmap\.yaml: ReferenceError: /);
  });
});
