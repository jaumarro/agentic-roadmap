import { parseArgs } from 'node:util';
import { RoadmapError } from './roadmap.model.ts';

export const USAGE = `Usage: agentic-roadmap <command> [--root <folder>]
       agentic-roadmap <command> --help, or help <command>: that command alone; --version: this one's

Commands:
  init                       start a roadmap in this folder
  next [--json]              the task to take now, the others ready, and those in progress
  free [N] [--json]          the first N tasks free to take, three unless told: one per session
  focus <CODE|ID>... | --clear
                             take these blocks and tasks first, in this order; --clear takes the plan as it reads
  close <ID> [--commit SHA]  mark a task done with its commit: the newest feat, fix, refactor or perf one unless given;
                             given, it also records a done task's commit again, as after a rebase
  check [--staged] [--json]  find what makes the plan unsound, and a Markdown that no longer matches it; --staged
                             checks the plan the next commit records
  render                     write the plan as Markdown where roadmap.yaml's markdown: says, docs/roadmap.md unless
                             told; with markdown: set, close, add, add-block and focus keep it current
  status [--json]            how much of each block is done
  show <ID> [--json]         a task: its block, done when, what it requires and unblocks, and where it stands
  why <ID> [--json]          what a task waits on, down to the tasks that can be taken now
  list [--block CODE] [--state done|started|ready|waiting] [--by block|wave] [--json]
                             every task with its state, by block; --by wave gives the tasks left in waves, each
                             wave able to run at once after the ones before, critical ones marked
  graph [--mermaid|--json] [--all]
                             the tasks left and what each requires, as a Mermaid flowchart unless --json; --all
                             shows the done ones too
  health [--json] [--strict] [--against BRANCH]
                             the plan's shape (critical path, parallelism, width) and its worst problems; with
                             --against, each figure against that branch's plan and what got worse; --strict fails
                             on any problem, or with --against on anything worse
  add <BLOCK> <TITLE> --done-when TEXT --lines N|doc [--requires ID,ID] | --from FILE|-
                             --from adds every row of the table under <!-- roadmap --> in a Markdown plan
                             (Key | Block | Task | Requires | Done when | Lines), all of them or none
                             add a task with the next free id, here and on every local branch
  add-block <CODE> <NAME>    start a block with no tasks, after the others in roadmap.yaml
  install-hook               a pre-commit hook that runs check --staged when a commit touches the plan
  install-merge-driver       make git merge roadmap/*.yaml task by task, so parallel adds and closes merge cleanly
  install-skill              copy the agents' workflow into .claude/skills, next to roadmap/; again to update it

The roadmap is the nearest roadmap/roadmap.yaml from here upwards, unless --root or AGENTIC_ROADMAP_ROOT names one.
`;

const FOOTER = USAGE.slice(USAGE.lastIndexOf('\n\n') + 2);
// A command's entry in USAGE: its line, and the lines under it indented past the names.
const CONTINUED = ' '.repeat(29);

/** One command's usage, cut from the full one so the two never disagree; the full one for none or an unknown one. */
export function readHelp(name: string | undefined): string {
  const lines = USAGE.split('\n');
  const at = lines.findIndex((line) => line.startsWith(`  ${name} `) || line === `  ${name}`);
  if (name === undefined || at === -1) return USAGE;
  const more = lines.slice(at + 1).findIndex((line) => !line.startsWith(CONTINUED));
  const [first = '', ...rest] = lines.slice(at, at + 1 + (more === -1 ? 0 : more));
  // A short synopsis shares its line with the start of the description, which begins where CONTINUED ends.
  const shared = first.length > CONTINUED.length && first.slice(0, CONTINUED.length).endsWith('  ');
  const synopsis = shared ? first.slice(0, CONTINUED.length).trim() : first.trim();
  const description = [...(shared ? [first.slice(CONTINUED.length)] : []), ...rest.map((line) => line.trim())];
  return `Usage: agentic-roadmap ${synopsis}\n\n${description.map((line) => `  ${line}\n`).join('')}\n${FOOTER}`;
}

const OPTIONS = {
  root: { type: 'string' },
  commit: { type: 'string' },
  json: { type: 'boolean' },
  block: { type: 'string' },
  state: { type: 'string' },
  by: { type: 'string' },
  from: { type: 'string' },
  strict: { type: 'boolean' },
  requires: { type: 'string' },
  'done-when': { type: 'string' },
  lines: { type: 'string' },
  against: { type: 'string' },
  clear: { type: 'boolean' },
  mermaid: { type: 'boolean' },
  all: { type: 'boolean' },
  staged: { type: 'boolean' },
  help: { type: 'boolean' },
  version: { type: 'boolean' },
} as const;

