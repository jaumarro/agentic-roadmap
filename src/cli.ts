#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { addTask, readNextId } from './add.ts';
import { addRows, readPlanTable } from './batch.ts';
import { checkRoadmap, findMissingCommits, warnRoadmap } from './check.ts';
import { compareHealth, readRoadmapAt, renderComparison, renderDelta } from './compare.ts';
import { closeTask } from './close.ts';
import {
  listAllBranches,
  readKnownCommits,
  readBase,
  readLastWorkCommit,
  readCommonDir,
  readInWorktrees,
  readOnBranches,
  readStaged,
  resolveCommit,
} from './git.ts';
import { readGraph, renderMermaid } from './graph.ts';
import { installHook } from './hook.ts';
import { withLock } from './lock.ts';
import type { Roadmap } from './model.ts';
import { setFocus } from './focus.ts';
import { listFree, listInProgress, renderFree, type InProgress } from './free.ts';
import { measureHealth } from './health.ts';
import { installMergeDriver, runMergeDriver } from './merge-driver.ts';
import { installSkill } from './install-skill.ts';
import {
  listRows,
  renderHealth,
  renderList,
  renderShown,
  renderWaves,
  renderWhy,
  sortByWave,
  STATES,
} from './query.ts';
import { checkMarkdown, measureProgress, renderProgress, syncMarkdown, writeMarkdown } from './render.ts';
import { findRoot, initRoadmap, readRoadmap, readStagedRoadmap, ROADMAP_DIR, RoadmapError } from './source.ts';
import { describeTask, explainWait, readStates, type TaskState } from './state.ts';

const USAGE = `Usage: agentic-roadmap <command> [--root <folder>]
       agentic-roadmap <command> --help, or help <command>: that command alone; --version: this one's

Commands:
  init                       start a roadmap in this folder
  next [--json]              the task to take now, the others ready, and those in progress
  free [N] [--json]          the first N tasks free to take, three unless told: one per session
  focus <CODE|ID>... | --clear
                             take these blocks and tasks first, in this order; --clear takes the plan as it reads
  close <ID> [--commit SHA]  mark a task done with its commit: the newest feat, fix, refactor or perf one unless given
  check [--staged]           find what makes the plan unsound, and a Markdown that no longer matches it; --staged
                             checks the plan the next commit records
  render                     write the plan as Markdown where roadmap.yaml's markdown: says, docs/roadmap.md unless
                             told; with markdown: set, close, add and focus keep it current
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
  install-hook               a pre-commit hook that runs check --staged when a commit touches the plan
  install-merge-driver       make git merge roadmap/*.yaml task by task, so parallel adds and closes merge cleanly
  install-skill              copy the agents' workflow into .claude/skills, next to roadmap/; again to update it

The roadmap is the nearest roadmap/roadmap.yaml from here upwards, unless --root or AGENTIC_ROADMAP_ROOT names one.
`;

const FOOTER = USAGE.slice(USAGE.lastIndexOf('\n\n') + 2);
// A command's entry in USAGE: its line, and the lines under it indented past the names.
const CONTINUED = ' '.repeat(29);

/** One command's usage, cut from the full one so the two never disagree; the full one for none or an unknown one. */
function readHelp(name: string | undefined): string {
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

function readVersion(): string {
  const manifest: unknown = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const version = manifest !== null && typeof manifest === 'object' && 'version' in manifest ? manifest.version : '';
  return String(version);
}

// The plan has to be on the base branch before a task's branch can mark anything started.
const AFTER_INIT = `Write your blocks, run check, then commit roadmap/ on your base branch, as «docs: start the roadmap».
Each task then gets its own branch from there, named after it, as abc-1/short-slug.
`;

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
  'install-hook': 0,
  'install-merge-driver': 0,
  'install-skill': 0,
  'merge-block': 3,
  help: 1,
};

/** What a command reads from and writes to: where it runs, its environment, its answer, and its errors. */
export type Io = {
  cwd: string;
  env: Record<string, string | undefined>;
  out: (text: string) => void;
  err: (text: string) => void;
};

