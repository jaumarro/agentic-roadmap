import { readOnBranches, resolveCommit } from './git.ts';
import type { Health } from './health.ts';
import type { Roadmap } from './model.ts';
import { readRoadmapWith, ROADMAP_DIR, RoadmapError } from './source.ts';

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

export type Comparison = { against: string; before: Health; after: Health; worse: string[] };

type Figure = { name: string; read: (health: Health) => number; better: 'lower' | 'higher' };

const FIGURES: Figure[] = [
  { name: 'critical path', read: (health) => health.criticalPath.lines, better: 'lower' },
  { name: 'parallelism', read: (health) => health.parallelism, better: 'higher' },
  { name: 'width', read: (health) => health.width, better: 'higher' },
  { name: 'problems', read: (health) => health.problems.length, better: 'lower' },
];

/** The plan's health here against `against`'s: what each figure was and is, and which got worse. */
export function compareHealth(against: string, before: Health, after: Health): Comparison {
  const worse = FIGURES.filter((figure) => {
    const was = figure.read(before);
    const is = figure.read(after);
    // Rounded as shown, so a change too small to read is not called worse.
    const changed = Math.round(is * 10) !== Math.round(was * 10);
    return changed && (figure.better === 'lower' ? is > was : is < was);
  }).map((figure) => figure.name);
  return { against, before, after, worse };
}

function readRow(label: string, was: string, is: string, isWorse: boolean): string {
  const mark = isWorse ? '  (worse)' : '';
  return `  ${label.padEnd(15)} ${was} → ${is}${mark}\n`;
}

/** The comparison as a person reads it: each figure before and after, worse ones marked, then the new problems. */
export function renderComparison(comparison: Comparison): string {
  const { before, after, worse } = comparison;
  const added = after.problems.filter((problem) => !before.problems.includes(problem));
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
      worse.includes('critical path'),
    ),
    readRow('Parallelism', before.parallelism.toFixed(1), after.parallelism.toFixed(1), worse.includes('parallelism')),
    readRow('Width', `${before.width}`, `${after.width}`, worse.includes('width')),
    readRow('Problems', `${before.problems.length}`, `${after.problems.length}`, worse.includes('problems')),
    '\n',
    newProblems,
  ].join('');
}
