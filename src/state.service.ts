import { isUnblocked, readDoneIds, type Roadmap, type Task } from './roadmap.model.ts';
import { namesTask } from './next.service.ts';

/** Where a task stands: closed with a commit, on a branch, free to take, or waiting on a task not done. */
export type TaskState = 'done' | 'started' | 'ready' | 'waiting';

/** Each task's state, by id, given the repo's local branches. */
export function readStates(roadmap: Roadmap, branches: string[]): Map<string, TaskState> {
  const tasks = roadmap.blocks.flatMap((block) => block.tasks);
  const done = readDoneIds(roadmap);
  const readState = (task: Task): TaskState => {
    if (done.has(task.id)) return 'done';
    if (branches.some((branch) => namesTask(branch, task.id))) return 'started';
    return isUnblocked(task, done) ? 'ready' : 'waiting';
  };
  return new Map(tasks.map((task) => [task.id, readState(task)]));
}

type TaskRef = { id: string; title: string; state: TaskState };

export type ShownTask = TaskRef & {
  block: string;
  blockName: string;
  doneWhen: string;
  lines: number | 'doc';
  risky: boolean;
  commit: string | null;
  branches: string[];
  requires: TaskRef[];
  unblocks: TaskRef[];
};

/** Everything about task `id`: its block, what it requires and unblocks, and where it stands; null when unknown. */
export function describeTask(roadmap: Roadmap, branches: string[], id: string): ShownTask | null {
  const block = roadmap.blocks.find((each) => each.tasks.some((task) => task.id === id));
  const task = block?.tasks.find((each) => each.id === id);
  if (block === undefined || task === undefined) return null;
  const states = readStates(roadmap, branches);
  const tasks = roadmap.blocks.flatMap((each) => each.tasks);
  const refer = (each: Task): TaskRef => ({ id: each.id, title: each.title, state: states.get(each.id) ?? 'waiting' });
  return {
    ...refer(task),
    block: block.code,
    blockName: block.name,
    doneWhen: task.doneWhen,
    lines: task.lines,
    risky: task.risky === true,
    commit: task.commit ?? null,
    branches: branches.filter((branch) => namesTask(branch, id)),
    requires: tasks.filter((each) => task.requires.includes(each.id)).map(refer),
    unblocks: tasks.filter((each) => each.requires.includes(id)).map(refer),
  };
}

/** A requirement not done; one already shown on an earlier path is `seenAbove`, with what it waits on left out. */
export type Wait = TaskRef & { seenAbove: boolean; waitsOn: Wait[] };

/**
 * The requirements of task `id` not done yet, each with its own, down to the ones that can be taken now. Each task is
 * expanded once, depth first: on a plan full of diamonds the full tree grows exponentially with its depth.
 */
export function explainWait(roadmap: Roadmap, branches: string[], id: string): Wait[] {
  const states = readStates(roadmap, branches);
  const byId = new Map(roadmap.blocks.flatMap((block) => block.tasks).map((task) => [task.id, task]));
  const shown = new Set<string>();
  const walk = (taskId: string): Wait[] =>
    (byId.get(taskId)?.requires ?? []).flatMap((required): Wait[] => {
      const task = byId.get(required);
      const state = states.get(required);
      if (task === undefined || state === undefined || state === 'done') return [];
      const ref = { id: task.id, title: task.title, state };
      if (shown.has(task.id)) return [{ ...ref, seenAbove: true, waitsOn: [] }];
      shown.add(task.id);
      return [{ ...ref, seenAbove: false, waitsOn: walk(task.id) }];
    });
  return walk(id);
}
