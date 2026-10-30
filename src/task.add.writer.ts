import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMap, isSeq, parseDocument, YAMLSeq } from 'yaml';
import { describeProblems } from './check.service.ts';
import { InvalidPlan, readTask, ROADMAP_DIR, RoadmapError, type Roadmap, type Task } from './roadmap.model.ts';
import { readCode } from './roadmap.repository.ts';
import { writeInside } from './safe-write.adapter.ts';

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
  checkNewTask(id, task);
  appendTask(root, code, id, task);
}

/** Refuses a task the plan could not read back: written, it would stop every command until someone removed it. */
export function checkNewTask(id: string, task: NewTask): void {
  try {
    readTask({ id, ...task }, '');
  } catch (error) {
    if (!(error instanceof InvalidPlan)) throw error;
    throw new RoadmapError(`Not added: ${error.where} ${error.message}.`);
  }
}

/** Writes `task` as `id` at the end of block `code`'s file, as it is: whoever calls it has checked the plan. */
export function appendTask(root: string, code: string, id: string, task: NewTask): void {
  const name = `${ROADMAP_DIR}/${code}.yaml`;
  const path = join(root, name);
  try {
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
    writeInside(root, name, doc.toString({ lineWidth: 0, flowCollectionPadding: false }));
  } catch (error) {
    if (error instanceof RoadmapError) throw error;
    throw new RoadmapError(`Could not write ${name}: ${readCode(error)}.`);
  }
}

/** Whether `name` holds `text` again, written back if it had changed. */
function putBack(root: string, name: string, text: string): boolean {
  try {
    if (readFileSync(join(root, name), 'utf8') !== text) writeInside(root, name, text);
    return true;
  } catch {
    return false;
  }
}

/** Writes every one of `tasks`, or none: a write that fails puts back the files already written, or names those it can't. */
export function appendTasks(root: string, tasks: { code: string; id: string; task: NewTask }[]): void {
  const originals = new Map<string, string>();
  try {
    for (const { code, id, task } of tasks) {
      const name = `${ROADMAP_DIR}/${code}.yaml`;
      if (!originals.has(name)) originals.set(name, readFileSync(join(root, name), 'utf8'));
      appendTask(root, code, id, task);
    }
  } catch (error) {
    const stuck = [...originals].filter(([name, text]) => !putBack(root, name, text)).map(([name]) => name);
    const cause = error instanceof RoadmapError ? error.message : `Could not read the plan: ${readCode(error)}.`;
    const left = stuck.length === 0 ? '' : ` ${stuck.join(', ')} kept the rows written: restore them with git.`;
    throw new RoadmapError(`${cause}${left}`);
  }
}
