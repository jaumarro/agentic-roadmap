import { describe, expect, it } from 'vitest';
import { describeHealthProblem, measureHealth } from './health.service.ts';
import type { Roadmap, Task } from './roadmap.model.ts';
import { renderHealth } from './health.view.ts';

function task(id: string, requires: string[] = [], lines: number | 'doc' = 10, commit?: string): Task {
  return { id, title: id, requires, doneWhen: 'x', lines, ...(commit ? { commit } : {}) };
}

function plan(...tasks: Task[]): Roadmap {
  const codes = [...new Set(tasks.map((each) => each.id.split('.')[0] ?? ''))];
  return {
    blocks: codes.map((code) => ({ code, name: code, tasks: tasks.filter((t) => t.id.startsWith(`${code}.`)) })),
  };
}

describe('measureHealth', () => {
  it('weighs the critical path by lines and counts only the work left', () => {
    const health = measureHealth(
      plan(
        task('ABC.1', [], 50, 'abc1234'),
        task('ABC.2', ['ABC.1'], 30),
        task('ABC.3', ['ABC.2'], 20),
        task('ABC.4', [], 40),
      ),
    );

    expect(health.tasksLeft).toBe(3);
    expect(health.workLeft).toBe(90);
    expect(health.criticalPath).toEqual({ lines: 50, tasks: ['ABC.2', 'ABC.3'] });
    expect(health.parallelism).toBeCloseTo(1.8);
  });

  it('counts a document as a fixed weight', () => {
    expect(measureHealth(plan(task('ABC.1', [], 'doc'))).workLeft).toBe(20);
  });

  it('finds the most tasks that can run at once, not just the ready ones', () => {
    // ABC.1 → {ABC.2, ABC.3, ABC.4}: one ready now, three at once after it.
    const health = measureHealth(
      plan(task('ABC.1'), task('ABC.2', ['ABC.1']), task('ABC.3', ['ABC.1']), task('ABC.4', ['ABC.1'])),
    );

    expect(health.readyNow).toBe(1);
    expect(health.width).toBe(3);
  });

  it('measures width as the largest set of tasks no one of which needs another, across chains', () => {
    // Two chains of three: at most two at once.
    const health = measureHealth(
      plan(
        task('ABC.1'),
        task('ABC.2', ['ABC.1']),
        task('ABC.3', ['ABC.2']),
        task('XYZ.1'),
        task('XYZ.2', ['XYZ.1']),
        task('XYZ.3', ['XYZ.2']),
      ),
    );

    expect(health.width).toBe(2);
  });

  it('names the tasks most of the work left waits on', () => {
    const health = measureHealth(
      plan(task('ABC.1', [], 10), task('ABC.2', ['ABC.1'], 40), task('ABC.3', ['ABC.1'], 40), task('ABC.4', [], 10)),
    );

    // Measured against the rest of the work: its own 10 lines are not something it waits on.
    expect(health.bottlenecks[0]).toMatchObject({ id: 'ABC.1', blocks: 80 });
    expect(health.bottlenecks[0]?.share).toBeCloseTo(80 / 90);
  });

  it('finds a requirement another one already implies', () => {
    const health = measureHealth(plan(task('ABC.1'), task('ABC.2', ['ABC.1']), task('ABC.3', ['ABC.2', 'ABC.1'])));

    expect(health.redundant).toEqual([{ id: 'ABC.3', requires: 'ABC.1', through: 'ABC.2' }]);
  });

  it('measures the share of requirements that cross blocks', () => {
    const health = measureHealth(
      plan(task('ABC.1'), task('ABC.2', ['ABC.1']), task('XYZ.1', ['ABC.2']), task('XYZ.2', ['XYZ.1'])),
    );

    expect(health.crossBlockShare).toBeCloseTo(1 / 3);
  });

  it('lists the tasks over the size cap', () => {
    expect(measureHealth(plan(task('ABC.1', [], 400), task('ABC.2', [], 100))).oversized).toEqual([
      { id: 'ABC.1', lines: 400 },
    ]);
  });

  it('gives an empty plan zero work and no problems', () => {
    const health = measureHealth(plan(task('ABC.1', [], 10, 'abc1234')));

    expect(health).toMatchObject({ tasksLeft: 0, workLeft: 0, parallelism: 0, width: 0, problems: [] });
  });
});

