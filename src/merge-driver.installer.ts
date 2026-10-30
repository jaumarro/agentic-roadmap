import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readCommand } from './bin.locator.ts';
import { readRepoPaths } from './git.adapter.ts';
import { mergeBlock } from './block.merge.service.ts';
import { ROADMAP_DIR, RoadmapError } from './roadmap.model.ts';
import { writeInside } from './safe-write.adapter.ts';

const DRIVER = 'agentic-roadmap';
const ATTRIBUTE = `${ROADMAP_DIR}/*.yaml merge=${DRIVER}`;
// A later line wins over an earlier one for the same file, so this one would keep roadmap.yaml from the driver.
const CONFIG_AS_TEXT = `${ROADMAP_DIR}/roadmap.yaml merge=text`;

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
  const kept = text
    .split('\n')
    .filter((line) => line.trimEnd() !== CONFIG_AS_TEXT)
    .join('\n');
  // Appended to a last line with no newline, a rule would run into it and break both.
  const separator = kept === '' || kept.endsWith('\n') ? '' : '\n';
  const present = kept.split('\n').some((line) => line.trimEnd() === ATTRIBUTE);
  const added = present ? kept : `${kept}${separator}${ATTRIBUTE}\n`;
  if (added !== text) writeInside(root, '.gitattributes', added);
  return attributes;
}
