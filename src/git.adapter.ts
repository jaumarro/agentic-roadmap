import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Commit, cutAtOtherClose, pickWorkCommit } from './commit.policy.ts';

/** git's output in `root`, trimmed; null when git fails, as outside a repo. */
function git(root: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

/** The short sha of the commit `revision` names (a sha, a branch, a tag, HEAD); null when it names none. */
export function resolveCommit(root: string, revision: string): string | null {
  return git(root, ['rev-parse', '--verify', '--quiet', '--short', '--end-of-options', `${revision}^{commit}`]);
}

/** The ones of `shas` this repo has as commits, asked of one git process: one per sha takes seconds on a big plan. */
/** Whether `root`'s clone holds only part of its history, as `git clone --depth` makes. */
export function isShallow(root: string): boolean {
  return git(root, ['rev-parse', '--is-shallow-repository']) === 'true';
}

export function readKnownCommits(root: string, shas: string[]): Set<string> {
  const unique = [...new Set(shas)];
  if (unique.length === 0) return new Set();
  try {
    const input = unique.map((sha) => `${sha}^{commit}\n`).join('');
    const output = execFileSync('git', ['cat-file', '--batch-check'], {
      cwd: root,
      encoding: 'utf8',
      input,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    // One answer per line, in order: `<oid> commit <size>` when found, else `… missing` or `… ambiguous`.
    const answers = output.split('\n');
    return new Set(unique.filter((_, at) => /^[0-9a-f]+ commit /.test(answers[at] ?? '')));
  } catch {
    return new Set();
  }
}

/** The branch tasks start from: `configured`, else the remote's default branch, else main or master; null for none. */
export function readBase(root: string, configured: string | undefined): string | null {
  if (configured !== undefined) return configured;
  const remote = git(root, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
  const candidates = [remote?.replace(/^origin\//, ''), 'main', 'master', remote];
  return candidates.find((name) => name !== undefined && name !== null && resolveCommit(root, name) !== null) ?? null;
}

/**
 * Task `id`'s commits, newest first: those since HEAD left its base, cut at the newest close of another task, which
 * ends that task's work, as below a stacked branch. Branch names play no part, so a pushed copy or a backup of the
 * branch takes nothing away. On the base itself, or with no base to tell, every commit since that close.
 */
function readOwnCommits(root: string, id: string, base: string | null, current: string | null): Commit[] {
  const bases = base === null || current === base ? [] : [base, `origin/${base}`];
  const range = ['HEAD', '--not', ...bases.filter((name) => resolveCommit(root, name) !== null)];
  const log = git(root, ['log', '-n', '200', '--format=%h%x09%s', ...range, '--']) ?? '';
  const commits = log
    .split('\n')
    .filter(Boolean)
    .map((line): Commit => {
      const [sha = '', subject = ''] = line.split('\t');
      return { sha, subject };
    });
  return cutAtOtherClose(commits, id);
}

/** The short sha that closes task `id`, from the commits it made, as `pickWorkCommit` picks it. */
export function readLastWorkCommit(
  root: string,
  id: string,
  configuredBase: string | undefined,
  isDocument: boolean,
): string | null {
  const current = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const base = readBase(root, configuredBase);
  const commits = readOwnCommits(root, id, base, current);
  return pickWorkCommit(commits, { isDocument, ownBranch: current !== base });
}

/**
 * What `path` holds on each of `branches` that has it, asked of one git process: a sequence of `<oid> blob <size>`
 * headers each followed by that many bytes, or `<name> missing` for a branch without the file.
 */
export function readOnBranches(root: string, path: string, branches: string[]): string[] {
  if (branches.length === 0) return [];
  let output: Buffer;
  try {
    const input = branches.map((branch) => `${branch}:${path}\n`).join('');
    output = execFileSync('git', ['cat-file', '--batch'], { cwd: root, input, stdio: ['pipe', 'pipe', 'ignore'] });
  } catch {
    return [];
  }
  const contents: string[] = [];
  let at = 0;
  while (at < output.length) {
    const end = output.indexOf(0x0a, at);
    if (end === -1) break;
    const header = output.subarray(at, end).toString('utf8');
    at = end + 1;
    const size = /^[0-9a-f]+ blob (\d+)$/.exec(header)?.[1];
    if (size === undefined) continue;
    contents.push(output.subarray(at, at + Number(size)).toString('utf8'));
    at += Number(size) + 1;
  }
  return contents;
}

/** The folder every worktree of `root`'s repo shares; null outside a repo. */
export function readCommonDir(root: string): string | null {
  return git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
}

/**
 * What `path`, from `root`, holds in the working tree of each other worktree of the repo: work another session has not
 * committed yet.
 */
export function readInWorktrees(root: string, path: string): string[] {
  const here = git(root, ['rev-parse', '--show-toplevel']);
  const prefix = git(root, ['rev-parse', '--show-prefix']) ?? '';
  const list = git(root, ['worktree', 'list', '--porcelain']) ?? '';
  const trees = list
    .split('\n')
    .flatMap((line) => (line.startsWith('worktree ') ? [line.slice('worktree '.length)] : []));
  return trees
    .filter((tree) => tree !== here)
    .flatMap((tree) => {
      try {
        return [readFileSync(join(tree, prefix, path), 'utf8')];
      } catch {
        return [];
      }
    });
}

/**
 * The local branches and the remote ones fetched, as `origin/abc-1/x`: how this clone sees other clones' ids and
 * started tasks. A remote's `HEAD` only points at one of its branches, so it is left out.
 */
export function listAllBranches(root: string): string[] {
  const refs = git(root, ['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes']) ?? '';
  return refs
    .split('\n')
    .filter((ref) => ref !== '' && !ref.endsWith('/HEAD'))
    .map((ref) => ref.replace(/^refs\/(heads|remotes)\//, ''));
}

/** What `path`, from `root`, holds in the index: what the next commit records; null when the index has no such file. */
export function readStaged(root: string, path: string): string | null {
  return git(root, ['show', `:./${path}`]);
}

/** Where `root` sits from the top of its repo, and the folder git runs hooks from; null outside a repo. */
export function readRepoPaths(root: string): { prefix: string; hooks: string; top: string } | null {
  const prefix = git(root, ['rev-parse', '--show-prefix']);
  const hooks = git(root, ['rev-parse', '--path-format=absolute', '--git-path', 'hooks']);
  const top = git(root, ['rev-parse', '--show-toplevel']);
  return prefix === null || hooks === null || top === null ? null : { prefix, hooks, top };
}
