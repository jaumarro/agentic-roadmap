import { analyze, weigh } from './roadmap.analysis.service.ts';
import type { Roadmap, Task } from './roadmap.model.ts';

export type Simulation = {
  /** How many sessions work the plan at once. */
  count: number;
  /** How long the plan takes with them, in lines of work done end to end: the critical path at best. */
  span: number;
  /** The share of that time, over all the sessions, in which a session had no task to take. */
  idle: number;
};

type Running = { task: Task; ends: number };

/**
 * The plan worked by `count` sessions, each taking the ready task the most work waits on, as next hands them out, and
 * a task taking time in proportion to its size. Waves say what could start together; this says how long it takes when
 * tasks differ in size and sessions are few.
 */
export function simulateSessions(roadmap: Roadmap, count: number): Simulation {
  const shape = analyze(roadmap);
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
  return { count, span: now, idle: now === 0 ? 0 : 1 - shape.work / (count * now) };
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
