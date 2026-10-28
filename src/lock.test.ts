import { existsSync, mkdirSync, mkdtempSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { withLock } from './lock.ts';

function folder(): string {
  return mkdtempSync(join(tmpdir(), 'agentic-roadmap-'));
}

describe('withLock', () => {
  it('runs the work holding the lock, and lets it go after, even when the work throws', () => {
    const dir = folder();
    const lock = join(dir, 'agentic-roadmap.lock');

    expect(withLock(dir, () => existsSync(lock))).toBe(true);
    expect(existsSync(lock)).toBe(false);
    expect(() =>
      withLock(dir, () => {
        throw new Error('mid-add');
      }),
    ).toThrow('mid-add');
    expect(existsSync(lock)).toBe(false);
  });

  it('refuses after waiting on a lock another session holds', () => {
    const dir = folder();
    mkdirSync(join(dir, 'agentic-roadmap.lock'));

    expect(() => withLock(dir, () => 'never', 50)).toThrow('Another add is under way');
  });

  it('takes over a lock left by a session that died mid-add', () => {
    const dir = folder();
    const lock = join(dir, 'agentic-roadmap.lock');
    mkdirSync(lock);
    const minuteAgo = new Date(Date.now() - 60_000);
    utimesSync(lock, minuteAgo, minuteAgo);

    expect(withLock(dir, () => 'done', 50)).toBe('done');
  });
});
