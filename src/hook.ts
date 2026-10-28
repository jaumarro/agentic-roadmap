import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { quote, readCommand } from './command.ts';
import { readRepoPaths } from './git.ts';
import { readMarkdownPath } from './render.ts';
import { readRoadmap, ROADMAP_DIR, RoadmapError } from './source.ts';

const MARK = '# agentic-roadmap: check the staged plan';

/** The hook's line: check the staged plan, only when the commit touches roadmap/ or its Markdown. */
export function readHookLine(root: string): string {
  const paths = readRepoPaths(root);
  if (paths === null) throw new RoadmapError('No git repo here: a hook needs one.');
  const at = paths.prefix === '' ? '.' : paths.prefix;
  const watched = [`${paths.prefix}${ROADMAP_DIR}`, `${paths.prefix}${readMarkdownPath(readRoadmap(root))}`];
  const staged = `git diff --cached --quiet -- ${watched.map(quote).join(' ')}`;
  return `${staged} || ${readCommand(paths.top, root)} check --staged --root ${quote(at)} || exit 1`;
}

/**
 * Writes a pre-commit hook that checks the staged plan; run again, it rewrites its own line, as after an upgrade moved
 * the CLI. A hook it did not write is left as it is: the line to add to it is in the message, as for a repo whose
 * hooks husky or lefthook keep.
 */
export function installHook(root: string): string {
  const paths = readRepoPaths(root);
  if (paths === null) throw new RoadmapError('No git repo here: a hook needs one.');
  const hook = join(paths.hooks, 'pre-commit');
  const line = readHookLine(root);
  if (existsSync(hook)) {
    const lines = readFileSync(hook, 'utf8').split('\n');
    const at = lines.indexOf(MARK);
    if (at === -1)
      throw new RoadmapError(`${hook} already exists, so it was left alone. Add this line to it:\n${line}`);
    writeFileSync(hook, [...lines.slice(0, at + 1), line, ...lines.slice(at + 2)].join('\n'));
    return hook;
  }
  mkdirSync(paths.hooks, { recursive: true });
  writeFileSync(hook, `#!/bin/sh\n${MARK}\n${line}\n`);
  chmodSync(hook, 0o755);
  return hook;
}
