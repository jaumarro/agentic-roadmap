import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from './cli.ts';
import { initRoadmap } from './source.ts';

function project(): string {
  return mkdtempSync(join(tmpdir(), 'agentic-roadmap-'));
}

function capture(args: string[], cwd: string) {
  let text = '';
  const code = run(args, { cwd, env: {}, out: (written) => (text += written) });
  return { code, text };
}

function writeBlock(root: string, body: string): void {
  writeFileSync(join(root, 'roadmap', 'GET.yaml'), body);
}

describe('a roadmap that does not read', () => {
  it('names the file and line of a YAML syntax error, with no stack trace', () => {
    const root = project();
    initRoadmap(root);
    writeBlock(root, 'name: G\ntasks: [ - a\n');

    const { code, text } = capture(['next'], root);

    expect(code).toBe(1);
    expect(text).toMatch(/^roadmap\/GET\.yaml, line 2: /);
    expect(text).not.toContain('    at ');
  });

  it('says a block file that is empty is empty', () => {
    const root = project();
    initRoadmap(root);
    writeBlock(root, '');

    expect(capture(['next'], root).text).toBe('roadmap/GET.yaml is empty.\n');
  });

  it('says what lines takes', () => {
    const root = project();
    initRoadmap(root);
    writeBlock(root, 'name: G\ntasks:\n  - id: GET.1\n    title: x\n    doneWhen: y\n    lines: "40"\n');

    expect(capture(['next'], root).text).toContain('lines is a positive whole number, or doc');
  });
});

describe('init', () => {
  it('fails cleanly where it cannot write, and leaves nothing behind', () => {
    const root = project();
    mkdirSync(join(root, 'locked'));
    chmodSync(join(root, 'locked'), 0o500);

    const { code, text } = capture(['init', '--root', join(root, 'locked')], root);

    expect(code).toBe(1);
    expect(text).toMatch(/^Could not write the roadmap in /);
  });

  it('refuses to start a roadmap inside another', () => {
    const root = project();
    initRoadmap(root);
    const below = join(root, 'packages', 'app');
    mkdirSync(below, { recursive: true });

    const { code, text } = capture(['init'], below);

    expect(code).toBe(1);
    expect(text).toBe(`A roadmap already covers this folder, at ${root}.\n`);
  });

  it('names the folder it started, not its roadmap subfolder', () => {
    const root = project();

    expect(capture(['init'], root).text).toBe(`Started a roadmap in ${root}.\n`);
  });
});

describe('options', () => {
  it.each([
    [['next', '--root'], "Option '--root <value>' argument missing"],
    [['next', '--root', '--json'], "Option '--root' argument is ambiguous"],
    [['next', '--root', ''], '--root needs a folder'],
    [['next', '--bogus'], "Unknown option '--bogus'"],
    [['next', 'extra'], 'next takes no arguments'],
  ])('refuses %j', (args, message) => {
    const { code, text } = capture(args, project());

    expect(code).toBe(1);
    expect(text).toContain(message);
  });

  it('takes --root before the command and as --root=folder', () => {
    const root = project();
    initRoadmap(root);

    expect(capture(['--root', root, 'next'], project()).text).toContain('Next: GET.1');
    expect(capture(['next', `--root=${root}`], project()).text).toContain('Next: GET.1');
  });

  it('prints the usage with --help and exits 0', () => {
    const help = capture(['--help'], project());

    expect(help.code).toBe(0);
    expect(help.text).toContain('Usage:');
    expect(capture(['next', '--help'], project()).code).toBe(0);
  });
});

describe('next', () => {
  it('tells an empty plan, a finished one and one where nothing is ready apart', () => {
    const root = project();
    initRoadmap(root);

    writeBlock(root, 'name: G\ntasks: []\n');
    expect(capture(['next'], root).text).toBe('The plan has no tasks yet.\n');

    writeBlock(
      root,
      "name: G\ntasks:\n  - id: GET.1\n    title: x\n    doneWhen: y\n    lines: 1\n    commit: 'abc1234'\n",
    );
    expect(capture(['next'], root).text).toBe('Everything is done.\n');
  });
});
