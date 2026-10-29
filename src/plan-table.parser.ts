import { RoadmapError } from './roadmap.model.ts';

/** What marks, in a Markdown plan, the table of tasks to add. */
export const TABLE_MARK = '<!-- roadmap -->';
const COLUMNS = ['key', 'block', 'task', 'requires', 'done when', 'lines'];
const RISKY = /\s*⚠︎?$/;
const NONE = new Set(['', '—', '-']);

export type PlanRow = {
  key: string;
  block: string;
  title: string;
  /** Keys of other rows, or ids already in the plan. */
  requires: string[];
  doneWhen: string;
  lines: number | 'doc';
  risky: boolean;
};

function readCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replaceAll('\\|', '|'));
}

function readLines(key: string, cell: string): number | 'doc' {
  if (cell === 'doc') return cell;
  const lines = Number(cell.replace(/^~/, ''));
  if (!Number.isInteger(lines) || lines <= 0) throw new RoadmapError(`${key}: Lines is a whole number, or doc.`);
  return lines;
}

function readRow(cells: string[]): PlanRow {
  const [keyCell = '', block = '', title = '', requires = '', doneWhen = '', lines = ''] = cells;
  const risky = keyCell.includes('⚠');
  const key = keyCell.replace(RISKY, '').replace('⚠', '').trim();
  if (key === '' || title === '' || doneWhen === '') {
    throw new RoadmapError(`A row of the ${TABLE_MARK} table lacks its key, task or done when.`);
  }
  const required = NONE.has(requires) ? [] : requires.split(',').map((each) => each.trim());
  return { key, block, title, requires: required, doneWhen, lines: readLines(key, lines), risky };
}

/** The rows of the table right under the mark: Key, Block, Task, Requires, Done when, Lines. */
export function readPlanTable(markdown: string): PlanRow[] {
  const lines = markdown.split('\n');
  const at = lines.findIndex((line) => line.trim() === TABLE_MARK);
  if (at === -1) throw new RoadmapError(`No ${TABLE_MARK} table in it: put the mark on the line above the table.`);
  const after = lines.slice(at + 1);
  const start = after.findIndex((line) => line.trim() !== '');
  const end = after.slice(start).findIndex((line) => !line.trim().startsWith('|'));
  const rows = after.slice(start, end === -1 ? undefined : start + end);
  const [header, , ...body] = rows;
  const columns = header === undefined ? [] : readCells(header).map((cell) => cell.toLowerCase());
  if (columns.join('|') !== COLUMNS.join('|')) {
    throw new RoadmapError(`The ${TABLE_MARK} table's columns are Key | Block | Task | Requires | Done when | Lines.`);
  }
  const read = body.map((line) => readRow(readCells(line)));
  const seen = new Set<string>();
  for (const row of read) {
    if (seen.has(row.key)) throw new RoadmapError(`The key ${row.key} is in the table twice.`);
    seen.add(row.key);
  }
  if (read.length === 0) throw new RoadmapError(`The ${TABLE_MARK} table has no rows.`);
  return read;
}
