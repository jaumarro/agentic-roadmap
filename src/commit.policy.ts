/** A commit as `git log` gives it: its short sha and its subject. */
export type Commit = { sha: string; subject: string };

// A `docs:` commit records the plan, and tests usually follow the change they cover: the work is the change itself.
const PLAN_COMMIT = /^docs(\([^)]*\))?!?:/;
const LOGIC_COMMIT = /^(feat|fix|refactor|perf)(\([^)]*\))?!?:/;
const BUILD_COMMIT = /^build(\([^)]*\))?!?:/;

// What close asks to commit once it wrote a task's commit: where that task's work ends and the next one's starts.
const CLOSE_COMMIT = /^docs(\([^)]*\))?!?: close ([A-Z][A-Z0-9]*\.[0-9]+)\b/;

/** Task `id`'s own commits out of `commits`, newest first: those before the newest close of another task. */
export function cutAtOtherClose(commits: Commit[], id: string): Commit[] {
  const end = commits.findIndex(({ subject }) => {
    const closed = CLOSE_COMMIT.exec(subject)?.[2];
    return closed !== undefined && closed !== id;
  });
  return end === -1 ? commits : commits.slice(0, end);
}

/**
 * The commit that closes a task, out of its own commits, newest first. Its work is the newest `feat`, `fix`, `refactor`
 * or `perf` commit, else the newest `build` one, else the newest that is not `docs:`; on a task's own branch, the newest
 * `docs:` one that is no close comes after those. A document task takes that `docs:` one first. Null when it made none,
 * so another task's work is never taken.
 */
export function pickWorkCommit(
  commits: Commit[],
  { isDocument, ownBranch }: { isDocument: boolean; ownBranch: boolean },
): string | null {
  const newest = (fits: (subject: string) => boolean) => commits.find(({ subject }) => fits(subject));
  // On the base itself the newest docs commit is likely the plan's, so only a task's own branch takes one.
  const written = ownBranch ? newest((subject) => PLAN_COMMIT.test(subject) && !CLOSE_COMMIT.test(subject)) : undefined;
  const logic = newest((subject) => LOGIC_COMMIT.test(subject));
  // A build commit is a task's work only when no logic commit is: else it is tooling made along the way.
  const work = logic ?? newest((subject) => BUILD_COMMIT.test(subject)) ?? newest((s) => !PLAN_COMMIT.test(s));
  const found = isDocument ? (written ?? work) : (work ?? written);
  return found?.sha ?? null;
}
