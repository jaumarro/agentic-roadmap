import { describe, expect, it } from 'vitest';
import { InvalidPlan, readBlock, readConfig } from './roadmap.model.ts';

function where(read: () => unknown): string {
  try {
    read();
  } catch (error) {
    if (error instanceof InvalidPlan) return `${error.where}: ${error.message}`;
    throw error;
  }
  return 'valid';
}

const TASK = { id: 'ABC.1', title: 'T', doneWhen: 'x', lines: 5 };

describe('readBlock', () => {
  it('reads a block, with requires empty when unset and only the fields given', () => {
    expect(readBlock({ name: 'B', tasks: [TASK] })).toEqual({ name: 'B', tasks: [{ ...TASK, requires: [] }] });
    expect(readBlock({ name: 'B', intro: 'Why', tasks: [{ ...TASK, risky: true, commit: 'abc1234' }] })).toEqual({
      name: 'B',
      intro: 'Why',
      tasks: [{ ...TASK, requires: [], risky: true, commit: 'abc1234' }],
    });
  });

  it('names where a block goes wrong, a misspelt field included', () => {
    expect(where(() => readBlock({ name: 'B', tasks: [{ ...TASK, titel: 'T' }] }))).toBe(
      'tasks.0.titel: titel is no field here',
    );
    expect(where(() => readBlock({ name: 'B', tasks: [{ ...TASK, requires: ['abc'] }] }))).toBe(
      'tasks.0.requires.0: an id is a block code, a dot and a number, as ABC.1',
    );
    expect(where(() => readBlock({ name: 'B', tasks: [{ ...TASK, risky: 'yes' }] }))).toBe(
      'tasks.0.risky: expected true or false',
    );
    expect(where(() => readBlock({ name: 'B', tasks: [{ ...TASK, commit: 'xyz' }] }))).toBe(
      'tasks.0.commit: a commit is 7 to 40 hexadecimal digits',
    );
    expect(where(() => readBlock({ name: '', tasks: [] }))).toBe('name: expected text');
    expect(where(() => readBlock({ name: 'B', tasks: 'none' }))).toBe('tasks: expected a list');
  });
});

describe('readConfig', () => {
  it('reads the config, with the focus empty when unset', () => {
    expect(readConfig({ blocks: ['ABC'] })).toEqual({ blocks: ['ABC'], focus: [] });
    expect(
      readConfig({
        blocks: ['ABC'],
        chapters: [{ name: 'One', blocks: ['ABC'] }],
        warnings: { blockSize: [1, 25], chain: 5 },
        base: 'trunk',
        markdown: 'PLAN.md',
      }),
    ).toEqual({
      blocks: ['ABC'],
      focus: [],
      chapters: [{ name: 'One', blocks: ['ABC'] }],
      warnings: { blockSize: [1, 25], chain: 5 },
      base: 'trunk',
      markdown: 'PLAN.md',
    });
  });

  it('names where the config goes wrong', () => {
    expect(where(() => readConfig({ blocks: [] }))).toBe('blocks: list at least one block');
    expect(where(() => readConfig({ blocks: ['abc'] }))).toBe(
      'blocks.0: a block code is capital letters and digits, as ABC',
    );
    expect(where(() => readConfig({ blocks: ['ABC'], warnings: { blockSize: [1] } }))).toBe(
      'warnings.blockSize: expected [min, max]',
    );
    expect(where(() => readConfig({ blocks: ['ABC'], warnings: { chain: 0 } }))).toBe(
      'warnings.chain: expected a positive whole number',
    );
    expect(where(() => readConfig({ blocks: ['ABC'], baes: 'main' }))).toBe('baes: baes is no field here');
    expect(where(() => readConfig(['ABC']))).toBe(': expected fields, as name: value');
  });
});
