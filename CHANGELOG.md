# Changelog

Each version's changes, newest first. The version follows [semver](https://semver.org): while it is 0.x, a minor
version may break the YAML, a command or its `--json` output, and a patch never does.

## Unreleased

- `import { readRoadmap, listRows, ... } from 'agentic-roadmap'` reads a plan from code, with its types. The library
  only reads; writing stays the CLI's.

## 0.2.0

- `close <ID> --commit <SHA>` records a done task's commit again, as after a rebase rewrote it. Without `--commit`, a
  done task is still refused, and the error says to pass it.
- A title or option value that starts with a dash and holds a space, as `add EXP "--where compares"`, is read as text,
  not as an unknown option.

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
