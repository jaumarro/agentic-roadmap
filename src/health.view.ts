import { type Comparison, type Figure, FIGURES, listNewProblems } from './health.compare.service.ts';
import { describeHealthProblem, type Health, type HealthProblem } from './health.service.ts';

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

function readFigure(figure: Figure, health: Health): string {
  const value = figure.read(health);
  return figure.key === 'parallelism' ? value.toFixed(1) : `${value}`;
}

/** One line of what a change did to the figures it moved, worse ones marked, then each problem it brought in. */
export function renderDelta(comparison: Comparison): string {
  const { before, after, worse } = comparison;
  const moved = FIGURES.filter((figure) => readFigure(figure, before) !== readFigure(figure, after)).map((figure) => {
    const mark = worse.includes(figure.key) ? ' (worse)' : '';
    return `${figure.name} ${readFigure(figure, before)} → ${readFigure(figure, after)}${mark}`;
  });
  const line = moved.length === 0 ? 'Health: no figure moved.\n' : `Health: ${moved.join(' · ')}\n`;
  return (
    line +
    listNewProblems(comparison)
      .map((problem) => `  New problem: ${describeHealthProblem(problem)}\n`)
      .join('')
  );
}

function readRow(label: string, was: string, is: string, isWorse: boolean): string {
  const mark = isWorse ? '  (worse)' : '';
  return `  ${label.padEnd(15)} ${was} → ${is}${mark}\n`;
}

/** The comparison as a person reads it: each figure before and after, worse ones marked, then the new problems. */
export function renderComparison(comparison: Comparison): string {
  const { before, after, worse } = comparison;
  const added = listNewProblems(comparison).map(describeHealthProblem);
  const newProblems =
    added.length === 0
      ? 'No new problems.\n'
      : `New problems:\n${added.map((p, at) => `  ${at + 1}. ${p}\n`).join('')}`;
  return [
    `Plan health here against ${comparison.against}:\n`,
    readRow('Tasks left', `${before.tasksLeft}`, `${after.tasksLeft}`, false),
    readRow('Work left', `~${before.workLeft}`, `~${after.workLeft} lines`, false),
    readRow(
      'Critical path',
      `~${before.criticalPath.lines}`,
      `~${after.criticalPath.lines} lines`,
      worse.includes('criticalPath'),
    ),
    readRow('Parallelism', before.parallelism.toFixed(1), after.parallelism.toFixed(1), worse.includes('parallelism')),
    readRow('Width', `${before.width}`, `${after.width}`, worse.includes('width')),
    readRow('Problems', `${before.problems.length}`, `${after.problems.length}`, worse.includes('problems')),
    '\n',
    newProblems,
  ].join('');
}
