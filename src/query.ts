import type { Roadmap } from './model.ts';
import { readStates, type ShownTask, type TaskState, type Wait } from './state.ts';

export const STATES: TaskState[] = ['done', 'started', 'ready', 'waiting'];

export type Row = { id: string; block: string; state: TaskState; title: string };

/** Every task as a row, in the plan's order, narrowed to `block` and `state` when given. */
export function listRows(roadmap: Roadmap, branches: string[], filter: { block?: string; state?: TaskState }): Row[] {
  const states = readStates(roadmap, branches);
  return roadmap.blocks
    .filter((block) => filter.block === undefined || block.code === filter.block)
    .flatMap((block) =>
      block.tasks.map((task) => ({
        id: task.id,
        block: block.code,
        state: states.get(task.id) ?? 'waiting',
        title: task.title,
      })),
    )
    .filter((row) => filter.state === undefined || row.state === filter.state);
}

/** The rows under their block's heading, each heading with how much of the whole block is done. */
export function renderList(roadmap: Roadmap, rows: Row[]): string {
  if (rows.length === 0) return 'No task matches.\n';
  const idWidth = Math.max(...rows.map((row) => row.id.length));
  const stateWidth = Math.max(...STATES.map((state) => state.length));
  return roadmap.blocks
    .filter((block) => rows.some((row) => row.block === block.code))
    .map((block) => {
      const done = block.tasks.filter((task) => task.commit !== undefined).length;
      const heading = `${block.code} · ${block.name} (${done}/${block.tasks.length} done)\n`;
      const lines = rows
        .filter((row) => row.block === block.code)
        .map((row) => `  ${row.id.padEnd(idWidth)}  ${row.state.padEnd(stateWidth)}  ${row.title}\n`);
      return heading + lines.join('');
    })
    .join('');
}

function readLines(lines: number | 'doc'): string {
  return lines === 'doc' ? 'a document' : `~${lines} lines`;
}

function readPlace(shown: ShownTask): string {
  if (shown.commit !== null) return `Done with ${shown.commit}.`;
  if (shown.startedOn.length > 0) return `Started on ${shown.startedOn.join(', ')}.`;
  return shown.state === 'ready' ? 'Ready to take.' : 'Waiting: run «why» to see on what.';
}

function listRefs(title: string, refs: ShownTask['requires']): string {
  if (refs.length === 0) return `${title}: nothing\n`;
  return `${title}:\n${refs.map((ref) => `  ${ref.id} · ${ref.title} (${ref.state})\n`).join('')}`;
}

/** A task as a person reads it: what it is, where it stands, and what it needs and opens. */
export function renderShown(shown: ShownTask): string {
  return [
    `${shown.id} · ${shown.title}\n`,
    `  Block: ${shown.block.code} · ${shown.block.name}\n`,
    `  Done when: ${shown.doneWhen}\n`,
    `  Size: ${readLines(shown.lines)}\n`,
    `  ${readPlace(shown)}\n`,
    listRefs('Requires', shown.requires),
    listRefs('Unblocks', shown.unblocks),
  ].join('');
}

function renderWaits(waits: Wait[], depth: number): string {
  const indent = '  '.repeat(depth);
  return waits
    .map((wait) => `${indent}${wait.id} · ${wait.title} (${wait.state})\n${renderWaits(wait.waitsOn, depth + 1)}`)
    .join('');
}

/** Why task `id` cannot be taken yet: the tree of what it waits on, down to what can be taken now. */
export function renderWhy(id: string, state: string, waits: Wait[]): string {
  if (state === 'done') return `${id} is done.\n`;
  if (waits.length === 0) return `${id} waits on nothing: it is ${state}.\n`;
  return `${id} waits on:\n${renderWaits(waits, 1)}`;
}