describe('the problems it ranks', () => {
  it('flags a plan that is a single queue', () => {
    const chain = Array.from({ length: 6 }, (_, at) => task(`ABC.${at + 1}`, at === 0 ? [] : [`ABC.${at}`]));

    expect(measureHealth(plan(...chain)).problems[0]).toEqual({ kind: 'queue', parallelism: 1 });
  });

  it('ranks an oversized task, then a queue, then a bottleneck, then a redundant requirement', () => {
    const health = measureHealth(
      plan(
        task('ABC.1', [], 400),
        task('ABC.2', ['ABC.1']),
        task('ABC.3', ['ABC.2', 'ABC.1']),
        task('XYZ.1'),
        task('XYZ.2'),
      ),
    );

    expect(health.problems.map((problem) => problem.kind)).toEqual(['oversized', 'queue', 'redundant']);
  });

  it('flags a bottleneck only while it waits, not one that can be taken now', () => {
    // ABC.2 waits on ABC.1 and blocks the rest; ABC.1 is a ready first step.
    const health = measureHealth(
      plan(
        task('ABC.1'),
        task('ABC.2', ['ABC.1']),
        task('ABC.3', ['ABC.2'], 40),
        task('ABC.4', ['ABC.2'], 40),
        task('XYZ.1'),
        task('XYZ.2'),
      ),
    );

    const flagged = health.problems.flatMap((problem) => (problem.kind === 'bottleneck' ? [problem.task] : []));
    expect(flagged).toEqual(['ABC.2']);
  });

  it('gives every redundant requirement in one problem', () => {
    const health = measureHealth(
      plan(
        task('ABC.1'),
        task('ABC.2', ['ABC.1']),
        task('ABC.3', ['ABC.2', 'ABC.1']),
        task('ABC.4', ['ABC.3', 'ABC.2']),
      ),
    );

    expect(health.problems).toContainEqual({
      kind: 'redundant',
      requirements: [
        { id: 'ABC.3', requires: 'ABC.1', through: 'ABC.2' },
        { id: 'ABC.4', requires: 'ABC.2', through: 'ABC.3' },
      ],
    });
  });

  it('takes a requirement on an earlier block as normal and flags one on a later block', () => {
    const health = measureHealth(plan(task('ABC.1', ['XYZ.1']), task('XYZ.1'), task('XYZ.2', ['ABC.1'])));

    expect(health.backward).toEqual([{ id: 'ABC.1', requires: 'XYZ.1' }]);
    expect(health.problems.at(-1)).toEqual({ kind: 'backward', requirements: [{ id: 'ABC.1', requires: 'XYZ.1' }] });
  });

  it('gives every problem, past the five the text shows', () => {
    const big = Array.from({ length: 7 }, (_, at) => task(`ABC.${at + 1}`, [], 200));

    expect(measureHealth(plan(...big)).problems).toHaveLength(7);
  });
});

describe('a health problem in words', () => {
  it('says what is wrong and what to do', () => {
    const words = [
      describeHealthProblem({ kind: 'oversized', task: 'ABC.1', lines: 400 }),
      describeHealthProblem({ kind: 'queue', parallelism: 1.04 }),
      describeHealthProblem({ kind: 'bottleneck', task: 'ABC.2', share: 0.5 }),
      describeHealthProblem({
        kind: 'redundant',
        requirements: [{ id: 'ABC.3', requires: 'ABC.1', through: 'ABC.2' }],
      }),
      describeHealthProblem({ kind: 'backward', requirements: [{ id: 'ABC.1', requires: 'XYZ.1' }] }),
    ];

    expect(words).toEqual([
      'ABC.1 is ~400 lines, over the cap of 150: split it into slices',
      'The plan is a queue: parallelism 1.0, so a second session mostly waits; split the tasks on the critical path, or drop requirements they do not need',
      'ABC.2 blocks 50 % of the rest of the work while it waits: split it',
      'Requirements another one already implies: ABC.3 → ABC.1 (via ABC.2): drop them',
      'Requirements on a block listed later: ABC.1 → XYZ.1: reorder the blocks in roadmap.yaml',
    ]);
  });

  it('shows the first five and says how many it left out', () => {
    const big = Array.from({ length: 7 }, (_, at) => task(`ABC.${at + 1}`, [], 200));

    expect(renderHealth(measureHealth(plan(...big)))).toContain('  6. … and 2 more: health --json lists every one\n');
  });
});