type Command = {
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

function readCommand(args: string[], env: Io['env']): Command {
  let parsed;
  try {
    parsed = parseArgs({ args, options: OPTIONS, allowPositionals: true, strict: true });
  } catch (error) {
    throw new RoadmapError(error instanceof Error ? error.message : String(error));
  }
  const { values, positionals } = parsed;
  if (values.root === '') throw new RoadmapError('--root needs a folder.');
  const [name, ...operands] = positionals;
  const arity = name === undefined ? 0 : ARITY[name];
  if (arity !== undefined && operands.length > arity && name !== undefined) {
    throw new RoadmapError(arity === 0 ? `${name} takes no arguments.` : `${name} takes ${arity} argument.`);
  }
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

function readLines(value: string | undefined): number | 'doc' {
  if (value === 'doc') return value;
  const lines = Number(value);
  if (value === undefined || !Number.isInteger(lines) || lines <= 0) {
    throw new RoadmapError('--lines is a positive whole number, or doc.');
  }
  return lines;
}

/** Block `code`'s file as every branch has it committed and every other worktree has it, committed or not. */
function readElsewhere(root: string, code: string, branches: string[]): string[] {
  const path = `${ROADMAP_DIR}/${code}.yaml`;
  // `./` reads a branch's file from the roadmap's folder, not the repo's top, as when roadmap/ sits in a subfolder.
  return [...readOnBranches(root, `./${path}`, branches), ...readInWorktrees(root, path)];
}

/** Adds a plan's table of tasks in one go; `-` reads the plan from stdin. */
function addFrom(root: string, from: string, out: Io['out']): void {
  let text: string;
  try {
    text = readFileSync(from === '-' ? 0 : from, 'utf8');
  } catch {
    throw new RoadmapError(`Could not read ${from}.`);
  }
  const rows = readPlanTable(text);
  const roadmap = readSoundRoadmap(root);
  const branches = listAllBranches(root);
  const added = addRows(root, roadmap, rows, (code) => readElsewhere(root, code, branches));
  const after = readRoadmap(root);
  syncMarkdown(root, after);
  out(`Added ${added.length} tasks:\n${added.map((each) => `  ${each.id} · ${each.title}\n`).join('')}`);
  out(renderDelta(compareHealth('before', measureHealth(roadmap), measureHealth(after))));
}

/** Adds a task with the id the tool picks; the plan is checked with it before anything is written. */
function add(root: string, command: Command, out: Io['out']): void {
  if (command.from !== undefined) {
    if (command.operands.length > 0) throw new RoadmapError('add takes a block and a title, or --from, not both.');
    addFrom(root, command.from, out);
    return;
  }
  const [code, title] = command.operands;
  if (code === undefined || title === undefined || title.trim() === '') {
    throw new RoadmapError('Say the block and the title: add <BLOCK> <TITLE>.');
  }
  if (command.doneWhen === undefined || command.doneWhen.trim() === '') {
    throw new RoadmapError('Say when it is done: --done-when TEXT, checkable by a command, a test or a screen.');
  }
  const lines = readLines(command.lines);
  const requires = (command.requires ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const roadmap = readSoundRoadmap(root);
  const id = readNextId(roadmap, code, readElsewhere(root, code, listAllBranches(root)));
  addTask(root, roadmap, code, id, { title: title.trim(), requires, doneWhen: command.doneWhen.trim(), lines });
  const added = readRoadmap(root);
  syncMarkdown(root, added);
  out(`Added ${id} · ${title.trim()} to ${ROADMAP_DIR}/${code}.yaml.\n`);
  out(renderDelta(compareHealth('before', measureHealth(roadmap), measureHealth(added))));
}

/** The plan's health; with `--strict`, a plan with any problem fails, for a check to gate on. */
function health(root: string, command: Command, out: Io['out']): number {
  const measured = measureHealth(readSoundRoadmap(root));
  if (command.against !== undefined) {
    const before = measureHealth(readRoadmapAt(root, command.against));
    const comparison = compareHealth(command.against, before, measured);
    out(command.json ? `${JSON.stringify(comparison, null, 2)}\n` : renderComparison(comparison));
    return command.strict && comparison.worse.length > 0 ? 1 : 0;
  }
  out(command.json ? `${JSON.stringify(measured, null, 2)}\n` : renderHealth(measured));
  return command.strict && measured.problems.length > 0 ? 1 : 0;
}

function isState(value: string): value is TaskState {
  return STATES.some((state) => state === value);
}

function list(root: string, command: Command, out: Io['out']): void {
  const { block, state } = command;
  if (state !== undefined && !isState(state)) throw new RoadmapError(`--state is one of ${STATES.join(', ')}.`);
  const roadmap = readSoundRoadmap(root);
  if (block !== undefined && !roadmap.blocks.some((each) => each.code === block)) {
    throw new RoadmapError(`No block ${block} in this roadmap.`);
  }
  if (command.by !== undefined && command.by !== 'block' && command.by !== 'wave') {
    throw new RoadmapError('--by is block or wave.');
  }
  const all = listRows(roadmap, listAllBranches(root), { block, state });
  const byWave = command.by === 'wave';
  const rows = byWave ? sortByWave(all, roadmap.focus ?? []) : all;
  if (command.json) {
    out(`${JSON.stringify(rows, null, 2)}\n`);
    return;
  }
  out(byWave ? renderWaves(rows) : renderList(roadmap, rows));
}

/** The dependency graph, as Mermaid for a person or a renderer and as JSON for an agent. */
function graph(root: string, command: Command, out: Io['out']): number {
  if (command.mermaid && command.json) throw new RoadmapError('graph takes --mermaid or --json, not both.');
  const roadmap = readSoundRoadmap(root);
  const shown = readGraph(roadmap, listAllBranches(root), command.all);
  out(command.json ? `${JSON.stringify(shown, null, 2)}\n` : renderMermaid(roadmap, shown));
  return 0;
}

function readTaskId(command: Command): string {
  const [id] = command.operands;
  if (id === undefined) throw new RoadmapError(`Say which task: ${command.name ?? ''} <ID>.`);
  return id;
}

function show(root: string, command: Command, out: Io['out']): void {
  const id = readTaskId(command);
  const shown = describeTask(readSoundRoadmap(root), listAllBranches(root), id);
  if (shown === null) throw new RoadmapError(`No task ${id} in this roadmap.`);
  out(command.json ? `${JSON.stringify(shown, null, 2)}\n` : renderShown(shown));
}

function why(root: string, command: Command, out: Io['out']): void {
  const id = readTaskId(command);
  const roadmap = readSoundRoadmap(root);
  const branches = listAllBranches(root);
  const state = readStates(roadmap, branches).get(id);
  if (state === undefined) throw new RoadmapError(`No task ${id} in this roadmap.`);
  const waitsOn = explainWait(roadmap, branches, id);
  out(command.json ? `${JSON.stringify({ id, state, waitsOn }, null, 2)}\n` : renderWhy(id, state, waitsOn));
}

function listProblems(problems: string[]): string {
  return problems.map((problem) => `  ${problem}\n`).join('');
}

/** The plan read under `root`, refused with its problems when it is not sound. */
function readSoundRoadmap(root: string): Roadmap {
  const roadmap = readRoadmap(root);
  const problems = checkRoadmap(roadmap);
  if (problems.length > 0) {
    throw new RoadmapError(`The plan has problems; fix them first:\n${listProblems(problems).trimEnd()}`);
  }
  return roadmap;
}

function describeNothingReady(roadmap: Roadmap): string {
  const tasks = roadmap.blocks.flatMap((block) => block.tasks);
  if (tasks.length === 0) return 'The plan has no tasks yet.';
  if (tasks.every((task) => task.commit !== undefined)) return 'Everything is done.';
  return 'Nothing is ready: every task left waits on one that is not done.';
}

function renderInProgress(inProgress: InProgress[]): string {
  if (inProgress.length === 0) return '';
  const lines = inProgress.map((task) => `  ${task.id} · ${task.title} (on ${task.branches.join(', ')})\n`);
  return `\nIn progress:\n${lines.join('')}`;
}

/** The task to take, never one a branch already started, then the others ready and those in progress. */
function next(root: string, command: Command, out: Io['out']): void {
  const roadmap = readSoundRoadmap(root);
  const branches = listAllBranches(root);
  const [first, ...rest] = listFree(roadmap, branches);
  const inProgress = listInProgress(roadmap, branches);
  if (command.json) {
    out(`${JSON.stringify({ next: first ?? null, ready: rest, inProgress }, null, 2)}\n`);
    return;
  }
  if (first === undefined) {
    out(`${describeNothingReady(roadmap)}\n${renderInProgress(inProgress)}`);
    return;
  }
  out(`Next: ${first.id} · ${first.title}\n  Done when: ${first.doneWhen}\n`);
  out(`  Start it on a branch named ${first.branch}…\n`);
  if (rest.length > 0) out(`\nAlso ready:\n${rest.map((task) => `  ${task.id} · ${task.title}\n`).join('')}`);
  out(renderInProgress(inProgress));
}

/** The first N free tasks, one per session; three unless told. */
function free(root: string, command: Command, out: Io['out']): void {
  const [given] = command.operands;
  const count = given === undefined ? 3 : Number(given);
  if (!Number.isInteger(count) || count <= 0) throw new RoadmapError('free takes a positive whole number of tasks.');
  const roadmap = readSoundRoadmap(root);
  const tasks = listFree(roadmap, listAllBranches(root));
  if (command.json) {
    out(`${JSON.stringify(tasks.slice(0, count), null, 2)}\n`);
    return;
  }
  out(renderFree(tasks, count, measureHealth(roadmap).width));
}

/** Sets the focus, or clears it; read without the sound check, so a focus gone stale can still be replaced. */
function focus(root: string, command: Command, out: Io['out']): void {
  if (command.clear && command.operands.length > 0) throw new RoadmapError('focus takes blocks and tasks, or --clear.');
  if (!command.clear && command.operands.length === 0) {
    throw new RoadmapError('Say what to take first: focus <CODE|ID>..., or focus --clear.');
  }
  setFocus(root, readRoadmap(root), command.operands);
  syncMarkdown(root, readRoadmap(root));
  const said = command.clear ? 'Cleared the focus' : `The focus is ${command.operands.join(', ')}`;
  out(`${said}. Commit ${ROADMAP_DIR}/roadmap.yaml as «docs: focus the plan».\n`);
}

function close(root: string, command: Command, out: Io['out']): void {
  const [id] = command.operands;
  if (id === undefined) throw new RoadmapError('Say which task to close: close <ID>.');
  if (command.commit === '') throw new RoadmapError('--commit needs a commit.');
  const roadmap = readSoundRoadmap(root);
  // The task comes first: a missing one is the error to give, not the commit that would have closed it.
  if (!roadmap.blocks.some((block) => block.tasks.some((task) => task.id === id))) {
    throw new RoadmapError(`No task ${id} in this roadmap.`);
  }
  const { base } = roadmap;
  // A base that names nothing would leave close no bound, free to take another task's work.
  if (base !== undefined && resolveCommit(root, base) === null) {
    throw new RoadmapError(`base: ${base} in roadmap.yaml names no branch here.`);
  }
  // With no base to bound it, the search would reach back into history older than the task.
  if (command.commit === undefined && readBase(root, base) === null) {
    throw new RoadmapError(
      'close cannot tell which branch tasks start from: set base: in roadmap.yaml, or pass --commit.',
    );
  }
  const revision = command.commit ?? readLastWorkCommit(root, id, base);
  if (revision === null) throw new RoadmapError('No commit to close it with: commit the work first, or pass --commit.');
  // A branch, a tag or HEAD is written as the commit it names today, which a later move cannot change.
  const sha = resolveCommit(root, revision);
  if (sha === null) throw new RoadmapError(`This repo has no commit ${revision}.`);
  const code = closeTask(root, roadmap, id, sha);
  syncMarkdown(root, readRoadmap(root));
  out(`Closed ${id} with ${sha} in roadmap/${code}.yaml. Commit it as «docs: close ${id}».\n`);
}

function check(root: string, command: Command, out: Io['out']): number {
  const roadmap = command.staged ? readStagedRoadmap(root) : readRoadmap(root);
  const readMarkdown = command.staged ? readStaged : undefined;
  const cited = roadmap.blocks.flatMap((block) => block.tasks.flatMap((task) => (task.commit ? [task.commit] : [])));
  const known = readKnownCommits(root, cited);
  const problems = [
    ...checkRoadmap(roadmap),
    ...findMissingCommits(roadmap, (sha) => known.has(sha)),
    ...checkMarkdown(root, roadmap, readMarkdown),
  ];
  out(problems.length === 0 ? 'The plan is sound.\n' : `The plan has problems:\n${listProblems(problems)}`);
  const warnings = warnRoadmap(roadmap);
  if (warnings.length > 0) out(`Warnings, which do not fail it:\n${listProblems(warnings)}`);
  return problems.length === 0 ? 0 : 1;
}

/** Runs one command with `args`; the exit code it ends with. */
export function run(args: string[], io: Io): number {
  try {
    const command = readCommand(args, io.env);
    const given = command.root === undefined ? undefined : resolve(io.cwd, command.root);
    const root = () => findRoot(io.cwd, given);
    if (command.version) {
      io.out(`${readVersion()}\n`);
      return 0;
    }
    if (command.help) {
      io.out(readHelp(command.name));
      return 0;
    }
    switch (command.name) {
      case 'init':
        io.out(`Started a roadmap in ${initRoadmap(given ?? io.cwd)}.\n${AFTER_INIT}`);
        return 0;
      case 'next':
        next(root(), command, io.out);
        return 0;
      case 'free':
        free(root(), command, io.out);
        return 0;
      case 'focus':
        focus(root(), command, io.out);
        return 0;
      case 'close':
        close(root(), command, io.out);
        return 0;
      case 'check':
        return check(root(), command, io.out);
      case 'render': {
        const at = root();
        io.out(`Wrote ${writeMarkdown(at, readSoundRoadmap(at))}.\n`);
        return 0;
      }
      case 'status': {
        const progress = measureProgress(readSoundRoadmap(root()));
        io.out(command.json ? `${JSON.stringify(progress, null, 2)}\n` : renderProgress(progress));
        return 0;
      }
      case 'show':
        show(root(), command, io.out);
        return 0;
      case 'why':
        why(root(), command, io.out);
        return 0;
      case 'list':
        list(root(), command, io.out);
        return 0;
      case 'graph':
        return graph(root(), command, io.out);
      case 'install-hook':
        io.out(`Commits that touch the plan now run check --staged first; the hook is ${installHook(root())}.\n`);
        return 0;
      case 'install-merge-driver':
        io.out(`git now merges roadmap/*.yaml task by task; the attribute is in ${installMergeDriver(root())}.\n`);
        return 0;
      case 'install-skill':
        io.out(`Installed the roadmap-workflow skill in ${installSkill(root())}.\n`);
        return 0;
      case 'merge-block': {
        // Git runs this itself, with the three versions' paths: see install-merge-driver.
        const [base = '', ours = '', theirs = ''] = command.operands;
        const result = runMergeDriver(base, ours, theirs);
        if (!result.merged) io.err(`agentic-roadmap could not merge it: ${result.why}.\n`);
        return result.merged ? 0 : 1;
      }
      case 'add': {
        // A plan's path is from where the command runs, as the shell completed it, not from the roadmap.
        const from = command.from === undefined || command.from === '-' ? command.from : resolve(io.cwd, command.from);
        const at = root();
        const gitDir = readCommonDir(at);
        // Picking an id and writing it is one step for every session sharing the repo: outside one, nothing is shared.
        if (gitDir === null) add(at, { ...command, from }, io.out);
        else withLock(gitDir, () => add(at, { ...command, from }, io.out));
        return 0;
      }
      case 'health':
        return health(root(), command, io.out);
      case undefined:
        io.out(USAGE);
        return 0;
      case 'help':
        io.out(readHelp(command.operands[0]));
        return 0;
      default:
        io.err(`Unknown command: ${command.name}\n${USAGE}`);
        return 1;
    }
  } catch (error) {
    if (!(error instanceof RoadmapError)) throw error;
    io.err(`${error.message}\n`);
    return 1;
  }
}

/** Whether this file is the one node was started with: through a symlink too, as package managers install binaries. */
function isEntryPoint(): boolean {
  const started = process.argv[1];
  return started !== undefined && realpathSync(started) === realpathSync(fileURLToPath(import.meta.url));
}

if (isEntryPoint()) {
  // A reader that stops early, as `| head -1`, closes the pipe: what is left unread is not a failure.
  process.stdout.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code !== 'EPIPE') throw error;
    process.exit(process.exitCode ?? 0);
  });
  const io: Io = {
    cwd: process.cwd(),
    env: process.env,
    out: (text) => process.stdout.write(text),
    err: (text) => process.stderr.write(text),
  };
  process.exitCode = run(process.argv.slice(2), io);
}
