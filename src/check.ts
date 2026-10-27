import type { Roadmap, Task } from './model.ts';

function countBy(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function readRepeated(values: string[]): [string, number][] {
  return [...countBy(values)].filter(([, count]) => count > 1);
}

/** Each cycle once, as the path that closes it, walking the requirements depth first in the plan's order. */
function findCycles(tasks: Task[]): string[][] {
  const requires = new Map(tasks.map((task) => [task.id, task.requires]));
  const done = new Set<string>();
  const cycles: string[][] = [];
  const visit = (id: string, path: string[]) => {
    const at = path.indexOf(id);
    if (at !== -1) {
      cycles.push([...path.slice(at), id]);
      return;
    }
    if (done.has(id) || !requires.has(id)) return;
    for (const required of requires.get(id) ?? []) visit(required, [...path, id]);
    done.add(id);
  };
  for (const task of tasks) visit(task.id, []);
  return cycles;
}

/** Each block once, as first listed: a block listed twice is one problem, not every one of its tasks twice. */
function readBlocksOnce(roadmap: Roadmap): Roadmap['blocks'] {
  return roadmap.blocks.filter((block, at) => roadmap.blocks.findIndex((each) => each.code === block.code) === at);
}

/** What makes the plan unsound on its own, without git: each problem in words a person can act on. */
export function checkRoadmap(roadmap: Roadmap): string[] {
  const blocks = readBlocksOnce(roadmap);
  const tasks = blocks.flatMap((block) => block.tasks);
  const ids = new Set(tasks.map((task) => task.id));
  const repeatedBlocks = readRepeated(roadmap.blocks.map((block) => block.code));
  const outside = blocks.flatMap((block) =>
    block.tasks.filter((task) => !task.id.startsWith(`${block.code}.`)).map((task) => ({ task, block })),
  );
  const unknown = tasks.flatMap((task) =>
    task.requires.filter((id) => !ids.has(id)).map((id) => `${task.id} requires ${id}, which no task has`),
  );
  return [
    ...repeatedBlocks.map(([code]) => `block ${code} is listed twice`),
    ...outside.map(({ task, block }) => `${task.id} sits in block ${block.code}`),
    ...readRepeated(tasks.map((task) => task.id)).map(([id, count]) => `${id} is given to ${count} tasks`),
    ...unknown,
    ...findCycles(tasks).map((cycle) => `a cycle: ${cycle.join(' → ')}`),
  ];
}

/** The done tasks whose commit `hasCommit` does not find. */
export function findMissingCommits(roadmap: Roadmap, hasCommit: (sha: string) => boolean): string[] {
  return readBlocksOnce(roadmap)
    .flatMap((block) => block.tasks)
    .flatMap((task) =>
      task.commit === undefined || hasCommit(task.commit)
        ? []
        : [`${task.id} cites ${task.commit}, which this repo does not have`],
    );
}
