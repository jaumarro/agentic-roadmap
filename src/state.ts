import type { Roadmap, Task } from './model.ts';
import { namesTask } from './next.ts';

/** Where a task stands: closed with a commit, on a branch, free to take, or waiting on a task not done. */
export type TaskState = 'done' | 'started' | 'ready' | 'waiting';

/** Each task's state, by id, given the repo's local branches. */
export function readStates(roadmap: Roadmap, branches: string[]): Map<string, TaskState> {
  const tasks = roadmap.blocks.flatMap((block) => block.tasks);
  const done = new Set(tasks.filter((task) => task.commit !== undefined).map((task) => task.id));
  const readState = (task: Task): TaskState => {
    if (done.has(task.id)) return 'done';
    if (branches.some((branch) => namesTask(branch, task.id))) return 'started';
    return task.requires.every((id) => done.has(id)) ? 'ready' : 'waiting';
  };
  return new Map(tasks.map((task) => [task.id, readState(task)]));
}

type TaskRef = { id: string; title: string; state: TaskState };

export type ShownTask = TaskRef & {
  block: { code: string; name: string };
  doneWhen: string;
  lines: number | 'doc';
  commit: string | null;
  startedOn: string[];
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
    block: { code: block.code, name: block.name },
    doneWhen: task.doneWhen,
    lines: task.lines,
    commit: task.commit ?? null,
    startedOn: branches.filter((branch) => namesTask(branch, id)),
    requires: tasks.filter((each) => task.requires.includes(each.id)).map(refer),
    unblocks: tasks.filter((each) => each.requires.includes(id)).map(refer),
  };
}

export type Wait = TaskRef & { waitsOn: Wait[] };

/** The requirements of task `id` not done yet, each with its own, down to the ones that can be taken now. */
export function explainWait(roadmap: Roadmap, branches: string[], id: string): Wait[] {
  const states = readStates(roadmap, branches);
  const byId = new Map(roadmap.blocks.flatMap((block) => block.tasks).map((task) => [task.id, task]));
  // Kept per task: a requirement shared by many paths is walked once, not once per path.
  const walked = new Map<string, Wait[]>();
  const walk = (taskId: string): Wait[] => {
    const known = walked.get(taskId);
    if (known !== undefined) return known;
    const waits = (byId.get(taskId)?.requires ?? []).flatMap((required) => {
      const task = byId.get(required);
      const state = states.get(required);
      if (task === undefined || state === undefined || state === 'done') return [];
      return [{ id: task.id, title: task.title, state, waitsOn: walk(task.id) }];
    });
    walked.set(taskId, waits);
    return waits;
  };
  return walk(id);
}
