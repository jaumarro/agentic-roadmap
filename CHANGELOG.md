# Changelog

Each version's changes, newest first. The version follows [semver](https://semver.org): while it is 0.x, a minor
version may break the YAML, a command or its `--json` output, and a patch never does.

## 0.1.0

The first release.

- The plan as YAML in `roadmap/`, one file per block, with `init` to start one.
- `next` and `free` hand out the task the most work waits on, after your `focus`; a branch named after a task marks it
  started.
- `close` writes a task's commit, picked from the commits its branch made since its base.
- `add` gives each task an id no branch, worktree or fetched clone holds, and `add --from` adds a plan's whole
  `<!-- roadmap -->` table, or none of it.
- `check` and `health` keep the plan sound and measure its shape; `list --by wave` and `graph` show what can run in
  parallel.
- `install-skill`, `install-hook` and `install-merge-driver` set a repo up for agents and parallel sessions.
