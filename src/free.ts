import type { Roadmap } from './model.ts';
import { listReady, namesTask, readBranchName } from './next.ts';
import { readStates } from './state.ts';

/** A task free to take, with what one session needs to start it. */
export type FreeTask = {
  id: string;
  block: string;
  title: string;
  doneWhen: string;
  risky: boolean;
  /** How the branch that starts it begins: its id in lower case and a slash, as `log-2/`. */
  branchPrefix: string;
};

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
      branchPrefix: readBranchName(task.id),
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
