import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRepoPaths } from './git.ts';
import { readMarkdownPath } from './render.ts';
import { readRoadmap, ROADMAP_DIR, RoadmapError } from './source.ts';

const MARK = '# agentic-roadmap: check the staged plan';

function quote(text: string): string {
  return `'${text.replaceAll("'", `'\\''`)}'`;
}

/** The hook's line: check the staged plan, only when the commit touches roadmap/ or its Markdown. */
export function readHookLine(root: string): string {
  const paths = readRepoPaths(root);
  if (paths === null) throw new RoadmapError('No git repo here: a hook needs one.');
  const at = paths.prefix === '' ? '.' : paths.prefix;
  const watched = [`${paths.prefix}${ROADMAP_DIR}`, `${paths.prefix}${readMarkdownPath(readRoadmap(root))}`];
  // The same extension as this file: cli.ts from the source, cli.js once built.
  const cli = fileURLToPath(new URL(`cli${extname(import.meta.url)}`, import.meta.url));
  const staged = `git diff --cached --quiet -- ${watched.map(quote).join(' ')}`;
  return `${staged} || node ${quote(cli)} check --staged --root ${quote(at)} || exit 1`;
}

/**
 * Writes a pre-commit hook that checks the staged plan. A hook already there is left as it is: the line to add to it
 * is in the message, as for a repo whose hooks husky or lefthook keep.
 */
export function installHook(root: string): string {
  const paths = readRepoPaths(root);
  if (paths === null) throw new RoadmapError('No git repo here: a hook needs one.');
  const hook = join(paths.hooks, 'pre-commit');
  const line = readHookLine(root);
  if (existsSync(hook)) {
    if (readFileSync(hook, 'utf8').includes(MARK)) return hook;
    throw new RoadmapError(`${hook} already exists, so it was left alone. Add this line to it:\n${line}`);
  }
  mkdirSync(paths.hooks, { recursive: true });
  writeFileSync(hook, `#!/bin/sh\n${MARK}\n${line}\n`);
  chmodSync(hook, 0o755);
  return hook;
}
