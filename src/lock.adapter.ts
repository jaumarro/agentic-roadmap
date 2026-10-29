import { mkdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { RoadmapError } from './roadmap.model.ts';

const LOCK = 'agentic-roadmap.lock';
// An add takes well under a second; a lock older than this was left by a session that died mid-add.
const STALE_MS = 30_000;
const STEP_MS = 25;

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isStale(path: string): boolean {
  try {
    return Date.now() - statSync(path).mtimeMs > STALE_MS;
  } catch {
    return false;
  }
}

/**
 * Runs `work` holding the lock in `gitDir`, the folder every worktree of the repo shares, so two sessions never pick
 * and write an id at once. A directory is the lock: making one is atomic. Waits up to `waitMs` for another holder.
 */
export function withLock<T>(gitDir: string, work: () => T, waitMs = 5_000): T {
  const path = join(gitDir, LOCK);
  for (let waited = 0; ; waited += STEP_MS) {
    try {
      mkdirSync(path);
      break;
    } catch {
      if (isStale(path)) rmSync(path, { recursive: true, force: true });
      else if (waited >= waitMs) throw new RoadmapError(`Another add is under way; if none is, remove ${path}.`);
      else sleep(STEP_MS);
    }
  }
  try {
    return work();
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
}
