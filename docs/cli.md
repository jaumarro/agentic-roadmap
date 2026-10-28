# CLI reference

For scripts and agents. `roadmap <command> --help` gives each command's flags; this page says what comes back.

## Output and exit codes

- The answer goes to stdout; every error goes to stderr, so `--json` output on stdout is always JSON or nothing.
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
    "branch": "log-2/"
  },
  "ready": [],
  "inProgress": []
}
```

On a plan `check` would refuse, `next` and `free` refuse too, on stderr. `free N --json` is an array of up to N tasks
shaped as `next`, one per session.

`show <ID> --json`: one task, where it stands, and its neighbours.

```json
{
  "id": "LOG.2",
  "title": "Remember the session",
  "state": "ready",
  "block": { "code": "LOG", "name": "Login" },
  "doneWhen": "a reload keeps the user signed in",
  "lines": 40,
  "risky": false,
  "commit": null,
  "startedOn": [],
  "requires": [{ "id": "LOG.1", "title": "Sign in with email", "state": "done" }],
  "unblocks": []
}
```

`state` is one of `done`, `started` (a branch is named after it), `ready` (all it requires is done) or `waiting`.
`lines` is a number or `"doc"`.

`list --json`, and `list --by wave --json`: one row per task.

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

`why <ID> --json`: `{ "id", "state", "waitsOn": [...] }`, down to the tasks that can be taken now.

`status --json`: `[{ "code", "name", "done", "total" }]`, one per block.

`health --json`: the figures `health` prints, and `problems`, the worst first, each with what to do.

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

Fields are only added, never renamed or removed, within a major version.

## What each command needs from git

| Command                                | Without a git repo            | With one                                                          |
| -------------------------------------- | ----------------------------- | ----------------------------------------------------------------- |
| `next`, `free`, `list`, `show`, `why`  | works; no task shows started  | a local or fetched branch named after a task marks it started     |
| `add`                                  | works                         | ids also skip those on every branch and every worktree            |
| `close`                                | refuses: commits are git's    | without `--commit`, takes the task's newest work commit (below)   |
| `check`                                | every cited commit is missing | also checks every cited commit exists; `--staged` reads the index |
| `install-hook`, `install-merge-driver` | refuses                       | writes the hook, or the driver into `.git/config`                 |

`close` without `--commit` looks at the commits since the branch left its base (`base:` in `roadmap.yaml`, else the
remote's default branch, else `main` or `master`), stopping at the newest `docs: close <ID>` of another task. Of those
it takes the newest `feat`, `fix`, `refactor`, `perf` or `build` commit, else the newest that is not `docs:`, else, on a
task's own branch, the newest `docs:` one. With none it refuses; pass `--commit <sha|branch|tag|HEAD>` to say which.
