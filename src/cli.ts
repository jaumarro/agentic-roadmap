#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { addTask, readNextId } from './add.ts';
import { checkRoadmap, findMissingCommits } from './check.ts';
import { closeTask } from './close.ts';
import { listBranches, readKnownCommits, readLastWorkCommit, readOnBranches, resolveCommit } from './git.ts';
import type { Roadmap } from './model.ts';
import { listReady, namesTask, readBranchName } from './next.ts';
import { measureHealth } from './health.ts';
import { installMergeDriver, runMergeDriver } from './merge-driver.ts';
import { listRows, renderHealth, renderList, renderShown, renderWhy, STATES } from './query.ts';
import { findRoot, initRoadmap, readRoadmap, ROADMAP_DIR, RoadmapError } from './source.ts';
import { describeTask, explainWait, readStates, type TaskState } from './state.ts';

const USAGE = `Usage: agentic-roadmap <command> [--root <folder>]

Commands:
  init                       start a roadmap in this folder
  next                       the task to take now, and the others ready
  close <ID> [--commit SHA]  mark a task done with its commit: the newest feat, fix, refactor or perf one unless given
  check                      find what makes the plan unsound
  show <ID> [--json]         a task: its block, done when, what it requires and unblocks, and where it stands
  why <ID> [--json]          what a task waits on, down to the tasks that can be taken now
  list [--block CODE] [--state done|started|ready|waiting] [--json]
                             every task with its state, by block
  health [--json] [--strict] the plan's shape (critical path, parallelism, width) and its worst problems;
                             --strict fails when there is any
  add <BLOCK> <TITLE> --done-when TEXT --lines N|doc [--requires ID,ID]
                             add a task with the next free id, here and on every local branch
  install-merge-driver       make git merge roadmap/*.yaml task by task, so parallel adds and closes merge cleanly

The roadmap is the nearest roadmap/roadmap.yaml from here upwards, unless --root or AGENTIC_ROADMAP_ROOT names one.
`;

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
  strict: { type: 'boolean' },
  requires: { type: 'string' },
  'done-when': { type: 'string' },
  lines: { type: 'string' },
  help: { type: 'boolean' },
} as const;

/** How many arguments each command takes after its name. */
const ARITY: Record<string, number> = {
  init: 0,
  next: 0,
  check: 0,
  close: 1,
  show: 1,
  why: 1,
  list: 0,
  health: 0,
  add: 2,
  'install-merge-driver': 0,
  'merge-block': 3,
  help: 0,
};

/** What a command reads from and writes to: where it runs, its environment, and its output. */
export type Io = { cwd: string; env: Record<string, string | undefined>; out: (text: string) => void };

