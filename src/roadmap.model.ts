const TASK_ID = /^[A-Z][A-Z0-9]*\.[0-9]+$/;
export const BLOCK_CODE = /^[A-Z][A-Z0-9]*$/;
const SHA = /^[0-9a-f]{7,40}$/;

export type Task = {
  id: string;
  title: string;
  requires: string[];
  doneWhen: string;
  /** How big it is: lines of logic, or `doc` for a document. */
  lines: number | 'doc';
  /** It touches code execution, credentials, persistence, pushes or outside text: a full review, and taken last. */
  risky?: boolean;
  /** The commit that closed it; a task with one is done. */
  commit?: string;
};

export type Block = {
  code: string;
  name: string;
  /** What the block is for, as Markdown, printed above its tasks. */
  intro?: string;
  tasks: Task[];
};

export type Chapter = { name: string; blocks: string[] };

/** Where check warns that the plan is getting harder to work in parallel. */
export type Warnings = { blockSize?: [number, number]; chain?: number; blocksWaitedOn?: number };

export type Config = {
  /** The blocks, by code, in the order the plan reads them; each lives in `roadmap/<CODE>.yaml`. */
  blocks: string[];
  /** Blocks and tasks to take first, in this order, ahead of the rest of the plan. */
  focus: string[];
  /**
   * The chapters, in order, each with its blocks. A task may require its own chapter or an earlier one; once there are
   * chapters, a block in none is a parallel track, which next and free leave to its own sessions unless focused.
   */
  chapters?: Chapter[];
  warnings?: Warnings;
  /** The branch tasks start from and merge back into; the remote's default branch, else main or master, unless set. */
  base?: string;
  /** Where to keep the plan as Markdown, from the folder holding roadmap/; set, add, close and focus keep it current. */
  markdown?: string;
};

export type Roadmap = {
  blocks: Block[];
  focus?: string[];
  markdown?: string;
  base?: string;
  chapters?: Chapter[];
  warnings?: Warnings;
};

/** The ids of the tasks closed with a commit. */
export function readDoneIds(roadmap: Roadmap): Set<string> {
  return new Set(
    roadmap.blocks.flatMap((block) => block.tasks.filter((task) => task.commit !== undefined)).map((task) => task.id),
  );
}

/** Whether every task `task` requires is done, so nothing keeps it from being taken. */
export function isUnblocked(task: Task, done: Set<string>): boolean {
  return task.requires.every((id) => done.has(id));
}

export const ROADMAP_DIR = 'roadmap';
export const CONFIG_FILE = 'roadmap.yaml';

/** A roadmap that cannot be found or read, with a message meant for the person at the terminal. */
export class RoadmapError extends Error {}

/** What makes a file not a plan: where in it, as `tasks.0.id`, and what is wrong there. */
export class InvalidPlan extends Error {
  readonly where: string;

  constructor(where: string, message: string) {
    super(message);
    this.where = where;
  }
}

type Fields = Record<string, unknown>;

function at(path: string, key: string | number): string {
  return path === '' ? String(key) : `${path}.${key}`;
}

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `value` as an object with only the `known` fields, so a misspelt field is caught rather than ignored. */
function readFields(value: unknown, path: string, known: string[]): Fields {
  if (!isFields(value)) throw new InvalidPlan(path, 'expected fields, as name: value');
  const unknown = Object.keys(value).find((key) => !known.includes(key));
  if (unknown !== undefined) throw new InvalidPlan(at(path, unknown), `${unknown} is no field here`);
  return value;
}

const TAB = 0x09;
const LINE_FEED = 0x0a;
const CARRIAGE_RETURN = 0x0d;

/** A control character other than tab and line breaks: what an escape sequence starts with, as one that hijacks a terminal. */
function isControl(code: number): boolean {
  const isBreak = code === TAB || code === LINE_FEED || code === CARRIAGE_RETURN;
  return !isBreak && (code < 0x20 || (code >= 0x7f && code < 0xa0));
}

/** Control characters all sit in one UTF-16 unit, so the units are enough to find them. */
function holdsControl(text: string): boolean {
  for (let index = 0; index < text.length; index++) if (isControl(text.charCodeAt(index))) return true;
  return false;
}

function readText(value: unknown, path: string, message = 'expected text'): string {
  if (typeof value !== 'string' || value === '') throw new InvalidPlan(path, message);
  if (holdsControl(value)) throw new InvalidPlan(path, 'holds a control character, as an escape sequence');
  return value;
}

function readMatching(value: unknown, path: string, pattern: RegExp, message: string): string {
  const text = readText(value, path, message);
  if (!pattern.test(text)) throw new InvalidPlan(path, message);
  return text;
}

function readList<T>(value: unknown, path: string, read: (each: unknown, path: string) => T): T[] {
  if (!Array.isArray(value)) throw new InvalidPlan(path, 'expected a list');
  return value.map((each: unknown, index) => read(each, at(path, index)));
}

