# CLI reference

Commands below use the installed `roadmap` binary: prefix them with `pnpm exec`, or use `npx agentic-roadmap`.
`roadmap help` lists commands; `roadmap <command> --help` or `roadmap help <command>` shows one command.

## Location and common options

Commands find the nearest `roadmap/roadmap.yaml` above the current folder. `--root <folder>` overrides that search;
otherwise `AGENTIC_ROADMAP_ROOT` can supply the folder holding `roadmap/`. `init` creates the plan in the current
folder or the folder named by `--root`. `--version` prints the package version.

Unsupported flags and extra positional arguments are errors. Only the query commands listed with `--json` below
accept it. Writes produce human-readable output.

## Commands

### Create and change a plan

| Command                                                                  | Behavior                                                                         |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `init`                                                                   | Creates config and a tutorial block; refuses an existing roadmap here or above   |
| `add-block <CODE> <NAME>`                                                | Creates an empty block and appends its code to the config                        |
| `add <BLOCK> <TITLE> --done-when TEXT --lines N\|doc [--requires ID,ID]` | Allocates an ID and validates the new task before writing                        |
| `add --from FILE\|-`                                                     | Imports the table under `<!-- roadmap -->`; `-` reads stdin                      |
| `focus <CODE\|ID>...`                                                    | Saves priority entries in order; shared through `roadmap.yaml`                   |
| `focus --clear`                                                          | Clears the saved preference                                                      |
| `close <ID> [--commit REVISION]`                                         | Records a work commit once requirements are done                                 |
| `render`                                                                 | Writes the Markdown copy; uses `docs/roadmap.md` if no `markdown:` is configured |

