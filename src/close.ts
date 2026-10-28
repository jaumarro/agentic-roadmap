import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMap, isSeq, parseDocument, Scalar } from 'yaml';
import type { Roadmap } from './model.ts';
import { ROADMAP_DIR, RoadmapError } from './source.ts';

function readCode(error: unknown): string {
  return error instanceof Error && 'code' in error ? String(error.code) : String(error);
}

/**
 * Marks task `id` done with `sha` in its block's file, keeping the file's comments and layout; the block's code. A task
 * whose requirements are not all done is refused: the plan would then say done for work that could not be. A done task
 * is refused unless `again`, as when a rebase rewrote its commit and the sha is given.
 */
export function closeTask(root: string, roadmap: Roadmap, id: string, sha: string, again = false): string {
  const block = roadmap.blocks.find((each) => each.tasks.some((task) => task.id === id));
  const task = block?.tasks.find((each) => each.id === id);
  if (block === undefined || task === undefined) throw new RoadmapError(`No task ${id} in this roadmap.`);
  if (task.commit !== undefined && !again) {
    throw new RoadmapError(`${id} is already done, with ${task.commit}: pass --commit to record another.`);
  }
  const done = new Set(
    roadmap.blocks.flatMap((each) => each.tasks.filter((t) => t.commit !== undefined).map((t) => t.id)),
  );
  const pending = task.requires.filter((required) => !done.has(required));
  if (pending.length > 0) throw new RoadmapError(`${id} still waits on ${pending.join(', ')}.`);
  const name = `${ROADMAP_DIR}/${block.code}.yaml`;
  const path = join(root, name);
  try {
    const doc = parseDocument(readFileSync(path, 'utf8'));
    const tasks = doc.get('tasks');
    const node = isSeq(tasks) ? tasks.items.find((item) => isMap(item) && item.get('id') === id) : undefined;
    if (!isMap(node)) throw new RoadmapError(`${id} could not be found in ${name}.`);
    // Quoted, or an all-digit sha would read back as a number.
    const commit = new Scalar(sha);
    commit.type = Scalar.QUOTE_SINGLE;
    node.set('commit', commit);
    writeFileSync(path, doc.toString({ lineWidth: 0, flowCollectionPadding: false }));
  } catch (error) {
    if (error instanceof RoadmapError) throw error;
    throw new RoadmapError(`Could not write ${name}: ${readCode(error)}.`);
  }
  return block.code;
}
