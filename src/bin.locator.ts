import { existsSync, realpathSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join('node_modules', '.bin', 'agentic-roadmap');

export function quote(text: string): string {
  return `'${text.replaceAll("'", `'\\''`)}'`;
}

/**
 * How git, running a hook or a merge driver from the repo's top folder `top`, should start this CLI. The repo's own
 * `node_modules/.bin` link, nearest `root` first, keeps its path across upgrades; without one, as when this runs from
 * its source or through npx, the file running now.
 */
export function readCommand(top: string, root: string): string {
  // git gives the top folder with symlinks resolved, so the walk starts from the same kind of path.
  for (let dir = realpathSync(root); ; dir = dirname(dir)) {
    if (existsSync(join(dir, BIN))) return quote(relative(top, join(dir, BIN)));
    if (dir === top || dirname(dir) === dir) break;
  }
  // The same extension as this file: cli.ts from the source, cli.js once built.
  const cli = fileURLToPath(new URL(`cli${extname(import.meta.url)}`, import.meta.url));
  return `node ${quote(cli)}`;
}
