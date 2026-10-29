import { describe, expect, it } from 'vitest';
import { readPlanTable } from './plan-table.parser.ts';

const HEADER = '| Key | Block | Task | Requires | Done when | Lines |\n|---|---|---|---|---|---|\n';

function plan(rows: string): string {
  return `# A plan\n\nProse first.\n\n<!-- roadmap -->\n${HEADER}${rows}\nProse after.\n`;
}

describe('readPlanTable', () => {
  it('reads the rows under the mark, with risky keys, escaped pipes and no requirements', () => {
    const rows = readPlanTable(
      plan('| one ⚠︎ | GET | Do one \\| well | — | it works | ~40 |\n| two | GET | Two | one, GET.1 | x | doc |\n'),
    );

    expect(rows).toEqual([
      { key: 'one', block: 'GET', title: 'Do one | well', requires: [], doneWhen: 'it works', lines: 40, risky: true },
      { key: 'two', block: 'GET', title: 'Two', requires: ['one', 'GET.1'], doneWhen: 'x', lines: 'doc', risky: false },
    ]);
  });

  it('refuses a plan with no mark, other columns, a key twice or a size it cannot read', () => {
    expect(() => readPlanTable('# No table\n')).toThrow('No <!-- roadmap --> table');
    expect(() => readPlanTable('<!-- roadmap -->\n| Id | Task |\n|-|-|\n| a | b |\n')).toThrow('columns are Key');
    expect(() => readPlanTable(plan('| a | GET | A | — | x | 5 |\n| a | GET | B | — | x | 5 |\n'))).toThrow(
      'The key a is in the table twice.',
    );
    expect(() => readPlanTable(plan('| a | GET | A | — | x | lots |\n'))).toThrow('a: Lines is a whole number');
  });
});
