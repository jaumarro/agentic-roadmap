import type { Roadmap, Task } from './roadmap.model.ts';

// What a task marked `doc` weighs against tasks sized in lines of logic.
const DOC_WEIGHT = 20;

export function weigh(task: Task): number {
  return task.lines === 'doc' ? DOC_WEIGHT : task.lines;
}

export type TaskShape = {
  /** 1 for a task that waits on nothing left to do, else one past the latest wave it waits on. */
  wave: number;
  /** The heaviest chain from this task to the end of the plan, itself included: the work it holds up. */
  bottomLevel: number;
  /** The heaviest chain of work left before it can start. */
  earliestStart: number;
  /** How far it can slip without the plan taking longer; none on the critical path. */
  float: number;
};

export type Shape = {
  /** Every task not done, in an order where each comes after what it waits on. */
  order: Task[];
  tasks: Map<string, TaskShape>;
  /** The weight of every task not done. */
  work: number;
  /** The heaviest chain of tasks not done: the least time even with endless sessions. */
  span: number;
};

/**
 * The shape of the work left: a forward pass in topological order for waves and earliest starts, a backward one for
 * bottom levels, and float from both. Requirements already done or unknown wait on nothing; a cycle, which check
 * refuses, leaves its tasks out.
 */
export function analyze(roadmap: Roadmap): Shape {
  const pending = roadmap.blocks.flatMap((block) => block.tasks).filter((task) => task.commit === undefined);
  const byId = new Map(pending.map((task) => [task.id, task]));
  const waitsOn = new Map(pending.map((task) => [task.id, task.requires.filter((id) => byId.has(id))]));
  const neededBy = new Map<string, string[]>(pending.map((task) => [task.id, []]));
  for (const [id, requires] of waitsOn) for (const required of requires) neededBy.get(required)?.push(id);

  const left = new Map(pending.map((task) => [task.id, waitsOn.get(task.id)?.length ?? 0]));
  const order: Task[] = pending.filter((task) => left.get(task.id) === 0);
  for (const task of order) {
    for (const next of neededBy.get(task.id) ?? []) {
      const count = (left.get(next) ?? 0) - 1;
      left.set(next, count);
      const waiting = byId.get(next);
      if (count === 0 && waiting !== undefined) order.push(waiting);
    }
  }

  const weight = new Map(pending.map((task) => [task.id, weigh(task)]));
  const wave = new Map<string, number>();
  const start = new Map<string, number>();
  for (const task of order) {
    const before = waitsOn.get(task.id) ?? [];
    wave.set(task.id, 1 + Math.max(0, ...before.map((id) => wave.get(id) ?? 0)));
    start.set(task.id, Math.max(0, ...before.map((id) => (start.get(id) ?? 0) + (weight.get(id) ?? 0))));
  }
  const bottom = new Map<string, number>();
  for (const task of order.toReversed()) {
    const after = neededBy.get(task.id) ?? [];
    bottom.set(task.id, weigh(task) + Math.max(0, ...after.map((id) => bottom.get(id) ?? 0)));
  }

  const span = Math.max(0, ...order.map((task) => (start.get(task.id) ?? 0) + weigh(task)));
  const tasks = new Map(
    order.map((task) => {
      const earliestStart = start.get(task.id) ?? 0;
      const bottomLevel = bottom.get(task.id) ?? 0;
      const shape = {
        wave: wave.get(task.id) ?? 1,
        bottomLevel,
        earliestStart,
        float: span - earliestStart - bottomLevel,
      };
      return [task.id, shape];
    }),
  );
  return { order, tasks, work: order.reduce((sum, task) => sum + weigh(task), 0), span };
}

/** One heaviest chain, in the plan's order where chains tie: the tasks with no float, each starting as the last ends. */
export function readCriticalPath(shape: Shape): string[] {
  const critical = shape.order.filter((task) => shape.tasks.get(task.id)?.float === 0);
  const path: string[] = [];
  let at = 0;
  for (;;) {
    const last = path.at(-1);
    const next = critical.find(
      (task) => shape.tasks.get(task.id)?.earliestStart === at && (last === undefined || task.requires.includes(last)),
    );
    if (next === undefined) return path;
    path.push(next.id);
    at += weigh(next);
  }
}
