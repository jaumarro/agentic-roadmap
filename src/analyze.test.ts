import { describe, expect, it } from 'vitest';
import { analyze, readCriticalPath, weigh } from './analyze.ts';
import type { Roadmap, Task } from './model.ts';

function task(id: string, requires: string[] = [], lines: number | 'doc' = 10, commit?: string): Task {
  return { id, title: id, requires, doneWhen: 'x', lines, ...(commit ? { commit } : {}) };
}

function plan(...tasks: Task[]): Roadmap {
  return { blocks: [{ code: 'ABC', name: 'ABC', tasks }] };
}

// A diamond with a tail, and a task on the side: ABC.1 → (ABC.2 heavy | ABC.3 light) → ABC.4 → ABC.5; ABC.6 alone.
const DIAMOND = plan(
  task('ABC.1', [], 10),
  task('ABC.2', ['ABC.1'], 50),
  task('ABC.3', ['ABC.1'], 20),
  task('ABC.4', ['ABC.2', 'ABC.3'], 30),
  task('ABC.5', ['ABC.4'], 10),
  task('ABC.6', [], 40),
);

describe('analyze', () => {
  it('puts each task one wave past the latest it waits on', () => {
    const shape = analyze(DIAMOND);
    const tasks = DIAMOND.blocks.flatMap((block) => block.tasks);

    for (const each of tasks) {
      for (const required of each.requires) {
        expect(shape.tasks.get(each.id)?.wave).toBeGreaterThan(shape.tasks.get(required)?.wave ?? Infinity);
      }
    }
    expect(tasks.map((each) => shape.tasks.get(each.id)?.wave)).toEqual([1, 2, 2, 3, 4, 1]);
  });

  it('gives the work held up, the span, and no float only on the heaviest chain', () => {
    const shape = analyze(DIAMOND);

    expect(shape.work).toBe(160);
    expect(shape.span).toBe(100);
    expect(shape.tasks.get('ABC.1')?.bottomLevel).toBe(100);
    expect(shape.tasks.get('ABC.3')?.float).toBe(30);
    expect(shape.tasks.get('ABC.6')?.float).toBe(60);
  });

  it('walks the tasks with no float as one chain as long as the span', () => {
    const shape = analyze(DIAMOND);
    const path = readCriticalPath(shape);
    const byId = new Map(DIAMOND.blocks.flatMap((block) => block.tasks).map((each) => [each.id, each]));

    expect(path).toEqual(['ABC.1', 'ABC.2', 'ABC.4', 'ABC.5']);
    expect(path.reduce((sum, id) => sum + weigh(byId.get(id) ?? task(id)), 0)).toBe(shape.span);
  });

  it('leaves done tasks out and counts what waits on one as ready', () => {
    const shape = analyze(plan(task('ABC.1', [], 10, 'abc1234'), task('ABC.2', ['ABC.1'], 30)));

    expect(shape.tasks.has('ABC.1')).toBe(false);
    expect(shape.tasks.get('ABC.2')).toEqual({ wave: 1, bottomLevel: 30, earliestStart: 0, float: 0 });
  });

  it('gives an empty plan no work and no span', () => {
    const shape = analyze(plan());

    expect([shape.work, shape.span, readCriticalPath(shape)]).toEqual([0, 0, []]);
  });
});
