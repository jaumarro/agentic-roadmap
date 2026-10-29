import { analyze } from './roadmap.analysis.service.ts';
import { isOnTrack, readChapterOf } from './chapters.service.ts';
import type { Roadmap } from './roadmap.model.ts';
import { readStates, type TaskState } from './state.service.ts';

export const STATES: TaskState[] = ['done', 'started', 'ready', 'waiting'];

export type Row = {
  id: string;
  block: string;
  state: TaskState;
  title: string;
  risky: boolean;
  /** Its wave among the tasks not done; null once done. */
  wave: number | null;
  /** On the heaviest chain of work left: a delay to it delays the plan. */
  critical: boolean;
  /** On a parallel track, which next and free leave to its own sessions. */
  track: boolean;
};

/** Every task as a row, in the plan's order, narrowed to `block` and `state` when given. */
export function listRows(roadmap: Roadmap, branches: string[], filter: { block?: string; state?: TaskState }): Row[] {
  const states = readStates(roadmap, branches);
  const shape = analyze(roadmap).tasks;
  const chapterOf = readChapterOf(roadmap);
  return roadmap.blocks
    .filter((block) => filter.block === undefined || block.code === filter.block)
    .flatMap((block) =>
      block.tasks.map((task) => ({
        id: task.id,
        block: block.code,
        state: states.get(task.id) ?? 'waiting',
        title: task.title,
        risky: task.risky === true,
        wave: shape.get(task.id)?.wave ?? null,
        critical: shape.get(task.id)?.float === 0,
        track: isOnTrack(chapterOf, task),
      })),
    )
    .filter((row) => filter.state === undefined || row.state === filter.state);
}

/** The rows not done in waves, focused ones first within each, with the parallel tracks' after, apart. */
export function sortByWave(rows: Row[], focus: string[]): Row[] {
  const rank = (row: Row) => {
    const at = focus.findIndex((entry) => entry === row.id || entry === row.block);
    return at === -1 ? focus.length : at;
  };
  return rows
    .filter((row) => row.wave !== null)
    .toSorted((a, b) => Number(a.track) - Number(b.track) || (a.wave ?? 0) - (b.wave ?? 0) || rank(a) - rank(b));
}

/** Each block's progress, and the whole plan's. */
export type Progress = { code: string; name: string; done: number; total: number };

export function measureProgress(roadmap: Roadmap): Progress[] {
  return roadmap.blocks.map((block) => ({
    code: block.code,
    name: block.name,
    done: block.tasks.filter((task) => task.commit !== undefined).length,
    total: block.tasks.length,
  }));
}
