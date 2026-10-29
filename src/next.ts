import { analyze } from './analyze.ts';
import { isOnTrack, readChapterOf } from './chapters.ts';
import { isUnblocked, readDoneIds, type Roadmap, type Task } from './model.ts';

/** Where `task` stands in the focus: the first entry naming it or its block, and past every entry when none does. */
function readFocusRank(focus: string[], task: Task): number {
  const code = task.id.split('.')[0];
  const at = focus.findIndex((entry) => entry === task.id || entry === code);
  return at === -1 ? focus.length : at;
}

/**
 * The tasks not done whose requirements are all done: those the focus names first, in its order, then the one holding
 * up the heaviest chain of work, a risky one last; a tie keeps the plan's order. Taking the task the most work waits on
 * first (highest level first) keeps the most sessions busy later. A parallel track's task is another session's work,
 * so it is here only when focused.
 */
export function listReady(roadmap: Roadmap): Task[] {
  const focus = roadmap.focus ?? [];
  const tasks = roadmap.blocks.flatMap((block) => block.tasks);
  const done = readDoneIds(roadmap);
  const chapterOf = readChapterOf(roadmap);
  const ready = tasks.filter(
    (task) =>
      task.commit === undefined &&
      isUnblocked(task, done) &&
      (!isOnTrack(chapterOf, task) || readFocusRank(focus, task) < focus.length),
  );
  const shape = analyze(roadmap).tasks;
  const bottomLevel = (task: Task) => shape.get(task.id)?.bottomLevel ?? 0;
  return ready.toSorted(
    (a, b) =>
      readFocusRank(focus, a) - readFocusRank(focus, b) ||
      bottomLevel(b) - bottomLevel(a) ||
      Number(a.risky === true) - Number(b.risky === true),
  );
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
