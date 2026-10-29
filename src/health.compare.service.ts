import { readOnBranches, resolveCommit } from './git.adapter.ts';
import { describeHealthProblem, type Health, type HealthProblem } from './health.service.ts';
import type { Roadmap } from './roadmap.model.ts';
import { ROADMAP_DIR, RoadmapError } from './roadmap.model.ts';
import { readRoadmapWith } from './roadmap.repository.ts';

/** The roadmap as `revision` has it, read from git without checking it out. */
export function readRoadmapAt(root: string, revision: string): Roadmap {
  if (resolveCommit(root, revision) === null) throw new RoadmapError(`This repo has no ${revision} to compare with.`);
  return readRoadmapWith((file) => {
    // `./` makes the path relative to `root`, wherever the repo's top is.
    const [text] = readOnBranches(root, `./${ROADMAP_DIR}/${file}`, [revision]);
    if (text === undefined) throw new RoadmapError(`${ROADMAP_DIR}/${file} is missing on ${revision}.`);
    return text;
  });
}

/** A figure by the key `health --json` gives it. */
export type FigureKey = 'criticalPath' | 'parallelism' | 'width' | 'problems';

export type Comparison = { against: string; before: Health; after: Health; worse: FigureKey[] };

type Figure = { key: FigureKey; name: string; read: (health: Health) => number; better: 'lower' | 'higher' };

const FIGURES: Figure[] = [
  { key: 'criticalPath', name: 'critical path', read: (health) => health.criticalPath.lines, better: 'lower' },
  { key: 'parallelism', name: 'parallelism', read: (health) => health.parallelism, better: 'higher' },
  { key: 'width', name: 'width', read: (health) => health.width, better: 'higher' },
  { key: 'problems', name: 'problems', read: (health) => health.problems.length, better: 'lower' },
];

/** The plan's health here against `against`'s: what each figure was and is, and which got worse. */
export function compareHealth(against: string, before: Health, after: Health): Comparison {
  const worse = FIGURES.filter((figure) => {
    const was = figure.read(before);
    const is = figure.read(after);
    // Rounded as shown, so a change too small to read is not called worse.
    const changed = Math.round(is * 10) !== Math.round(was * 10);
    return changed && (figure.better === 'lower' ? is > was : is < was);
  }).map((figure) => figure.key);
  return { against, before, after, worse };
}

function readFigure(figure: Figure, health: Health): string {
  const value = figure.read(health);
  return figure.name === 'parallelism' ? value.toFixed(1) : `${value}`;
}

// The same problem with a new figure, as a queue at parallelism 1.2 instead of 1.1, is not a new one.
function identifyProblem(problem: HealthProblem): string {
  switch (problem.kind) {
    case 'oversized':
    case 'bottleneck':
      return `${problem.kind} ${problem.task}`;
    case 'queue':
      return problem.kind;
    case 'redundant':
    case 'backward':
      return `${problem.kind} ${JSON.stringify(problem.requirements)}`;
  }
  return problem satisfies never;
}

function listNewProblems(comparison: Comparison): string[] {
  const known = new Set(comparison.before.problems.map(identifyProblem));
  return comparison.after.problems.filter((problem) => !known.has(identifyProblem(problem))).map(describeHealthProblem);
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
      .map((problem) => `  New problem: ${problem}\n`)
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
  const added = listNewProblems(comparison);
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
