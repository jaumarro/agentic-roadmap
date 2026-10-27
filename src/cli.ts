#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { listReady, readBranchName } from './next.ts';
import { findRoot, initRoadmap, readRoadmap, RoadmapError } from './source.ts';

const USAGE = `Usage: agentic-roadmap <command> [--root <folder>]

Commands:
  init   start a roadmap in this folder
  next   the task to take now, and the others ready
`;

/** What a command reads from and writes to: where it runs, its environment, and its output. */
export type Io = { cwd: string; env: Record<string, string | undefined>; out: (text: string) => void };

/** The value after `--root`, else the environment's `AGENTIC_ROADMAP_ROOT`. */
function readRootOption(args: string[], env: Io['env']): string | undefined {
  const at = args.indexOf('--root');
  return at === -1 ? env.AGENTIC_ROADMAP_ROOT : args[at + 1];
}

function next(root: string, out: Io['out']): void {
  const [first, ...rest] = listReady(readRoadmap(root));
  if (first === undefined) {
    out('Nothing is ready: every task is done or waits on one that is not.\n');
    return;
  }
  out(`Next: ${first.id} · ${first.title}\n  Done when: ${first.doneWhen}\n`);
  out(`  Start it on a branch named ${readBranchName(first.id)}…\n`);
  if (rest.length > 0) out(`\nAlso ready:\n${rest.map((task) => `  ${task.id} · ${task.title}\n`).join('')}`);
}

/** Runs one command with `args`; the exit code it ends with. */
export function run(args: string[], io: Io): number {
  const [command] = args;
  try {
    switch (command) {
      case 'init':
        io.out(`Started a roadmap in ${initRoadmap(readRootOption(args, io.env) ?? io.cwd)}\n`);
        return 0;
      case 'next':
        next(findRoot(io.cwd, readRootOption(args, io.env)), io.out);
        return 0;
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
