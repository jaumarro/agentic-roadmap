import { editBlocks, findTaskNode, setIdList } from './block.edit.writer.ts';
import { describeProblems } from './check.service.ts';
import { RoadmapError, type Roadmap, type Task } from './roadmap.model.ts';
import { checkNewTask, createTaskNode, type NewTask } from './task.add.writer.ts';

export type SecondPart = { title: string; doneWhen: string; lines: number | 'doc' };

export type Split = { first: Task; second: Task; moved: string[] };

function readBlockCode(id: string): string {
  return id.split('.')[0] ?? id;
}

/** What the first part keeps: what was asked, else the task's size less the second part's. */
function readKept(task: Task, second: SecondPart, keep: number | 'doc' | undefined): number | 'doc' {
  if (keep !== undefined) return keep;
  if (task.lines === 'doc') return 'doc';
  const left = second.lines === 'doc' ? task.lines : task.lines - second.lines;
  if (left <= 0) {
    throw new RoadmapError(
      `The second part takes all of ${task.id}'s ~${task.lines} lines: say what it keeps, --keep N.`,
    );
  }
  return left;
}

function swap(ids: string[] | undefined, from: string, to: string): string[] {
  return (ids ?? []).map((id) => (id === from ? to : id));
}

/** The plan with `id` split: its first part, the second after it, and what waited on `id` waiting on the second. */
function planSplit(roadmap: Roadmap, first: Task, second: Task): Roadmap {
  const move = (task: Task): Task[] => {
    if (task.id === first.id) return [first, second];
    if (!task.requires.includes(first.id)) return [task];
    const confirmed = task.confirmed === undefined ? {} : { confirmed: swap(task.confirmed, first.id, second.id) };
    return [{ ...task, requires: swap(task.requires, first.id, second.id), ...confirmed }];
  };
  return { ...roadmap, blocks: roadmap.blocks.map((block) => ({ ...block, tasks: block.tasks.flatMap(move) })) };
}

/**
 * Splits task `id` in two: `id` stays as the first part, and `second` becomes a task of its own as `secondId`, right
 * after it, requiring it. Whatever required `id` needed the whole of it, so it now requires the second part. The plan
 * is checked with the split first, and every block file it touches is written or none is.
 */
export function splitTask(
  root: string,
  roadmap: Roadmap,
  id: string,
  secondId: string,
  part: SecondPart,
  keep: number | 'doc' | undefined,
): Split {
  const task = roadmap.blocks.flatMap((block) => block.tasks).find((each) => each.id === id);
  if (task === undefined) throw new RoadmapError(`No task ${id} in this roadmap.`);
  if (task.commit !== undefined)
    throw new RoadmapError(`${id} is done with ${task.commit}: only a task left to do splits.`);
  const added: NewTask = {
    ...part,
    requires: [id],
    ...(task.risky === true ? { risky: true } : {}),
    ...(task.ref === undefined ? {} : { ref: task.ref }),
  };
  checkNewTask(secondId, added);
  const first: Task = { ...task, lines: readKept(task, part, keep) };
  const second: Task = { id: secondId, ...added };
  const after = planSplit(roadmap, first, second);
  const problems = describeProblems(after);
  if (problems.length > 0) throw new RoadmapError(`Not split: ${problems.join('; ')}.`);
  const waiting = roadmap.blocks.flatMap((block) => block.tasks).filter((each) => each.requires.includes(id));
  const code = readBlockCode(id);
  editBlocks(root, [code, ...waiting.map((each) => readBlockCode(each.id))], (blocks) => {
    const own = blocks.get(code);
    if (own === undefined) return;
    const node = findTaskNode(own, id);
    node.set('lines', first.lines);
    own.tasks.items.splice(own.tasks.items.indexOf(node) + 1, 0, createTaskNode(own.doc, secondId, added));
    for (const each of waiting) {
      const open = blocks.get(readBlockCode(each.id));
      if (open === undefined) continue;
      const moved = findTaskNode(open, each.id);
      setIdList(open, moved, 'requires', swap(each.requires, id, secondId));
      if (each.confirmed !== undefined) setIdList(open, moved, 'confirmed', swap(each.confirmed, id, secondId));
    }
  });
  return { first, second, moved: waiting.map((each) => each.id) };
}
