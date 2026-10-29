import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Each file is `subject.kind.ts`. Pure kinds hold the rules and can be read and tested without a disk or a repo.
const PURE = ['model', 'service', 'policy', 'parser', 'view'];
const IO = ['adapter', 'repository', 'writer', 'installer', 'locator'];
const ENTRIES = ['cli.ts', 'index.ts'];
const IO_MODULES = ['node:fs', 'node:child_process'];

const dir = new URL('.', import.meta.url);
// This test is about the layout as a whole, so it is the one test named after no file.
const SELF = 'layout.test.ts';
const files = readdirSync(dir).filter((file) => file.endsWith('.ts') && file !== SELF);
const sources = files.filter((file) => !file.endsWith('.test.ts'));

function readKind(file: string): string | undefined {
  return /\.([a-z]+)\.ts$/.exec(file)?.[1];
}

function readImports(file: string): string[] {
  const text = readFileSync(new URL(file, dir), 'utf8');
  return [...text.matchAll(/^(?:import|export)\b[^;]*?from '([^']+)'/gms)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
}

describe('the source layout', () => {
  it('names each file by its subject and a known kind', () => {
    const unknown = sources.filter((file) => {
      const kind = readKind(file);
      return !ENTRIES.includes(file) && (kind === undefined || ![...PURE, ...IO].includes(kind));
    });

    expect(unknown).toEqual([]);
  });

  it('names each test after the file it tests, or as a test of the command line', () => {
    const stray = files.filter(
      (file) =>
        file.endsWith('.test.ts') &&
        !file.endsWith('.cli.test.ts') &&
        !sources.includes(file.replace('.test.ts', '.ts')),
    );

    expect(stray).toEqual([]);
  });

  it('keeps the pure kinds off the disk, git and processes', () => {
    const leaks = sources
      .filter((file) => PURE.includes(readKind(file) ?? ''))
      .flatMap((file) =>
        readImports(file)
          .filter((from) => IO_MODULES.includes(from) || IO.includes(readKind(from) ?? ''))
          .map((from) => `${file} imports ${from}`),
      );

    expect(leaks).toEqual([]);
  });
});
