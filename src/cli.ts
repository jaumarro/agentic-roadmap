#!/usr/bin/env node
import { fileURLToPath } from 'node:url';

const USAGE = 'Usage: agentic-roadmap <command>\n';

/** Runs one command with `args`, writing to `out`; the exit code it ends with. */
export function run(args: string[], out: (text: string) => void): number {
  const [command] = args;
  if (command === undefined || command === 'help') {
    out(USAGE);
    return 0;
  }
  out(`Unknown command: ${command}\n${USAGE}`);
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = run(process.argv.slice(2), (text) => process.stdout.write(text));
}