/** The options each command takes, beyond --root, --help and --version, which every command takes. */
const FLAGS: Record<string, string[]> = {
  next: ['json'],
  free: ['json'],
  focus: ['clear'],
  close: ['commit'],
  check: ['staged', 'json'],
  status: ['json'],
  show: ['json'],
  why: ['json'],
  list: ['block', 'state', 'by', 'json'],
  graph: ['mermaid', 'json', 'all'],
  health: ['json', 'strict', 'against'],
  add: ['requires', 'done-when', 'lines', 'from'],
};
const EVERY_COMMAND = ['root', 'help', 'version'];

/** How many arguments each command takes after its name. */
const ARITY: Record<string, number> = {
  init: 0,
  next: 0,
  free: 1,
  focus: Number.POSITIVE_INFINITY,
  check: 0,
  render: 0,
  status: 0,
  close: 1,
  show: 1,
  why: 1,
  graph: 0,
  list: 0,
  health: 0,
  add: 2,
  'add-block': 2,
  'install-hook': 0,
  'install-merge-driver': 0,
  'install-skill': 0,
  'merge-block': 3,
  help: 1,
};

/** The command line read: the command, its arguments, and each option it was given. */
export type Command = {
  name: string | undefined;
  operands: string[];
  root: string | undefined;
  commit: string | undefined;
  json: boolean;
  block: string | undefined;
  state: string | undefined;
  by: string | undefined;
  from: string | undefined;
  strict: boolean;
  requires: string | undefined;
  doneWhen: string | undefined;
  lines: string | undefined;
  against: string | undefined;
  clear: boolean;
  mermaid: boolean;
  all: boolean;
  staged: boolean;
  help: boolean;
  version: boolean;
};

/** Whether `token` names an option that takes a value, as `--done-when` does. */
function takesValue(token: string | undefined): boolean {
  const options: Record<string, { type: string } | undefined> = OPTIONS;
  const option = token?.startsWith('--') === true ? token.slice(2) : '';
  return Object.hasOwn(options, option) && options[option]?.type === 'string';
}

/**
 * The arguments with each dash-led text set apart, as a title like "--where compares", which parseArgs would read as an
 * option. An option's name has no space, so a token with one is text: the value of the option before it, or else a
 * positional, held as a placeholder no shell can pass, NUL and its index, until parsing is over.
 */
function readTexts(args: string[]): { args: string[]; texts: string[] } {
  const texts: string[] = [];
  const read: string[] = [];
  for (const token of args) {
    const isText = token.startsWith('-') && /\s/.test(token);
    const previous = read.at(-1);
    if (!isText) read.push(token);
    else if (takesValue(previous)) read[read.length - 1] = `${previous}=${token}`;
    else read.push(`\0${texts.push(token) - 1}`);
  }
  return { args: read, texts };
}

/** The command `args` give, refused when it takes fewer arguments or other options than given. */
export function readCommand(args: string[], env: Record<string, string | undefined>): Command {
  const held = readTexts(args);
  let parsed;
  try {
    parsed = parseArgs({ args: held.args, options: OPTIONS, allowPositionals: true, strict: true });
  } catch (error) {
    throw new RoadmapError(error instanceof Error ? error.message : String(error));
  }
  const { values } = parsed;
  const positionals = parsed.positionals.map((each) =>
    each.startsWith('\0') ? (held.texts[Number(each.slice(1))] ?? each) : each,
  );
  if (values.root === '') throw new RoadmapError('--root needs a folder.');
  const [name, ...operands] = positionals;
  const arity = name === undefined ? 0 : ARITY[name];
  if (arity !== undefined && operands.length > arity && name !== undefined) {
    const count = arity === 1 ? '1 argument' : `${arity} arguments`;
    throw new RoadmapError(arity === 0 ? `${name} takes no arguments.` : `${name} takes ${count}.`);
  }
  // A flag a command ignores would read as obeyed: `check --json` printing prose breaks a script that parses it.
  const taken = name !== undefined && arity !== undefined ? [...EVERY_COMMAND, ...(FLAGS[name] ?? [])] : undefined;
  const ignored = taken === undefined ? undefined : Object.keys(values).find((flag) => !taken.includes(flag));
  if (ignored !== undefined)
    throw new RoadmapError(`${name} takes no --${ignored}; \`${name} --help\` lists its options.`);
  const root = values.root ?? (env.AGENTIC_ROADMAP_ROOT || undefined);
  return {
    name,
    operands,
    root,
    commit: values.commit,
    json: values.json === true,
    block: values.block,
    state: values.state,
    by: values.by,
    from: values.from,
    strict: values.strict === true,
    requires: values.requires,
    doneWhen: values['done-when'],
    lines: values.lines,
    against: values.against,
    clear: values.clear === true,
    mermaid: values.mermaid === true,
    all: values.all === true,
    staged: values.staged === true,
    help: values.help === true,
    version: values.version === true,
  };
}
