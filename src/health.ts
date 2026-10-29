import { analyze, readCriticalPath, weigh } from './analyze.ts';
import { isUnblocked, readDoneIds, type Roadmap, type Task } from './model.ts';

const SIZE_CAP = 150;
// Below this, sessions run in parallel mostly wait on each other.
const QUEUE_PARALLELISM = 1.5;
const BOTTLENECK_SHARE = 0.4;

type Redundant = { id: string; requires: string; through: string };
type Backward = { id: string; requires: string };

/** A problem in the plan's shape, as data; `describeHealthProblem` gives it in words, with what to do. */
export type HealthProblem =
  | { kind: 'oversized'; task: string; lines: number }
  | { kind: 'queue'; parallelism: number }
  | { kind: 'bottleneck'; task: string; share: number }
  | { kind: 'redundant'; requirements: Redundant[] }
  | { kind: 'backward'; requirements: Backward[] };

export type Health = {
  tasksLeft: number;
  /** The weight of every task not done, in lines. */
  workLeft: number;
  /** The heaviest chain of tasks not done, each needing the one before: the least time even with endless sessions. */
  criticalPath: { lines: number; tasks: string[] };
  /** Work left over the critical path: how many sessions the plan keeps busy on average. */
  parallelism: number;
  /** The most tasks not done that could run at once: none of them needs another. */
  width: number;
  readyNow: number;
  /** The tasks not done most of the rest waits on, worst first; `ready` when it can be taken now. */
  bottlenecks: { id: string; blocks: number; share: number; ready: boolean }[];
  /** Requirements a longer path already implies. */
  redundant: Redundant[];
  /** Of every requirement, the share that crosses into another block. */
  crossBlockShare: number;
  /** Requirements on a block listed after the task's own: the blocks' order says the opposite of the plan. */
  backward: Backward[];
  oversized: { id: string; lines: number }[];
  /** Every problem, worst first. */
  problems: HealthProblem[];
};

/** What each task needs, directly or through others. */
function readAncestors(byId: Map<string, Task>): Map<string, Set<string>> {
  const ancestors = new Map<string, Set<string>>();
  const visit = (id: string): Set<string> => {
    const known = ancestors.get(id);
    if (known !== undefined) return known;
    const found = new Set<string>();
    ancestors.set(id, found);
    for (const required of byId.get(id)?.requires ?? []) {
      if (!byId.has(required)) continue;
      found.add(required);
      for (const above of visit(required)) found.add(above);
    }
    return found;
  };
  for (const id of byId.keys()) visit(id);
  return ancestors;
}

/**
 * The largest set of tasks no one of which needs another (Dilworth): the tasks less the most pairs a chain cover can
 * join, found as a matching between each task and the tasks that need it, directly or not.
 */
function measureWidth(pending: Task[], ancestors: Map<string, Set<string>>): number {
  const ids = pending.map((task) => task.id);
  const pendingIds = new Set(ids);
  const later = new Map(ids.map((id) => [id, ids.filter((other) => ancestors.get(other)?.has(id) === true)]));
  const matchedTo = new Map<string, string>();
  const augment = (id: string, seen: Set<string>): boolean =>
    (later.get(id) ?? []).some((next) => {
      if (seen.has(next)) return false;
      seen.add(next);
      const holder = matchedTo.get(next);
      if (holder === undefined || augment(holder, seen)) {
        matchedTo.set(next, id);
        return true;
      }
      return false;
    });
  const matched = ids.filter((id) => pendingIds.has(id) && augment(id, new Set())).length;
  return ids.length - matched;
}

function findRedundant(tasks: Task[], ancestors: Map<string, Set<string>>): Health['redundant'] {
  return tasks.flatMap((task) =>
    task.requires.flatMap((required) => {
      const through = task.requires.find((other) => other !== required && ancestors.get(other)?.has(required) === true);
      return through === undefined ? [] : [{ id: task.id, requires: required, through }];
    }),
  );
}

function readPercent(share: number): string {
  return `${Math.round(share * 100)} %`;
}

