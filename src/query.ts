import type { Health } from './health.ts';
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
  if (lines === 'doc') return 'a document';
  const unit = lines === 1 ? 'line' : 'lines';
  return `~${lines} ${unit}`;
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
    .map((wait) => {
      const mark = wait.seenAbove ? ', see above' : '';
      return `${indent}${wait.id} · ${wait.title} (${wait.state}${mark})\n${renderWaits(wait.waitsOn, depth + 1)}`;
    })
    .join('');
}

/** Why task `id` cannot be taken yet: the tree of what it waits on, down to what can be taken now. */
export function renderWhy(id: string, state: string, waits: Wait[]): string {
  if (state === 'done') return `${id} is done.\n`;
  if (waits.length === 0) return `${id} waits on nothing: it is ${state}.\n`;
  return `${id} waits on:\n${renderWaits(waits, 1)}`;
}

function readProblems(problems: string[]): string {
  if (problems.length === 0) return 'No problems.\n';
  return `Problems, worst first:\n${problems.map((problem, at) => `  ${at + 1}. ${problem}\n`).join('')}`;
}

// A longer chain reads as its start and its end; --json keeps every task.
const CHAIN_SHOWN = 8;

function shortenChain(ids: string[]): string {
  if (ids.length <= CHAIN_SHOWN) return ids.join(' → ');
  const left = ids.length - 6;
  return [...ids.slice(0, 3), `… ${left} more …`, ...ids.slice(-3)].join(' → ');
}

function countTasks(count: number): string {
  const noun = count === 1 ? 'task' : 'tasks';
  return `${count} ${noun}`;
}

/** The plan's health as a person reads it: its shape in a few figures, then what to fix first. */
export function renderHealth(health: Health): string {
  if (health.tasksLeft === 0) return 'Everything is done: there is no plan left to measure.\n';
  const { criticalPath } = health;
  const chain = shortenChain(criticalPath.tasks);
  const crossing = Math.round(health.crossBlockShare * 100);
  const left = countTasks(health.tasksLeft);
  const onPath = countTasks(criticalPath.tasks.length);
  return [
    `Plan health: ${left} left, ~${health.workLeft} lines\n`,
    `  Critical path   ~${criticalPath.lines} lines over ${onPath}: ${chain}\n`,
    `  Parallelism     ${health.parallelism.toFixed(1)} sessions busy on average (work left ÷ critical path)\n`,
    `  Width           ${health.width} tasks at most at once · ${health.readyNow} ready now\n`,
    `  Across blocks   ${crossing} % of requirements\n`,
    '\n',
    readProblems(health.problems),
  ].join('');
}
