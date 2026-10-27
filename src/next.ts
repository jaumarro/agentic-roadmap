import type { Roadmap, Task } from './model.ts';

/** The tasks not done whose requirements are all done, fewest requirements first, then in the plan's order. */
export function listReady(roadmap: Roadmap): Task[] {
  const tasks = roadmap.blocks.flatMap((block) => block.tasks);
  const done = new Set(tasks.filter((task) => task.commit !== undefined).map((task) => task.id));
  const ready = tasks.filter((task) => task.commit === undefined && task.requires.every((id) => done.has(id)));
  return ready.toSorted((a, b) => a.requires.length - b.requires.length);
}

/** The branch name that marks a task started: its id in lower case with a hyphen. */
export function readBranchName(id: string): string {
  return `${id.toLowerCase().replace('.', '-')}/`;
}
