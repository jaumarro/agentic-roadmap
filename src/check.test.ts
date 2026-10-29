import { describe, expect, it } from 'vitest';
import { checkRoadmap, describeProblems, findMissingCommits, warnRoadmap } from './check.ts';
import type { Block, Task } from './model.ts';

function task(id: string, requires: string[] = [], commit?: string): Task {
  return { id, title: `Do ${id}`, requires, doneWhen: 'it works', lines: 20, ...(commit ? { commit } : {}) };
}

function block(code: string, ...tasks: Task[]): Block {
  return { code, name: code, tasks };
}

describe('checkRoadmap', () => {
  it('passes a sound plan', () => {
    expect(checkRoadmap({ blocks: [block('ABC', task('ABC.1'), task('ABC.2', ['ABC.1']))] })).toEqual([]);
  });

  it('finds a requirement no task has', () => {
    const plan = { blocks: [block('ABC', task('ABC.1', ['ABC.9']))] };

    expect(checkRoadmap(plan)).toEqual([{ kind: 'unknown-requirement', task: 'ABC.1', requires: 'ABC.9' }]);
    expect(describeProblems(plan)).toEqual(['ABC.1 requires ABC.9, which no task has']);
  });

  it('finds an id given twice, in one block or across two', () => {
    const plan = { blocks: [block('ABC', task('ABC.1'), task('ABC.1')), block('XYZ', task('ABC.1'))] };

    expect(describeProblems(plan)).toContain('ABC.1 is given to 3 tasks');
  });

  it('finds a block listed twice and a task outside its block', () => {
    const plan = { blocks: [block('ABC', task('XYZ.1')), block('ABC', task('ABC.2'))] };

    expect(describeProblems(plan)).toEqual(['block ABC is listed twice', 'XYZ.1 sits in block ABC']);
  });

  it('finds a cycle, a task that requires itself included', () => {
    const plan = {
      blocks: [block('ABC', task('ABC.1', ['ABC.2']), task('ABC.2', ['ABC.1']), task('ABC.3', ['ABC.3']))],
    };

    expect(checkRoadmap(plan)).toEqual([
      { kind: 'cycle', tasks: ['ABC.1', 'ABC.2', 'ABC.1'] },
      { kind: 'cycle', tasks: ['ABC.3', 'ABC.3'] },
    ]);
    expect(describeProblems(plan)).toEqual(['a cycle: ABC.1 → ABC.2 → ABC.1', 'a cycle: ABC.3 → ABC.3']);
  });
});

describe('warnRoadmap', () => {
  it('still answers on a plan with a cycle inside a block, which check reports apart', () => {
    const plan = { blocks: [block('ABC', task('ABC.1', ['ABC.2']), task('ABC.2', ['ABC.1']))] };

    expect(() => warnRoadmap(plan)).not.toThrow();
  });
});

describe('findMissingCommits', () => {
  it('names the done tasks whose commit the repo does not have', () => {
    const plan = { blocks: [block('ABC', task('ABC.1', [], 'abc1234'), task('ABC.2', [], 'def5678'))] };

    expect(findMissingCommits(plan, (sha) => sha === 'abc1234')).toEqual([
      'ABC.2 cites def5678, which this repo does not have',
    ]);
  });
});