type Command = {
  name: string | undefined;
  operands: string[];
  root: string | undefined;
  commit: string | undefined;
  json: boolean;
  block: string | undefined;
  state: string | undefined;
  strict: boolean;
  requires: string | undefined;
  doneWhen: string | undefined;
  lines: string | undefined;
  help: boolean;
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
    strict: values.strict === true,
    requires: values.requires,
    doneWhen: values['done-when'],
    lines: values.lines,
    help: values.help === true,
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

/** Adds a task with the id the tool picks; the plan is checked with it before anything is written. */
function add(root: string, command: Command, out: Io['out']): void {
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
  const onBranches = readOnBranches(root, `${ROADMAP_DIR}/${code}.yaml`, listBranches(root));
  const id = readNextId(roadmap, code, onBranches);
  addTask(root, roadmap, code, id, { title: title.trim(), requires, doneWhen: command.doneWhen.trim(), lines });
  out(`Added ${id} · ${title.trim()} to ${ROADMAP_DIR}/${code}.yaml.\n`);
}

/** The plan's health; with `--strict`, a plan with any problem fails, for a check to gate on. */
function health(root: string, command: Command, out: Io['out']): number {
  const measured = measureHealth(readSoundRoadmap(root));
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
  const rows = listRows(roadmap, listBranches(root), { block, state });
  out(command.json ? `${JSON.stringify(rows, null, 2)}\n` : renderList(roadmap, rows));
}

function readTaskId(command: Command): string {
  const [id] = command.operands;
  if (id === undefined) throw new RoadmapError(`Say which task: ${command.name ?? ''} <ID>.`);
  return id;
}

function show(root: string, command: Command, out: Io['out']): void {
  const id = readTaskId(command);
  const shown = describeTask(readSoundRoadmap(root), listBranches(root), id);
  if (shown === null) throw new RoadmapError(`No task ${id} in this roadmap.`);
  out(command.json ? `${JSON.stringify(shown, null, 2)}\n` : renderShown(shown));
}

function why(root: string, command: Command, out: Io['out']): void {
  const id = readTaskId(command);
  const roadmap = readSoundRoadmap(root);
  const branches = listBranches(root);
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

function listInProgress(roadmap: Roadmap, branches: string[]): string {
  const tasks = roadmap.blocks.flatMap((block) => block.tasks).filter((task) => task.commit === undefined);
  const lines = tasks.flatMap((task) => {
    const on = branches.filter((branch) => namesTask(branch, task.id));
    return on.length === 0 ? [] : [`  ${task.id} · ${task.title} (on ${on.join(', ')})\n`];
  });
  return lines.length === 0 ? '' : `\nIn progress:\n${lines.join('')}`;
}

/** The task to take, never one a branch already started, then the others ready and those in progress. */
function next(root: string, out: Io['out']): void {
  const roadmap = readSoundRoadmap(root);
  const branches = listBranches(root);
  const states = readStates(roadmap, branches);
  const [first, ...rest] = listReady(roadmap).filter((task) => states.get(task.id) === 'ready');
  const inProgress = listInProgress(roadmap, branches);
  if (first === undefined) {
    out(`${describeNothingReady(roadmap)}\n${inProgress}`);
    return;
  }
  out(`Next: ${first.id} · ${first.title}\n  Done when: ${first.doneWhen}\n`);
  out(`  Start it on a branch named ${readBranchName(first.id)}…\n`);
  if (rest.length > 0) out(`\nAlso ready:\n${rest.map((task) => `  ${task.id} · ${task.title}\n`).join('')}`);
  out(inProgress);
}

function close(root: string, command: Command, out: Io['out']): void {
  const [id] = command.operands;
  if (id === undefined) throw new RoadmapError('Say which task to close: close <ID>.');
  if (command.commit === '') throw new RoadmapError('--commit needs a commit.');
  const revision = command.commit ?? readLastWorkCommit(root);
  if (revision === null) throw new RoadmapError('No commit to close it with: commit the work first, or pass --commit.');
  // A branch, a tag or HEAD is written as the commit it names today, which a later move cannot change.
  const sha = resolveCommit(root, revision);
  if (sha === null) throw new RoadmapError(`This repo has no commit ${revision}.`);
  const code = closeTask(root, readSoundRoadmap(root), id, sha);
  out(`Closed ${id} with ${sha} in roadmap/${code}.yaml. Commit it as «docs: close ${id}».\n`);
}

function check(root: string, out: Io['out']): number {
  const roadmap = readRoadmap(root);
  const cited = roadmap.blocks.flatMap((block) => block.tasks.flatMap((task) => (task.commit ? [task.commit] : [])));
  const known = readKnownCommits(root, cited);
  const problems = [...checkRoadmap(roadmap), ...findMissingCommits(roadmap, (sha) => known.has(sha))];
  out(problems.length === 0 ? 'The plan is sound.\n' : `The plan has problems:\n${listProblems(problems)}`);
  return problems.length === 0 ? 0 : 1;
}

/** Runs one command with `args`; the exit code it ends with. */
export function run(args: string[], io: Io): number {
  try {
    const command = readCommand(args, io.env);
    const given = command.root === undefined ? undefined : resolve(io.cwd, command.root);
    const root = () => findRoot(io.cwd, given);
    if (command.help) {
      io.out(USAGE);
      return 0;
    }
    switch (command.name) {
      case 'init':
        io.out(`Started a roadmap in ${initRoadmap(given ?? io.cwd)}.\n${AFTER_INIT}`);
        return 0;
      case 'next':
        next(root(), io.out);
        return 0;
      case 'close':
        close(root(), command, io.out);
        return 0;
      case 'check':
        return check(root(), io.out);
      case 'show':
        show(root(), command, io.out);
        return 0;
      case 'why':
        why(root(), command, io.out);
        return 0;
      case 'list':
        list(root(), command, io.out);
        return 0;
      case 'install-merge-driver':
        io.out(`git now merges roadmap/*.yaml task by task; the attribute is in ${installMergeDriver(root())}.\n`);
        return 0;
      case 'merge-block': {
        // Git runs this itself, with the three versions' paths: see install-merge-driver.
        const [base = '', ours = '', theirs = ''] = command.operands;
        const result = runMergeDriver(base, ours, theirs);
        if (!result.merged) io.out(`agentic-roadmap could not merge it: ${result.why}.\n`);
        return result.merged ? 0 : 1;
      }
      case 'add':
        add(root(), command, io.out);
        return 0;
      case 'health':
        return health(root(), command, io.out);
      case undefined:
      case 'help':
        io.out(USAGE);
        return 0;
      default:
        io.out(`Unknown command: ${command.name}\n${USAGE}`);
        return 1;
    }
  } catch (error) {
    if (!(error instanceof RoadmapError)) throw error;
    io.out(`${error.message}\n`);
    return 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // A reader that stops early, as `| head -1`, closes the pipe: what is left unread is not a failure.
  process.stdout.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code !== 'EPIPE') throw error;
    process.exit(process.exitCode ?? 0);
  });
  const io: Io = { cwd: process.cwd(), env: process.env, out: (text) => process.stdout.write(text) };
  process.exitCode = run(process.argv.slice(2), io);
}
