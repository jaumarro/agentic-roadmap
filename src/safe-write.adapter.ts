import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { RoadmapError } from './roadmap.model.ts';

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
  replaceFile(path, text);
}

/**
 * Writes a temporary file and renames it over `path`, so a reader never sees it half written and a crash leaves the old
 * one. A rename would ignore a read-only file and drop its mode, so both are kept by hand.
 */
function replaceFile(path: string, text: string): void {
  const exists = existsSync(path);
  if (exists) accessSync(path, constants.W_OK);
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    // `wx`: a file already there, as a symlink a repo committed, is refused and never written through.
    writeFileSync(temporary, text, { flag: 'wx' });
    if (exists) chmodSync(temporary, statSync(path).mode);
    renameSync(temporary, path);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}
