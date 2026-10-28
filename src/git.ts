import { execFileSync } from 'node:child_process';

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
export function readKnownCommits(root: string, shas: string[]): Set<string> {
  const unique = [...new Set(shas)];
  if (unique.length === 0) return new Set();
  try {
    const input = unique.map((sha) => `${sha}^{commit}\n`).join('');
    const output = execFileSync('git', ['cat-file', '--batch-check'], { cwd: root, encoding: 'utf8', input });
    // One answer per line, in order: `<oid> commit <size>` when found, else `… missing` or `… ambiguous`.
    const answers = output.split('\n');
    return new Set(unique.filter((_, at) => /^[0-9a-f]+ commit /.test(answers[at] ?? '')));
  } catch {
    return new Set();
  }
}

// A `docs:` commit records the plan, and tests usually follow the change they cover: the work is the change itself.
const PLAN_COMMIT = /^docs(\([^)]*\))?!?:/;
const CHANGE_COMMIT = /^(feat|fix|refactor|perf|build)(\([^)]*\))?!?:/;

/**
 * The commits only HEAD's branch has, newest first: what the task's own branch added since it left the others. All of
 * HEAD's when every commit is on another branch too, as on the base branch itself.
 */
function readOwnCommits(root: string): string {
  const current = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const others = listBranches(root).filter((branch) => branch !== current);
  const own = git(root, ['log', '-n', '200', '--format=%h%x09%s', 'HEAD', '--not', ...others, '--']) ?? '';
  return own === '' ? (git(root, ['log', '-n', '200', '--format=%h%x09%s']) ?? '') : own;
}

/**
 * The short sha that closes a task: the newest conventional change (`feat`, `fix`, `refactor`, `perf`, `build`) on
 * the task's own branch, else its newest commit that is not a `docs:` one; null when there is none.
 */
export function readLastWorkCommit(root: string): string | null {
  const commits = readOwnCommits(root)
    .split('\n')
    .map((line) => line.split('\t'));
  const change = commits.find(([sha, subject = '']) => sha && CHANGE_COMMIT.test(subject));
  const work = change ?? commits.find(([sha, subject = '']) => sha && !PLAN_COMMIT.test(subject));
  return work?.[0] ?? null;
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

/** The local branches; none outside a repo. */
export function listBranches(root: string): string[] {
  const refs = git(root, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']) ?? '';
  return refs.split('\n').filter(Boolean);
}

/** What `path`, from `root`, holds in the index: what the next commit records; null when the index has no such file. */
export function readStaged(root: string, path: string): string | null {
  return git(root, ['show', `:./${path}`]);
}

/** Where `root` sits from the top of its repo, and the folder git runs hooks from; null outside a repo. */
export function readRepoPaths(root: string): { prefix: string; hooks: string } | null {
  const prefix = git(root, ['rev-parse', '--show-prefix']);
  const hooks = git(root, ['rev-parse', '--path-format=absolute', '--git-path', 'hooks']);
  return prefix === null || hooks === null ? null : { prefix, hooks };
}
