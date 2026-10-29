# Changelog

Each version's changes, newest first. The version follows [semver](https://semver.org): while it is 0.x, a minor
version may break the YAML, a command or its `--json` output, and a patch never does.

## Unreleased

- `import { readRoadmap, readStates, listFree, ... } from 'agentic-roadmap'` reads a plan from code, with its types:
  each function gives what a command's `--json` gives. The library only reads, and runs no git: writing stays the
  CLI's. `checkRoadmap` gives each problem as data, as `{ kind: 'cycle', tasks }`, and `describeProblem` in words.
- `check --json` gives `{ sound, problems, warnings }`, each problem as data.
- Breaking: one name per concept in the JSON. In `next` and `free`, `branch` is now `branchPrefix`, as it is only the
  start of a branch's name. In `show`, `startedOn` is now `branches`, as in `next`'s `inProgress`, and `block` is the
  block's code, with its name in `blockName`.
- Breaking: `health --against --json` names the figures in `worse` by their keys, as `criticalPath`, not by their
  labels.
- Breaking: a command refuses an option it does not take. `check --json` used to print prose, and `status --block`
  to list every block.
- Only the package's root is importable: a path into `dist/`, as `agentic-roadmap/dist/source.js`, no longer resolves.

## 0.2.1

Security fixes for a plan written by someone else, as in a pull request. A plan that relied on either refusal below was
already unsafe to run, so they ship as a patch.

- `markdown:` in `roadmap.yaml` must be a path inside the repo: one with `..` or an absolute one is refused. Before,
  `close`, `add`, `focus` and `render` wrote the Markdown wherever it pointed.
- The Markdown and `install-skill` no longer write through a symlink, or through a folder that links out of the repo.
- Text in the plan may not hold control characters other than tabs and line breaks, so a title cannot send escape
  sequences to the terminal.
- A YAML file that expands aliases without end is refused as a plan error, naming the file, instead of crashing.

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
