import { describe, expect, it } from 'vitest';
import type { Roadmap, Task } from './model.ts';
import { describeTask, explainWait, readStates } from './state.ts';

function task(id: string, requires: string[] = [], commit?: string): Task {
  return { id, title: `Do ${id}`, requires, doneWhen: 'it works', lines: 20, ...(commit ? { commit } : {}) };
}

const PLAN: Roadmap = {
  blocks: [
    { code: 'ABC', name: 'First', tasks: [task('ABC.1', [], 'abc1234'), task('ABC.2', ['ABC.1']), task('ABC.3')] },
    { code: 'XYZ', name: 'Second', tasks: [task('XYZ.1', ['ABC.2', 'ABC.3']), task('XYZ.2', ['XYZ.1', 'ABC.2'])] },
  ],
};

describe('readStates', () => {
  it('tells done, started, ready and waiting tasks apart', () => {
    const states = readStates(PLAN, ['abc-3/start']);

    expect(Object.fromEntries(states)).toEqual({
      'ABC.1': 'done',
      'ABC.2': 'ready',
      'ABC.3': 'started',
      'XYZ.1': 'waiting',
      'XYZ.2': 'waiting',
    });
  });
});

describe('describeTask', () => {
  it('gives its block, its requirements with their state and what it unblocks', () => {
    const shown = describeTask(PLAN, ['abc-3/start'], 'ABC.2');

    expect(shown).toMatchObject({
      id: 'ABC.2',
      block: 'ABC',
      blockName: 'First',
      state: 'ready',
      requires: [{ id: 'ABC.1', state: 'done' }],
      unblocks: [
        { id: 'XYZ.1', state: 'waiting' },
        { id: 'XYZ.2', state: 'waiting' },
      ],
      branches: [],
    });
  });

  it('names the branches a started task is on', () => {
    expect(describeTask(PLAN, ['abc-3/start'], 'ABC.3')?.branches).toEqual(['abc-3/start']);
  });

  it('gives nothing for a task the plan does not have', () => {
    expect(describeTask(PLAN, [], 'ABC.9')).toBeNull();
  });
});

describe('explainWait', () => {
  it('walks the requirements not done down to the ones that can be taken, each expanded once', () => {
    expect(explainWait(PLAN, ['abc-3/start'], 'XYZ.2')).toEqual([
      {
        id: 'XYZ.1',
        title: 'Do XYZ.1',
        state: 'waiting',
        seenAbove: false,
        waitsOn: [
          { id: 'ABC.2', title: 'Do ABC.2', state: 'ready', seenAbove: false, waitsOn: [] },
          { id: 'ABC.3', title: 'Do ABC.3', state: 'started', seenAbove: false, waitsOn: [] },
        ],
      },
      { id: 'ABC.2', title: 'Do ABC.2', state: 'ready', seenAbove: true, waitsOn: [] },
    ]);
  });

  it('stays small on a ladder of diamonds, where every task requires the two before it', () => {
    const tasks: Task[] = [task('LAD.1'), task('LAD.2', ['LAD.1'])];
    for (let n = 3; n <= 40; n += 1) tasks.push(task(`LAD.${n}`, [`LAD.${n - 1}`, `LAD.${n - 2}`]));
    const ladder: Roadmap = { blocks: [{ code: 'LAD', name: 'Ladder', tasks }] };

    expect(JSON.stringify(explainWait(ladder, [], 'LAD.40')).length).toBeLessThan(20_000);
  });

  it('is empty for a task that waits on nothing', () => {
    expect(explainWait(PLAN, [], 'ABC.2')).toEqual([]);
  });
});
