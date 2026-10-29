import { lstatSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { RoadmapError } from './source.ts';

function isOutside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel.startsWith('..') || isAbsolute(rel);
}

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Writes `text` to `name` under `root`, refusing a path that leaves it: by `..`, by a folder that is a symlink out of
 * it, or by a file that is a symlink, which a repo can commit to point anywhere.
 */
export function writeInside(root: string, name: string, text: string): void {
  const path = resolve(root, name);
  if (path === resolve(root) || isOutside(root, path))
    throw new RoadmapError(`Refused to write ${name}: it is outside the repo.`);
  mkdirSync(dirname(path), { recursive: true });
  if (isOutside(realpathSync(root), realpathSync(dirname(path)))) {
    throw new RoadmapError(`Refused to write ${name}: a folder on its way links outside the repo.`);
  }
  if (isSymlink(path)) throw new RoadmapError(`Refused to write ${name}: it is a symlink.`);
  writeFileSync(path, text);
}
