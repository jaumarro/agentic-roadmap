import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMap, isSeq, parseDocument, Scalar } from 'yaml';
import type { Roadmap } from './model.ts';
import { ROADMAP_DIR, RoadmapError } from './source.ts';

/** Marks task `id` done with `sha` in its block's file, keeping the file's comments and layout; the block's code. */
export function closeTask(root: string, roadmap: Roadmap, id: string, sha: string): string {
  const block = roadmap.blocks.find((each) => each.tasks.some((task) => task.id === id));
  if (block === undefined) throw new RoadmapError(`No task ${id} in this roadmap.`);
  const done = block.tasks.find((task) => task.id === id)?.commit;
  if (done !== undefined) throw new RoadmapError(`${id} is already done, with ${done}.`);
  const path = join(root, ROADMAP_DIR, `${block.code}.yaml`);
  const doc = parseDocument(readFileSync(path, 'utf8'));
  const tasks = doc.get('tasks');
  const node = isSeq(tasks) ? tasks.items.find((item) => isMap(item) && item.get('id') === id) : undefined;
  if (!isMap(node)) throw new RoadmapError(`${id} could not be found in ${ROADMAP_DIR}/${block.code}.yaml.`);
  // Quoted, or an all-digit sha would read back as a number.
  const commit = new Scalar(sha);
  commit.type = Scalar.QUOTE_SINGLE;
  node.set('commit', commit);
  writeFileSync(path, doc.toString({ lineWidth: 0, flowCollectionPadding: false }));
  return block.code;
}
