#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { checkRoadmap, findMissingCommits } from './check.ts';
import { closeTask } from './close.ts';
import { hasCommit, listBranches, readLastWorkCommit } from './git.ts';
import type { Roadmap } from './model.ts';
import { listReady, namesTask, readBranchName } from './next.ts';
import { findRoot, initRoadmap, readRoadmap, RoadmapError } from './source.ts';

const USAGE = `Usage: agentic-roadmap <command> [--root <folder>]

Commands:
  init                       start a roadmap in this folder
  next                       the task to take now, and the others ready
  close <ID> [--commit SHA]  mark a task done; the commit is the last one not starting «docs:» unless given
  check                      find what makes the plan unsound
`;

/** What a command reads from and writes to: where it runs, its environment, and its output. */
export type Io = { cwd: string; env: Record<string, string | undefined>; out: (text: string) => void };

function readOption(args: string[], name: string): string | undefined {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
}

/** The value after `--root`, else the environment's `AGENTIC_ROADMAP_ROOT`. */
function readRootOption(args: string[], env: Io['env']): string | undefined {
  return readOption(args, '--root') ?? env.AGENTIC_ROADMAP_ROOT;
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

function next(root: string, out: Io['out']): void {
  const [first, ...rest] = listReady(readSoundRoadmap(root));
  if (first === undefined) {
    out('Nothing is ready: every task is done or waits on one that is not.\n');
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

function close(root: string, args: string[], out: Io['out']): void {
  const id = args[1];
  if (id === undefined || id.startsWith('--')) throw new RoadmapError('Say which task to close: close <ID>.');
  const sha = readOption(args, '--commit') ?? readLastWorkCommit(root);
  if (sha === null) throw new RoadmapError('No commit to close it with: commit the work first, or pass --commit.');
  if (!hasCommit(root, sha)) throw new RoadmapError(`This repo has no commit ${sha}.`);
  const code = closeTask(root, readSoundRoadmap(root), id, sha);
  out(`Closed ${id} with ${sha} in roadmap/${code}.yaml. Commit it as «docs: close ${id}».\n`);
}

function check(root: string, out: Io['out']): number {
  const roadmap = readRoadmap(root);
  const problems = [...checkRoadmap(roadmap), ...findMissingCommits(roadmap, (sha) => hasCommit(root, sha))];
  out(problems.length === 0 ? 'The plan is sound.\n' : `The plan has problems:\n${listProblems(problems)}`);
  return problems.length === 0 ? 0 : 1;
}

/** Runs one command with `args`; the exit code it ends with. */
export function run(args: string[], io: Io): number {
  const [command] = args;
  try {
    const root = () => findRoot(io.cwd, readRootOption(args, io.env));
    switch (command) {
      case 'init':
        io.out(`Started a roadmap in ${initRoadmap(readRootOption(args, io.env) ?? io.cwd)}\n`);
        return 0;
      case 'next':
        next(root(), io.out);
        return 0;
      case 'close':
        close(root(), args, io.out);
        return 0;
      case 'check':
        return check(root(), io.out);
      case undefined:
      case 'help':
        io.out(USAGE);
        return 0;
      default:
        io.out(`Unknown command: ${command}\n${USAGE}`);
        return 1;
    }
  } catch (error) {
    if (!(error instanceof RoadmapError)) throw error;
    io.out(`${error.message}\n`);
    return 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const io: Io = { cwd: process.cwd(), env: process.env, out: (text) => process.stdout.write(text) };
  process.exitCode = run(process.argv.slice(2), io);
}
