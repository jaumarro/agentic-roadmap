import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readCommand } from './bin.locator.ts';
import { readRepoPaths } from './git.adapter.ts';
import { mergeBlock } from './block.merge.service.ts';
import { ROADMAP_DIR, RoadmapError } from './roadmap.repository.ts';

const DRIVER = 'agentic-roadmap';
// The config is no block, so it merges as text; a later line wins over the earlier one for the same file.
const ATTRIBUTES = [`${ROADMAP_DIR}/*.yaml merge=${DRIVER}`, `${ROADMAP_DIR}/roadmap.yaml merge=text`];

/** Writes git's own line merge over `ours`, conflict markers and both sides included, for a person to settle. */
function markConflict(base: string, ours: string, theirs: string): void {
  try {
    execFileSync('git', ['merge-file', '-L', 'ours', '-L', 'base', '-L', 'theirs', ours, base, theirs], {
      stdio: 'ignore',
    });
  } catch {
    // merge-file exits with the number of conflicts it marked: that is the expected outcome here.
  }
}

/**
 * Git's merge driver: merges `base`, `ours` and `theirs` of a block file, writing the result over `ours` as git expects.
 * True when it merged; on a conflict `ours` gets both sides between conflict markers, and git marks the file conflicted.
 */
export function runMergeDriver(base: string, ours: string, theirs: string): { merged: boolean; why: string } {
  const merged = mergeBlock(readFileSync(base, 'utf8'), readFileSync(ours, 'utf8'), readFileSync(theirs, 'utf8'));
  if ('conflict' in merged) {
    markConflict(base, ours, theirs);
    return { merged: false, why: merged.conflict };
  }
  writeFileSync(ours, merged.text);
  return { merged: true, why: '' };
}

/** Makes git merge `roadmap/*.yaml` with this tool: the attribute in `.gitattributes`, the driver in the repo's config. */
export function installMergeDriver(root: string): string {
  const paths = readRepoPaths(root);
  if (paths === null) throw new RoadmapError('Could not set the merge driver in the git config: is this a git repo?');
  const command = `${readCommand(paths.top, root)} merge-block %O %A %B`;
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
  const text = existsSync(attributes) ? readFileSync(attributes, 'utf8') : '';
  const missing = ATTRIBUTES.filter((attribute) => !text.split('\n').includes(attribute));
  // Appended to a last line with no newline, a rule would run into it and break both.
  const separator = text === '' || text.endsWith('\n') ? '' : '\n';
  if (missing.length > 0) appendFileSync(attributes, `${separator}${missing.map((each) => `${each}\n`).join('')}`);
  return attributes;
}
