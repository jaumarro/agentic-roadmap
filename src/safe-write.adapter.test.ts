import { chmodSync, mkdtempSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeInside } from './safe-write.adapter.ts';

function folder(): string {
  return mkdtempSync(join(tmpdir(), 'agentic-roadmap-'));
}

describe('writeInside', () => {
  it('replaces a file, keeping its mode and leaving nothing else behind', () => {
    const root = folder();
    writeFileSync(join(root, 'a.txt'), 'old');
    chmodSync(join(root, 'a.txt'), 0o640);

    writeInside(root, 'a.txt', 'new');

    expect(readFileSync(join(root, 'a.txt'), 'utf8')).toBe('new');
    expect(statSync(join(root, 'a.txt')).mode & 0o777).toBe(0o640);
    expect(readdirSync(root)).toEqual(['a.txt']);
  });

  it('refuses a read-only file, though a rename could replace it', () => {
    const root = folder();
    writeFileSync(join(root, 'a.txt'), 'old');
    chmodSync(join(root, 'a.txt'), 0o444);

    expect(() => writeInside(root, 'a.txt', 'new')).toThrow('EACCES');
    expect(readFileSync(join(root, 'a.txt'), 'utf8')).toBe('old');
  });

  it('never writes through a temporary name a repo committed as a symlink', () => {
    const outside = folder();
    const root = folder();
    writeFileSync(join(outside, 'victim.txt'), 'kept');
    symlinkSync(join(outside, 'victim.txt'), join(root, `a.txt.${process.pid}.tmp`));

    expect(() => writeInside(root, 'a.txt', 'new')).toThrow('EEXIST');
    expect(readFileSync(join(outside, 'victim.txt'), 'utf8')).toBe('kept');
  });
});