function readWhole(value: unknown, path: string, least: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < least) {
    throw new InvalidPlan(path, least === 0 ? 'expected a whole number' : 'expected a positive whole number');
  }
  return value;
}

function readOptional<T>(fields: Fields, key: string, path: string, read: (value: unknown, path: string) => T) {
  const value = fields[key];
  return value === undefined ? {} : { [key]: read(value, at(path, key)) };
}

function readTask(value: unknown, path: string): Task {
  const fields = readFields(value, path, ['id', 'title', 'requires', 'doneWhen', 'lines', 'risky', 'commit']);
  const lines = fields.lines;
  if (lines !== 'doc' && (typeof lines !== 'number' || !Number.isInteger(lines) || lines <= 0)) {
    throw new InvalidPlan(at(path, 'lines'), 'lines is a positive whole number, or doc');
  }
  const risky = fields.risky;
  if (risky !== undefined && typeof risky !== 'boolean')
    throw new InvalidPlan(at(path, 'risky'), 'expected true or false');
  const commit = fields.commit;
  if (commit !== undefined && typeof commit !== 'string') {
    throw new InvalidPlan(at(path, 'commit'), 'a commit is a quoted sha, as commit: "1234567"');
  }
  const id = 'an id is a block code, a dot and a number, as ABC.1';
  return {
    id: readMatching(fields.id, at(path, 'id'), TASK_ID, id),
    title: readText(fields.title, at(path, 'title')),
    requires:
      fields.requires === undefined
        ? []
        : readList(fields.requires, at(path, 'requires'), (each, where) => readMatching(each, where, TASK_ID, id)),
    doneWhen: readText(fields.doneWhen, at(path, 'doneWhen')),
    lines,
    ...(risky === undefined ? {} : { risky }),
    ...(commit === undefined
      ? {}
      : { commit: readMatching(commit, at(path, 'commit'), SHA, 'a commit is 7 to 40 hexadecimal digits') }),
  };
}

/** A block file's content, checked: its name, its intro if any, and its tasks. */
export function readBlock(value: unknown): Omit<Block, 'code'> {
  const fields = readFields(value, '', ['name', 'intro', 'tasks']);
  return {
    name: readText(fields.name, 'name'),
    ...readOptional(fields, 'intro', '', (each, where) => readText(each, where)),
    tasks: readList(fields.tasks, 'tasks', readTask),
  };
}

function readChapter(value: unknown, path: string): Chapter {
  const fields = readFields(value, path, ['name', 'blocks']);
  return {
    name: readText(fields.name, at(path, 'name')),
    blocks: readList(fields.blocks, at(path, 'blocks'), (each, where) => readText(each, where)),
  };
}

function readWarnings(value: unknown, path: string): Warnings {
  const fields = readFields(value, path, ['blockSize', 'chain', 'blocksWaitedOn']);
  const size = fields.blockSize;
  const blockSize = (): [number, number] => {
    if (!Array.isArray(size) || size.length !== 2) throw new InvalidPlan(at(path, 'blockSize'), 'expected [min, max]');
    return [readWhole(size[0], at(path, 'blockSize.0'), 0), readWhole(size[1], at(path, 'blockSize.1'), 1)];
  };
  return {
    ...(size === undefined ? {} : { blockSize: blockSize() }),
    ...readOptional(fields, 'chain', path, (each, where) => readWhole(each, where, 1)),
    ...readOptional(fields, 'blocksWaitedOn', path, (each, where) => readWhole(each, where, 0)),
  };
}

/** `roadmap.yaml`'s content, checked, with the focus empty when unset. */
export function readConfig(value: unknown): Config {
  const known = ['blocks', 'focus', 'chapters', 'warnings', 'base', 'markdown'];
  const fields = readFields(value, '', known);
  const code = 'a block code is capital letters and digits, as ABC';
  const blocks = readList(fields.blocks, 'blocks', (each, where) => readMatching(each, where, BLOCK_CODE, code));
  if (blocks.length === 0) throw new InvalidPlan('blocks', 'list at least one block');
  return {
    blocks,
    focus: fields.focus === undefined ? [] : readList(fields.focus, 'focus', (each, where) => readText(each, where)),
    ...readOptional(fields, 'chapters', '', (each, where) => readList(each, where, readChapter)),
    ...readOptional(fields, 'warnings', '', readWarnings),
    ...readOptional(fields, 'base', '', (each, where) => readText(each, where)),
    ...readOptional(fields, 'markdown', '', readInsidePath),
  };
}

/** A path inside the repo: relative, never climbing out with `..`, as a plan from a stranger may try. */
function readInsidePath(value: unknown, path: string): string {
  const message = 'a path inside the repo, as docs/roadmap.md';
  const text = readText(value, path, message);
  const climbs = text.split(/[\\/]/).includes('..');
  if (climbs || text.startsWith('/') || text.startsWith('\\') || /^[A-Za-z]:/.test(text)) {
    throw new InvalidPlan(path, message);
  }
  return text;
}
