import { describe, expect, it } from 'vitest';
import type { Roadmap, Task } from './model.ts';
import { listReady, namesTask, readBranchName } from './next.ts';

function task(id: string, requires: string[] = [], commit?: string): Task {
  return { id, title: `Do ${id}`, requires, doneWhen: 'it works', lines: 20, ...(commit ? { commit } : {}) };
}

function roadmap(...tasks: Task[]): Roadmap {
  return { blocks: [{ code: 'ABC', name: 'First', tasks }] };
}

describe('listReady', () => {
  it('leaves out done tasks and those waiting on one not done', () => {
    const plan = roadmap(task('ABC.1', [], 'abc1234'), task('ABC.2', ['ABC.1']), task('ABC.3', ['ABC.2']));

    expect(listReady(plan).map((each) => each.id)).toEqual(['ABC.2']);
  });

  it('puts the task with fewer requirements first, keeping the plan order otherwise', () => {
    const plan = roadmap(task('ABC.1', [], 'abc1234'), task('ABC.2', ['ABC.1']), task('ABC.3'), task('ABC.4'));

    expect(listReady(plan).map((each) => each.id)).toEqual(['ABC.3', 'ABC.4', 'ABC.2']);
  });

  it('gives nothing when every task is done', () => {
    expect(listReady(roadmap(task('ABC.1', [], 'abc1234')))).toEqual([]);
  });
});

describe('namesTask', () => {
  it.each(['abc-1', 'abc-1/close', 'feat/abc-1-close'])('reads %s as naming ABC.1', (branch) => {
    expect(namesTask(branch, 'ABC.1')).toBe(true);
  });

  it.each(['abc-10/x', 'main', 'xabc-1/y'])('does not read %s as naming ABC.1', (branch) => {
    expect(namesTask(branch, 'ABC.1')).toBe(false);
  });
});

describe('readBranchName', () => {
  it('lower-cases the id and swaps its dot for a hyphen', () => {
    expect(readBranchName('ABC.12')).toBe('abc-12/');
  });
});
