import type { Roadmap, Task } from './model.ts';

/** The tasks not done whose requirements are all done, fewest requirements first, then in the plan's order. */
export function listReady(roadmap: Roadmap): Task[] {
  const tasks = roadmap.blocks.flatMap((block) => block.tasks);
  const done = new Set(tasks.filter((task) => task.commit !== undefined).map((task) => task.id));
  const ready = tasks.filter((task) => task.commit === undefined && task.requires.every((id) => done.has(id)));
  return ready.toSorted((a, b) => a.requires.length - b.requires.length);
}

function readSlug(id: string): string {
  return id.toLowerCase().replace('.', '-');
}

/** The branch name that marks a task started: its id in lower case with a hyphen. */
export function readBranchName(id: string): string {
  return `${readSlug(id)}/`;
}

/** Whether `branch` names task `id`: one of its parts is the slug or starts with it and a hyphen (`abc-1/x`). */
export function namesTask(branch: string, id: string): boolean {
  const slug = readSlug(id);
  return branch.split('/').some((part) => part === slug || part.startsWith(`${slug}-`));
}
