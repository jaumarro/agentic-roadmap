import type { Health, HealthProblem } from './health.service.ts';

/** A figure by the key `health --json` gives it. */
export type FigureKey = 'criticalPath' | 'parallelism' | 'width' | 'problems';

export type Comparison = { against: string; before: Health; after: Health; worse: FigureKey[] };

/** A figure the comparison weighs: its key, its name in words, how to read it, and which way is better. */
export type Figure = { key: FigureKey; name: string; read: (health: Health) => number; better: 'lower' | 'higher' };

export const FIGURES: Figure[] = [
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

/** The problems the plan has now that it did not have before. */
export function listNewProblems(comparison: Comparison): HealthProblem[] {
  const known = new Set(comparison.before.problems.map(identifyProblem));
  return comparison.after.problems.filter((problem) => !known.has(identifyProblem(problem)));
}
