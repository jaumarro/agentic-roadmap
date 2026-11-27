import { analyze, type Shape, weigh } from './roadmap.analysis.service.ts';
import type { Roadmap, Task } from './roadmap.model.ts';

export type Simulation = {
  /** How many sessions work the plan at once. */
  count: number;
  /** How long the plan takes with them, in lines of work done end to end: the critical path at best. */
  span: number;
  /** The share of that time, over all the sessions, in which a session had no task to take. */
  idle: number;
  /**
   * About how many sessions reach the critical path, past which more only sit idle. A reference, not a proven minimum:
   * it comes from this simulation's way of handing out tasks.
   */
  enough: number;
};

type Running = { task: Task; ends: number };

/**
 * The plan worked by `count` sessions, each taking the ready task the most work waits on, as next hands them out, and
 * a task taking time in proportion to its size. Waves say what could start together; this says how long it takes when
 * tasks differ in size and sessions are few.
 */
export function simulateSessions(roadmap: Roadmap, count: number): Simulation {
  const shape = analyze(roadmap);
  const span = measureSpan(shape, count);
  const idle = span === 0 ? 0 : 1 - shape.work / (count * span);
  return { count, span, idle, enough: findEnough(shape) };
}

/**
 * The fewest sessions whose span is the critical path, by halving: with one per task every task starts as soon as it
 * can, so that many always reach it, and fewer sessions are taken never to do better than more.
 */
function findEnough(shape: Shape): number {
  let low = 1;
  let high = shape.order.length;
  if (high === 0) return 0;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (measureSpan(shape, middle) <= shape.span) high = middle;
    else low = middle + 1;
  }
  return low;
}

/** How long `count` sessions take to work the plan of `shape`, in lines of work done end to end. */
function measureSpan(shape: Shape, count: number): number {
  const pending = new Map(shape.order.map((task) => [task.id, task]));
  const waitsOn = new Map(shape.order.map((task) => [task.id, task.requires.filter((id) => pending.has(id)).length]));
  const rank = (task: Task) => shape.tasks.get(task.id)?.bottomLevel ?? 0;
  let ready = shape.order.filter((task) => waitsOn.get(task.id) === 0);
  let running: Running[] = [];
  let now = 0;
  while (ready.length > 0 || running.length > 0) {
    // Stable, so tasks most work waits on equally keep the plan's order.
    const taken = ready.toSorted((a, b) => rank(b) - rank(a)).slice(0, count - running.length);
    ready = ready.filter((task) => !taken.includes(task));
    running = [...running, ...taken.map((task) => ({ task, ends: now + weigh(task) }))];
    now = Math.min(...running.map((each) => each.ends));
    const finished = running.filter((each) => each.ends === now).map((each) => each.task.id);
    running = running.filter((each) => each.ends !== now);
    ready = [...ready, ...release(shape.order, finished, waitsOn)];
  }
  return now;
}

/** The tasks that waited only on `finished` ones, in the plan's order; `waitsOn` counts what each still waits on. */
function release(order: Task[], finished: string[], waitsOn: Map<string, number>): Task[] {
  return order.filter((task) => {
    const freed = task.requires.filter((id) => finished.includes(id)).length;
    if (freed === 0) return false;
    const left = (waitsOn.get(task.id) ?? 0) - freed;
    waitsOn.set(task.id, left);
    return left === 0;
  });
}
