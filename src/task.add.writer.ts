import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMap, isSeq, parseDocument, YAMLSeq } from 'yaml';
import { describeProblems } from './check.service.ts';
import { ROADMAP_DIR, RoadmapError, type Roadmap, type Task } from './roadmap.model.ts';

export type NewTask = { title: string; requires: string[]; doneWhen: string; lines: number | 'doc'; risky?: boolean };

/** Appends `task` as `id` to block `code`'s file, after checking the plan stays sound with it. */
export function addTask(root: string, roadmap: Roadmap, code: string, id: string, task: NewTask): void {
  const block = roadmap.blocks.find((each) => each.code === code);
  if (block === undefined) throw new RoadmapError(`No block ${code} in this roadmap.`);
  const added: Task = { id, ...task };
  const after = {
    ...roadmap,
    blocks: roadmap.blocks.map((each) => (each.code === code ? { ...each, tasks: [...each.tasks, added] } : each)),
  };
  const problems = describeProblems(after).filter((problem) => problem.includes(id));
  if (problems.length > 0) throw new RoadmapError(`Not added: ${problems.join('; ')}.`);
  appendTask(root, code, id, task);
}

/** Writes `task` as `id` at the end of block `code`'s file, as it is: whoever calls it has checked the plan. */
export function appendTask(root: string, code: string, id: string, task: NewTask): void {
  const name = `${ROADMAP_DIR}/${code}.yaml`;
  const path = join(root, name);
  const doc = parseDocument(readFileSync(path, 'utf8'));
  const tasks = doc.get('tasks');
  if (!isSeq(tasks)) throw new RoadmapError(`${name} has no task list to add to.`);
  const node = doc.createNode({
    id,
    title: task.title,
    ...(task.requires.length > 0 ? { requires: task.requires } : {}),
    doneWhen: task.doneWhen,
    lines: task.lines,
    ...(task.risky === true ? { risky: true } : {}),
  });
  // Requirements read best on one line, as the rest of the plan writes them.
  const requires = isMap(node) ? node.get('requires', true) : undefined;
  if (requires instanceof YAMLSeq) requires.flow = true;
  tasks.flow = false;
  tasks.items.push(node);
  writeFileSync(path, doc.toString({ lineWidth: 0, flowCollectionPadding: false }));
}
