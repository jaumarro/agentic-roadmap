import { describeHealthProblem, type Health, type HealthProblem } from './health.ts';
import type { Roadmap } from './model.ts';
import type { FreeTask, InProgress } from './free.ts';
import { type Progress, type Row, STATES } from './query.ts';
import type { ShownTask, Wait } from './state.ts';

const RISKY_MARK = ' ⚠︎';
const CRITICAL_MARK = ' (critical)';

function renderRow(row: Row, idWidth: number, stateWidth: number): string {
  const marks = `${row.critical ? CRITICAL_MARK : ''}${row.risky ? RISKY_MARK : ''}`;
  return `  ${row.id.padEnd(idWidth)}  ${row.state.padEnd(stateWidth)}  ${row.title}${marks}\n`;
}

function renderWave(wave: number, rows: Row[], idWidth: number, stateWidth: number): string {
  const count = rows.length === 1 ? '1 task' : `${rows.length} tasks`;
  return `Wave ${wave} · ${count}\n${rows.map((row) => renderRow(row, idWidth, stateWidth)).join('')}`;
}

/**
 * Rows sorted by `sortByWave` under a heading per wave: everything in a wave can run at once, and each waits only on
 * earlier waves. Parallel tracks get their own waves, under their own heading.
 */
export function renderWaves(rows: Row[]): string {
  if (rows.length === 0) return 'No task left matches.\n';
  const idWidth = Math.max(...rows.map((row) => row.id.length));
  const stateWidth = Math.max(...STATES.map((state) => state.length));
  const renderGroup = (group: Row[]) => {
    const waves = [...new Set(group.map((row) => row.wave ?? 0))];
    return waves
      .map((wave) =>
        renderWave(
          wave,
          group.filter((row) => row.wave === wave),
          idWidth,
          stateWidth,
        ),
      )
      .join('');
  };
  const tracks = rows.filter((row) => row.track);
  const trackSection = tracks.length === 0 ? '' : `\nParallel tracks\n${renderGroup(tracks)}`;
  return `${renderGroup(rows.filter((row) => !row.track))}${trackSection}`;
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
        .map((row) => {
          const mark = row.risky ? RISKY_MARK : '';
          return `  ${row.id.padEnd(idWidth)}  ${row.state.padEnd(stateWidth)}  ${row.title}${mark}\n`;
        });
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
  if (shown.branches.length > 0) return `Started on ${shown.branches.join(', ')}.`;
  return shown.state === 'ready' ? 'Ready to take.' : 'Waiting: run «why» to see on what.';
}

function listRefs(title: string, refs: ShownTask['requires']): string {
  if (refs.length === 0) return `${title}: nothing\n`;
  return `${title}:\n${refs.map((ref) => `  ${ref.id} · ${ref.title} (${ref.state})\n`).join('')}`;
}

/** A task as a person reads it: what it is, where it stands, and what it needs and opens. */
export function renderShown(shown: ShownTask): string {
  const mark = shown.risky ? RISKY_MARK : '';
  const review = shown.risky ? '  Risky: it gets a full review.\n' : '';
  return [
    `${shown.id} · ${shown.title}${mark}\n`,
    `  Block: ${shown.block} · ${shown.blockName}\n`,
    `  Done when: ${shown.doneWhen}\n`,
    `  Size: ${readLines(shown.lines)}\n`,
    review,
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

// The rest is noise until these are fixed; --json keeps every problem.
const PROBLEMS_SHOWN = 5;

function readProblems(problems: HealthProblem[]): string {
  if (problems.length === 0) return 'No problems.\n';
  const shown = problems.slice(0, PROBLEMS_SHOWN).map(describeHealthProblem);
  const more = problems.length - shown.length;
  const words = more > 0 ? [...shown, `… and ${more} more: health --json lists every one`] : shown;
  return `Problems, worst first:\n${words.map((problem, at) => `  ${at + 1}. ${problem}\n`).join('')}`;
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

function readPercent(done: number, total: number): string {
  return total === 0 ? '—' : `${Math.round((done / total) * 100)} %`;
}

export function renderProgress(progress: Progress[]): string {
  const done = progress.reduce((sum, block) => sum + block.done, 0);
  const total = progress.reduce((sum, block) => sum + block.total, 0);
  const rows = [
    ...progress.map((block) => [
      `${block.code} · ${block.name}`,
      `${block.done} / ${block.total}`,
      readPercent(block.done, block.total),
    ]),
    ['All', `${done} / ${total}`, readPercent(done, total)],
  ];
  const widths = [0, 1].map((column) => Math.max(...rows.map((row) => row[column]?.length ?? 0)));
  return rows
    .map(
      ([name = '', count = '', percent = '']) =>
        `${name.padEnd(widths[0] ?? 0)}  ${count.padEnd(widths[1] ?? 0)}  ${percent}\n`,
    )
    .join('');
}

/**
 * The first `count` free tasks, one per session, each with the branch to start it on. Past the plan's `width`, more
 * sessions only wait on each other, so asking for more says so.
 */
export function renderFree(free: FreeTask[], count: number, width: number): string {
  const taken = free.slice(0, count);
  if (taken.length === 0) return 'No task is free to take.\n';
  const rows = taken.map((task, at) => `${at + 1}. ${task.id} · ${task.title}\n   Branch: ${task.branchPrefix}…\n`);
  const fewer = taken.length < count ? `Only ${taken.length} free, of the ${count} asked.\n` : '';
  const sessions = width === 1 ? '1 session' : `${width} sessions`;
  const wide = count > width ? `The plan keeps at most ${sessions} busy at once.\n` : '';
  return `${rows.join('')}${fewer}${wide}`;
}

/** Why next has no task to give: no tasks, all of them done, or every one left waiting. */
export function describeNothingReady(roadmap: Roadmap): string {
  const tasks = roadmap.blocks.flatMap((block) => block.tasks);
  if (tasks.length === 0) return 'The plan has no tasks yet.';
  if (tasks.every((task) => task.commit !== undefined)) return 'Everything is done.';
  return 'Nothing is ready: every task left waits on one that is not done.';
}

/** The tasks a branch started, under their own heading; nothing for none. */
export function renderInProgress(inProgress: InProgress[]): string {
  if (inProgress.length === 0) return '';
  const lines = inProgress.map((task) => `  ${task.id} · ${task.title} (on ${task.branches.join(', ')})\n`);
  return `\nIn progress:\n${lines.join('')}`;
}
