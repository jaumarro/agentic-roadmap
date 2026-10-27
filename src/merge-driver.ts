import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeBlock } from './merge.ts';
import { ROADMAP_DIR, RoadmapError } from './source.ts';

const DRIVER = 'agentic-roadmap';
const ATTRIBUTE = `${ROADMAP_DIR}/*.yaml merge=${DRIVER}`;

/**
 * Git's merge driver: merges `base`, `ours` and `theirs` of a block file, writing the result over `ours` as git expects.
 * True when it merged; on a conflict `ours` is left as it was, for git to mark the file conflicted.
 */
export function runMergeDriver(base: string, ours: string, theirs: string): { merged: boolean; why: string } {
  const merged = mergeBlock(readFileSync(base, 'utf8'), readFileSync(ours, 'utf8'), readFileSync(theirs, 'utf8'));
  if ('conflict' in merged) return { merged: false, why: merged.conflict };
  writeFileSync(ours, merged.text);
  return { merged: true, why: '' };
}

/** Makes git merge `roadmap/*.yaml` with this tool: the attribute in `.gitattributes`, the driver in the repo's config. */
export function installMergeDriver(root: string): string {
  const cli = fileURLToPath(new URL('cli.ts', import.meta.url));
  const command = `node "${cli}" merge-block %O %A %B`;
  try {
    execFileSync('git', ['config', `merge.${DRIVER}.name`, 'agentic-roadmap: merge block files task by task'], {
      cwd: root,
      stdio: 'ignore',
    });
    execFileSync('git', ['config', `merge.${DRIVER}.driver`, command], { cwd: root, stdio: 'ignore' });
  } catch {
    throw new RoadmapError('Could not set the merge driver in the git config: is this a git repo?');
  }
  const attributes = join(root, '.gitattributes');
  const present = existsSync(attributes) && readFileSync(attributes, 'utf8').split('\n').includes(ATTRIBUTE);
  if (!present) appendFileSync(attributes, `${ATTRIBUTE}\n`);
  return attributes;
}
