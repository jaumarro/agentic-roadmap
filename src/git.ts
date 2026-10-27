import { execFileSync } from 'node:child_process';

/** git's output in `root`, trimmed; null when git fails, as outside a repo. */
function git(root: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

export function hasCommit(root: string, sha: string): boolean {
  return git(root, ['cat-file', '-e', `${sha}^{commit}`]) !== null;
}

// A conventional `docs:` commit records the plan; the work is the commit before it.
const PLAN_COMMIT = /^docs(\([^)]*\))?!?:/;

/** The short sha of the newest commit on HEAD that is not a `docs:` one; null when there is none. */
export function readLastWorkCommit(root: string): string | null {
  const log = git(root, ['log', '-n', '200', '--format=%h%x09%s']) ?? '';
  const work = log
    .split('\n')
    .map((line) => line.split('\t'))
    .find(([sha, subject = '']) => sha && !PLAN_COMMIT.test(subject));
  return work?.[0] ?? null;
}

/** The local branches; none outside a repo. */
export function listBranches(root: string): string[] {
  const refs = git(root, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']) ?? '';
  return refs.split('\n').filter(Boolean);
}
