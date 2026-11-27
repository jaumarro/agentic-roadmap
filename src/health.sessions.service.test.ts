import { describe, expect, it } from 'vitest';
import { simulateSessions } from './health.sessions.service.ts';
import type { Roadmap, Task } from './roadmap.model.ts';

function task(id: string, requires: string[] = [], lines: number | 'doc' = 10, commit?: string): Task {
  return { id, title: id, requires, doneWhen: 'x', lines, ...(commit ? { commit } : {}) };
}

function plan(...tasks: Task[]): Roadmap {
  return { blocks: [{ code: 'ABC', name: 'A', tasks }] };
}

// A chain of 100 then 50, and two loose tasks of 60 and 40: 250 lines, 150 on the critical path.
const PLAN = plan(task('ABC.1', [], 100), task('ABC.2', ['ABC.1'], 50), task('ABC.3', [], 60), task('ABC.4', [], 40));

describe('simulateSessions', () => {
  it('takes all the work, one task after another, with one session', () => {
    expect(simulateSessions(PLAN, 1)).toEqual({ count: 1, span: 250, idle: 0, enough: 2 });
  });

  it('reaches the critical path with two sessions here, one of them idle a sixth of the time', () => {
    const { span, idle } = simulateSessions(PLAN, 2);

    expect(span).toBe(150);
    expect(idle).toBeCloseTo(1 - 250 / 300);
  });

  it('gains nothing past what the plan can run at once: more sessions only sit idle', () => {
    const { span, idle } = simulateSessions(PLAN, 10);

    expect(span).toBe(150);
    expect(idle).toBeCloseTo(1 - 250 / 1500);
  });

  it('takes longer than the waves suggest when sessions are few and tasks differ in size', () => {
    // Four tasks of one wave: two sessions cannot run them at once.
    const wave = plan(task('ABC.1', [], 300), task('ABC.2', [], 80), task('ABC.3', [], 80), task('ABC.4', [], 80));

    expect(simulateSessions(wave, 2).span).toBe(300);
    expect(simulateSessions(wave, 1).span).toBe(540);
  });

  it('leaves done tasks out and has nothing to simulate once all is done', () => {
    expect(simulateSessions(plan(task('ABC.1', [], 100, 'abc1234'), task('ABC.2', ['ABC.1'], 50)), 2).span).toBe(50);
    expect(simulateSessions(plan(task('ABC.1', [], 100, 'abc1234')), 2)).toEqual({
      count: 2,
      span: 0,
      idle: 0,
      enough: 0,
    });
  });

  it('says about how many sessions reach the critical path, whatever number was asked about', () => {
    const loose = plan(task('ABC.1', [], 50), task('ABC.2', [], 50), task('ABC.3', [], 50), task('ABC.4', [], 50));

    expect(simulateSessions(loose, 1).enough).toBe(4);
    expect(simulateSessions(loose, 9).enough).toBe(4);
    expect(simulateSessions(PLAN, 9).enough).toBe(2);
  });
});