Names and titles containing spaces need shell quotes. `--lines` is a positive whole number estimating logic, excluding
tests, or `doc`. `add` has no `--risky` flag: use the table's ⚠︎ marker or edit the task's YAML. See the
[table format](workflow.md#plan-new-work) and [YAML fields](format.md).

`--from` paths are relative to the current working directory, even with `--root`. Blocks must already exist. Import
validates all rows together; failed later block writes roll back earlier ones. When a write reports that the YAML
changed but Markdown could not be updated, repair the target and run `render` rather than repeating the command.

### Query a plan

| Command                                                           | Options and defaults                                                   |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `next [--json]`                                                   | Next available task, remaining candidates and known tasks in progress  |
| `free [N] [--json]`                                               | Up to N available tasks; default 3; N must be positive                 |
| `show <ID> [--json]`                                              | Task details, state, requirements and direct dependents                |
| `why <ID> [--json]`                                               | Unfinished requirements, expanded recursively                          |
| `list [--block CODE] [--state STATE] [--by block\|wave] [--json]` | All tasks by default; block order unless `--by wave`                   |
| `graph [--mermaid\|--json] [--all]`                               | Mermaid by default; pending tasks unless `--all`                       |
| `status [--json]`                                                 | Completed and total task counts per block                              |
| `check [--staged] [--json]`                                       | Validates dependencies, IDs, chapters, commits and configured Markdown |
| `health [--json] [--strict] [--against REF]`                      | Measures the plan; optionally compares with a Git revision             |

States are `done`, `started`, `ready` or `waiting`. `list --by wave` omits done tasks and orders pending rows by track,
wave and focus. Graph edges go from prerequisites to dependents. `--mermaid` and `--json` cannot be combined.

`next` and `free` are queries, not reservations. They omit tasks with known matching branches and unfocused parallel
tracks. Read [collaboration](workflow.md#setup-and-collaboration) before using them across sessions or clones.

### Install integrations

| Command                | Writes                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `install-skill`        | `.claude/skills/roadmap-workflow/SKILL.md`, replacing a previous copy                    |
| `install-hook`         | A pre-commit hook that checks staged plan changes; leaves unrelated existing hooks alone |
| `install-merge-driver` | A `.gitattributes` rule and a driver registered in local Git config                      |

Hook and driver installation is per clone. Commit `.gitattributes`; rerun `install-skill` after upgrades. See
[setup details](workflow.md#optional-git-installs). `merge-block <BASE> <OURS> <THEIRS>` is the internal driver command
Git invokes; on conflict it writes conflict markers to OURS and exits 1.

## Output and exit codes

- Answers go to stdout; invocation and execution errors go to stderr. With `--json`, stdout is JSON or empty.
- Validation findings are results: `check --json` prints them to stdout even when it exits 1. The same applies to
  health findings with `health --strict --json`. Invalid files or arguments can fail before any JSON is produced.
- Exit 0: the command did what it was asked.
- Exit 1: it refused or failed, with the reason on stderr; or `check` found the plan unsound; or `health --strict`
  found a problem (with `--against`, a figure that got worse); or `merge-block` met a task both sides changed.

## JSON

`next --json`: the task to take, the others ready in the same order, and those a branch started.

```json
{
  "next": {
    "id": "LOG.2",
    "block": "LOG",
    "title": "Remember the session",
    "doneWhen": "a reload keeps the user signed in",
    "risky": false,
    "branchPrefix": "log-2/"
  },
  "ready": [],
  "inProgress": []
}
```

On a structurally invalid plan (such as a cycle or unknown requirement), `next` and `free` refuse on stderr.
Unlike `check`, they do not verify cited commits or generated Markdown. `free N --json` is an array of up to N tasks
shaped as the `next` task object, one per session. When no task is available, `next` is `null` and `free` is `[]`.

`show <ID> --json`: one task, where it stands, and its neighbours.

```json
{
  "id": "LOG.2",
  "title": "Remember the session",
  "state": "ready",
  "block": "LOG",
  "blockName": "Login",
  "doneWhen": "a reload keeps the user signed in",
  "lines": 40,
  "risky": false,
  "commit": null,
  "branches": [],
  "requires": [{ "id": "LOG.1", "title": "Sign in with email", "state": "done" }],
  "unblocks": []
}
```

`state` is one of `done`, `started` (a branch is named after it), `ready` (all it requires is done) or `waiting`.
`lines` is a number or `"doc"`.

`list --json` is an array of rows. `list --by wave --json` returns the pending rows in wave display order. Each row is:

```json
{
  "id": "LOG.2",
  "block": "LOG",
  "state": "ready",
  "title": "Remember the session",
  "risky": false,
  "wave": 1,
  "critical": true,
  "track": false
}
```

`wave` is `null` for a done task. `critical` marks the tasks the plan's length depends on; `track`, a task on a parallel
track (a block in no chapter, once there are chapters).

`graph --json`: the same rows as `nodes`, and each requirement as an edge from the task required to the one requiring
it: `{ "nodes": [...], "edges": [{ "from": "LOG.1", "to": "LOG.2" }] }`. Without `--all`, done tasks are left out.

`why <ID> --json`: `{ "id", "state", "waitsOn": [...] }`. Each wait has `id`, `title`, `state`, `seenAbove` and
its own `waitsOn` array. A task already expanded on another path has `seenAbove: true` and an empty `waitsOn`.

`status --json`: `[{ "code", "name", "done", "total" }]`, one per block.

`check --json`: whether the plan is sound, each problem as data, and the warnings, which do not fail it. Each problem
has a `kind`, as `unknown-requirement`, `cycle`, `missing-commit` or `stale-markdown`, and the ids it is about. It
exits 1 when `sound` is false.

```json
{
  "sound": false,
  "problems": [{ "kind": "unknown-requirement", "task": "LOG.2", "requires": "LOG.9" }],
  "warnings": []
}
```

`health --json`: the figures `health` prints, and every problem as data, the worst first. Each has a `kind`:
`oversized` (`task`, `lines`), `queue` (`parallelism`), `bottleneck` (`task`, `share`), `redundant` and `backward`
(`requirements`, the pairs as in the figures of the same name). The text shows the first five, each with what to do.

```json
{
  "tasksLeft": 1,
  "workLeft": 40,
  "criticalPath": { "lines": 40, "tasks": ["LOG.2"] },
  "parallelism": 1,
  "width": 1,
  "readyNow": 1,
  "bottlenecks": [],
  "redundant": [],
  "crossBlockShare": 0,
  "backward": [],
  "oversized": [],
  "problems": []
}
```

`health --against <ref> --json`: `{ "against", "before", "after", "worse" }`, where `before` and `after` are shaped as
`health --json`, and `worse` names the figures that got worse by their keys: `criticalPath`, `parallelism`, `width` or
`problems`.

A command refuses an option it does not take, so `--json` on a command without JSON output is an error, not prose.

Within a minor release line while 0.x (for example, 0.3.x), JSON fields are only added, never renamed or removed.
Breaking YAML, command or JSON changes are recorded as “Breaking:” in the changelog and require a minor release
while 0.x, or a major release from 1.0. Consumers should allow unknown fields.

## What each command needs from git

| Command                                | Without a git repo            | With one                                                          |
| -------------------------------------- | ----------------------------- | ----------------------------------------------------------------- |
| `next`, `free`, `list`, `show`, `why`  | works; no task shows started  | a local or fetched branch named after a task marks it started     |
| `add`                                  | works                         | ids also skip those on every branch and every worktree            |
| `close`                                | refuses: commits are git's    | without `--commit`, takes the task's newest work commit (below)   |
| `check`                                | every cited commit is missing | also checks every cited commit exists; `--staged` reads the index |
| `install-hook`, `install-merge-driver` | refuses                       | writes the hook, or the driver into `.git/config`                 |

## Close

`close` without `--commit` looks at the commits since the branch left its base (`base:` in `roadmap.yaml`, else the
remote's default branch, else `main` or `master`), stopping at the newest `docs: close <ID>` of another task. Of those
it takes the newest `feat`, `fix`, `refactor` or `perf` commit, else the newest `build` one, else the newest that is
not `docs:`, else, on a branch other than the base, the newest `docs:` one that is no close. A task with `lines: doc`
takes that `docs:` one first. With none it refuses; pass `--commit <sha|branch|tag|HEAD>` to choose explicitly.

Closing on the task's branch needs the base to keep that commit: a merge commit or a fast-forward. A squash merge drops
it, so in a repo that squashes, close on the base after the merge, with `--commit` naming the squashed commit.
Commit existence does not prove reachability from the base: a replaced branch commit can still exist locally. A done
task refuses a second `close`, unless `--commit` says which commit it is now, as after a rebase rewrote it. In a
shallow clone, as CI checks out by default, `check` cannot see old commits: it says so as a warning and does not fail.

The default search examines up to 200 commits. `--commit` accepts a SHA, branch, tag or `HEAD` and resolves it to a
commit at the time of closing. `close` does not verify the task's acceptance criterion; do that before running it.

## Health metrics

Health is a structural estimate, not a prediction of elapsed time. Numeric `lines` are task weights; a `doc` task
weighs 20. Completed tasks are excluded from remaining-work figures. Started tasks still count as pending.

| Field             | Meaning                                                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tasksLeft`       | Number of tasks without a commit                                                                                                                      |
| `workLeft`        | Sum of pending task weights                                                                                                                           |
| `criticalPath`    | One heaviest dependency chain among pending tasks, with its total weight and IDs                                                                      |
| `parallelism`     | `workLeft / criticalPath.lines`, or 0 when no work remains                                                                                            |
| `width`           | Largest set of pending tasks with no dependency path between any pair                                                                                 |
| `readyNow`        | Pending tasks whose requirements are done, including started tasks and unfocused tracks                                                               |
| `bottlenecks`     | Up to three tasks blocking the most pending weight; `blocks` is that weight, `share` its fraction of other pending work, `ready` dependency readiness |
| `redundant`       | Requirements already implied through another direct requirement, as `{ id, requires, through }`                                                       |
| `crossBlockShare` | Fraction of all requirements crossing block boundaries, including completed tasks                                                                     |
| `backward`        | Requirements on later blocks in config order, as `{ id, requires }`, including completed tasks                                                        |
| `oversized`       | Pending numeric tasks over 150 lines, as `{ id, lines }`                                                                                              |
| `problems`        | Ranked findings: oversized tasks, queue, waiting bottlenecks, redundant and backward requirements                                                     |

A queue finding requires more than two pending tasks and parallelism below 1.5. Bottleneck findings use the returned
top three bottlenecks whose share is at least 0.4 and whose requirements are not yet done. `readyNow` and `width`
describe dependency structure; neither is a count of unclaimed tasks available from `free`.

`health --strict` exits 1 for any problem. With `--against REF`, it instead exits 1 when a compared figure worsens:
critical-path weight or problem count increases, or parallelism or width decreases. Comparison uses figures rounded
to one decimal place. REF is a committed Git revision; the current side is read from the working tree. The
`warnings:` configuration affects `check` warnings, not these health thresholds.