function rankProblems(health: Omit<Health, 'problems'>): HealthProblem[] {
  const oversized = health.oversized.map(({ id, lines }): HealthProblem => ({ kind: 'oversized', task: id, lines }));
  const queue: HealthProblem[] =
    health.tasksLeft > 2 && health.parallelism < QUEUE_PARALLELISM
      ? [{ kind: 'queue', parallelism: health.parallelism }]
      : [];
  // One that can be taken now is a first step, and taking it first is what happens anyway: only a waiting one is a risk.
  const bottlenecks = health.bottlenecks
    .filter((each) => each.share >= BOTTLENECK_SHARE && !each.ready)
    .map((each): HealthProblem => ({ kind: 'bottleneck', task: each.id, share: each.share }));
  // All in one problem, so one pass drops them all instead of one per run.
  const redundant: HealthProblem[] =
    health.redundant.length === 0 ? [] : [{ kind: 'redundant', requirements: health.redundant }];
  const backward: HealthProblem[] =
    health.backward.length === 0 ? [] : [{ kind: 'backward', requirements: health.backward }];
  return [...oversized, ...queue, ...bottlenecks, ...redundant, ...backward];
}

/** A health problem in words, with what to do. */
export function describeHealthProblem(problem: HealthProblem): string {
  switch (problem.kind) {
    case 'oversized':
      return `${problem.task} is ~${problem.lines} lines, over the cap of ${SIZE_CAP}: split it into slices`;
    case 'queue':
      return `The plan is a queue: parallelism ${problem.parallelism.toFixed(1)}, so a second session mostly waits; split the tasks on the critical path, or drop requirements they do not need`;
    case 'bottleneck':
      return `${problem.task} blocks ${readPercent(problem.share)} of the rest of the work while it waits: split it`;
    case 'redundant': {
      const pairs = problem.requirements.map((each) => `${each.id} → ${each.requires} (via ${each.through})`);
      return `Requirements another one already implies: ${pairs.join(', ')}: drop them`;
    }
    case 'backward': {
      const pairs = problem.requirements.map((each) => `${each.id} → ${each.requires}`);
      return `Requirements on a block listed later: ${pairs.join(', ')}: reorder the blocks in roadmap.yaml`;
    }
  }
  return problem satisfies never;
}

/** How healthy the plan left to do is: its shape as a graph of tasks, and the worst problems with what to do. */
export function measureHealth(roadmap: Roadmap): Health {
  const tasks = roadmap.blocks.flatMap((block) => block.tasks);
  const blockOf = new Map(roadmap.blocks.flatMap((block) => block.tasks.map((task) => [task.id, block.code])));
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const pending = tasks.filter((task) => task.commit === undefined);
  const pendingById = new Map(pending.map((task) => [task.id, task]));
  const ancestors = readAncestors(byId);
  const pendingAncestors = readAncestors(pendingById);
  const shape = analyze(roadmap);
  const workLeft = shape.work;
  const criticalPath = { lines: shape.span, tasks: readCriticalPath(shape) };
  const done = readDoneIds(roadmap);
  const bottlenecks = pending
    .map((task) => {
      const blocks = pending
        .filter((other) => pendingAncestors.get(other.id)?.has(task.id) === true)
        .reduce((sum, other) => sum + weigh(other), 0);
      const rest = workLeft - weigh(task);
      const ready = isUnblocked(task, done);
      return { id: task.id, blocks, share: rest === 0 ? 0 : blocks / rest, ready };
    })
    .filter((each) => each.blocks > 0)
    .toSorted((a, b) => b.blocks - a.blocks)
    .slice(0, 3);
  const edges = tasks.flatMap((task) => task.requires.map((required) => [task.id, required] as const));
  const crossing = edges.filter(([id, required]) => blockOf.get(id) !== blockOf.get(required)).length;
  const position = new Map(roadmap.blocks.map((block, at) => [block.code, at]));
  const placeOf = (id: string) => position.get(blockOf.get(id) ?? '') ?? 0;
  const backward = edges
    .filter(([id, required]) => byId.has(required) && placeOf(required) > placeOf(id))
    .map(([id, required]) => ({ id, requires: required }));
  const measured = {
    tasksLeft: pending.length,
    workLeft,
    criticalPath,
    parallelism: criticalPath.lines === 0 ? 0 : workLeft / criticalPath.lines,
    width: measureWidth(pending, pendingAncestors),
    readyNow: pending.filter((task) => isUnblocked(task, done)).length,
    bottlenecks,
    redundant: findRedundant(tasks, ancestors),
    crossBlockShare: edges.length === 0 ? 0 : crossing / edges.length,
    backward,
    oversized: pending.flatMap((task) =>
      task.lines !== 'doc' && task.lines > SIZE_CAP ? [{ id: task.id, lines: task.lines }] : [],
    ),
  };
  return { ...measured, problems: rankProblems(measured) };
}
