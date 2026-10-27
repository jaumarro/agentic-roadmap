#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { checkRoadmap, findMissingCommits } from './check.ts';
import { closeTask } from './close.ts';
import { hasCommit, listBranches, readKnownCommits, readLastWorkCommit } from './git.ts';
import type { Roadmap } from './model.ts';
import { listReady, namesTask, readBranchName } from './next.ts';
import { findRoot, initRoadmap, readRoadmap, RoadmapError } from './source.ts';

const USAGE = `Usage: agentic-roadmap <command> [--root <folder>]

Commands:
  init                       start a roadmap in this folder
  next                       the task to take now, and the others ready
  close <ID> [--commit SHA]  mark a task done with its commit: the newest feat, fix, refactor or perf one unless given
  check                      find what makes the plan unsound

The roadmap is the nearest roadmap/roadmap.yaml from here upwards, unless --root or AGENTIC_ROADMAP_ROOT names one.
`;

const OPTIONS = {
  root: { type: 'string' },
  commit: { type: 'string' },
  help: { type: 'boolean' },
} as const;

/** How many arguments each command takes after its name. */
const ARITY: Record<string, number> = { init: 0, next: 0, check: 0, close: 1, help: 0 };

/** What a command reads from and writes to: where it runs, its environment, and its output. */
export type Io = { cwd: string; env: Record<string, string | undefined>; out: (text: string) => void };

type Command = {
  name: string | undefined;
  operands: string[];
  root: string | undefined;
  commit: string | undefined;
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
  return { name, operands, root, commit: values.commit, help: values.help === true };
}

function listProblems(problems: string[]): string {
  return problems.map((problem) => `  ${problem}\n`).join('');
}

/** The plan read under `root`, refused with its problems when it is not sound. */
function readSoundRoadmap(root: string): Roadmap {
  const roadmap = readRoadmap(root);
  const problems = checkRoadmap(roadmap);
  if (problems.length > 0) throw new RoadmapError(`The plan has problems; fix them first:\n${listProblems(problems)}`);
  return roadmap;
}

function describeNothingReady(roadmap: Roadmap): string {
  const tasks = roadmap.blocks.flatMap((block) => block.tasks);
  if (tasks.length === 0) return 'The plan has no tasks yet.';
  if (tasks.every((task) => task.commit !== undefined)) return 'Everything is done.';
  return 'Nothing is ready: every task left waits on one that is not done.';
}

function next(root: string, out: Io['out']): void {
  const roadmap = readSoundRoadmap(root);
  const [first, ...rest] = listReady(roadmap);
  if (first === undefined) {
    out(`${describeNothingReady(roadmap)}\n`);
    return;
  }
  out(`Next: ${first.id} · ${first.title}\n  Done when: ${first.doneWhen}\n`);
  const started = listBranches(root).filter((branch) => namesTask(branch, first.id));
  const place =
    started.length > 0
      ? `Already started on ${started.join(', ')}`
      : `Start it on a branch named ${readBranchName(first.id)}…`;
  out(`  ${place}\n`);
  if (rest.length > 0) out(`\nAlso ready:\n${rest.map((task) => `  ${task.id} · ${task.title}\n`).join('')}`);
}

function close(root: string, command: Command, out: Io['out']): void {
  const [id] = command.operands;
  if (id === undefined) throw new RoadmapError('Say which task to close: close <ID>.');
  const sha = command.commit ?? readLastWorkCommit(root);
  if (sha === null) throw new RoadmapError('No commit to close it with: commit the work first, or pass --commit.');
  if (!hasCommit(root, sha)) throw new RoadmapError(`This repo has no commit ${sha}.`);
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
        io.out(`Started a roadmap in ${initRoadmap(given ?? io.cwd)}.\n`);
        return 0;
      case 'next':
        next(root(), io.out);
        return 0;
      case 'close':
        close(root(), command, io.out);
        return 0;
      case 'check':
        return check(root(), io.out);
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
