import { editBlocks, findTaskNode, setIdList } from './block.edit.writer.ts';
import { describeProblems } from './check.service.ts';
import { RoadmapError, type Roadmap, type Task } from './roadmap.model.ts';

function replaceTask(roadmap: Roadmap, changed: Task): Roadmap {
  const swap = (task: Task) => (task.id === changed.id ? changed : task);
  return { ...roadmap, blocks: roadmap.blocks.map((block) => ({ ...block, tasks: block.tasks.map(swap) })) };
}

/**
 * Adds `add` to task `id`'s requirements and drops `drop` from them, keeping its block file's comments and layout; the
 * requirements it is left with. The plan is checked with the change first, so one that leaves it unsound, as a cycle,
 * is never written. A dropped requirement leaves the task's confirmed list too.
 */
export function changeRequires(root: string, roadmap: Roadmap, id: string, add: string[], drop: string[]): string[] {
  const block = roadmap.blocks.find((each) => each.tasks.some((task) => task.id === id));
  const task = block?.tasks.find((each) => each.id === id);
  if (block === undefined || task === undefined) throw new RoadmapError(`No task ${id} in this roadmap.`);
  const had = add.find((required) => task.requires.includes(required));
  if (had !== undefined) throw new RoadmapError(`${id} already requires ${had}.`);
  const lacked = drop.find((required) => !task.requires.includes(required));
  if (lacked !== undefined) throw new RoadmapError(`${id} does not require ${lacked}.`);
  const requires = [...task.requires.filter((required) => !drop.includes(required)), ...new Set(add)];
  const confirmed = (task.confirmed ?? []).filter((required) => !drop.includes(required));
  const problems = describeProblems(replaceTask(roadmap, { ...task, requires, confirmed }));
  if (problems.length > 0) throw new RoadmapError(`Not changed: ${problems.join('; ')}.`);
  editBlocks(root, [block.code], (blocks) => {
    const open = blocks.get(block.code);
    if (open === undefined) return;
    const node = findTaskNode(open, id);
    setIdList(open, node, 'requires', requires);
    if (task.confirmed !== undefined) setIdList(open, node, 'confirmed', confirmed);
  });
  return requires;
}
