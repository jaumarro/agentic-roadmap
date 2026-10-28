import type { Roadmap } from './model.ts';
import { listReady, namesTask, readBranchName } from './next.ts';
import { readStates } from './state.ts';

/** A task free to take, with what one session needs to start it. */
export type FreeTask = { id: string; block: string; title: string; doneWhen: string; risky: boolean; branch: string };

export type InProgress = { id: string; title: string; branches: string[] };

/** The tasks free to take, in next's order: ready, and no branch started them. */
export function listFree(roadmap: Roadmap, branches: string[]): FreeTask[] {
  const states = readStates(roadmap, branches);
  const blockOf = new Map(roadmap.blocks.flatMap((block) => block.tasks.map((task) => [task.id, block.code])));
  return listReady(roadmap)
    .filter((task) => states.get(task.id) === 'ready')
    .map((task) => ({
      id: task.id,
      block: blockOf.get(task.id) ?? '',
      title: task.title,
      doneWhen: task.doneWhen,
      risky: task.risky === true,
      branch: readBranchName(task.id),
    }));
}

/** The tasks not done that a branch already started, with those branches. */
export function listInProgress(roadmap: Roadmap, branches: string[]): InProgress[] {
  return roadmap.blocks
    .flatMap((block) => block.tasks)
    .filter((task) => task.commit === undefined)
    .flatMap((task) => {
      const on = branches.filter((branch) => namesTask(branch, task.id));
      return on.length === 0 ? [] : [{ id: task.id, title: task.title, branches: on }];
    });
}

/**
 * The first `count` free tasks, one per session, each with the branch to start it on. Past the plan's `width`, more
 * sessions only wait on each other, so asking for more says so.
 */
export function renderFree(free: FreeTask[], count: number, width: number): string {
  const taken = free.slice(0, count);
  if (taken.length === 0) return 'No task is free to take.\n';
  const rows = taken.map((task, at) => `${at + 1}. ${task.id} · ${task.title}\n   Branch: ${task.branch}…\n`);
  const fewer = taken.length < count ? `Only ${taken.length} free, of the ${count} asked.\n` : '';
  const sessions = width === 1 ? '1 session' : `${width} sessions`;
  const wide = count > width ? `The plan keeps at most ${sessions} busy at once.\n` : '';
  return `${rows.join('')}${fewer}${wide}`;
}
