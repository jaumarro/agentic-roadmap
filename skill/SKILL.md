---
name: roadmap-workflow
description: Work from a repo's agentic-roadmap plan, the roadmap/ folder of YAML blocks. Use it to find what to do next, to start and close a task, to ask why a task is not ready, and to write or change the plan so its health holds. Use it whenever a repo has roadmap/roadmap.yaml, or the user asks what to work on next.
---

# Working from the roadmap

The plan lives in `roadmap/`: `roadmap.yaml` lists the blocks in order, and each block is `roadmap/<CODE>.yaml` with its tasks. The `agentic-roadmap` command reads and writes it; before it is installed, run it as `node <path to agentic-roadmap>/src/cli.ts`. It finds `roadmap/` from any folder below it. `agentic-roadmap help` lists every command.

Ids and commits are the tool's to write. Never type an `id:` or a `commit:` into the YAML: `add` picks the next free id, looking at every local branch too, and `close` writes the commit, quoted, after checking it exists.

## Taking the next task

1. Run `agentic-roadmap next`. Take the task it names as **Next**. It never names one a branch already started; those show under «In progress».
2. Read the task before you start: `agentic-roadmap show <ID>` gives its block, its «Done when», what it requires and what it unblocks. «Done when» is what you must make true, and how it is checked.
3. Branch from the base branch, named after the task: its id in lower case with a hyphen, then a short slug, as `abc-3/close-command`. That branch is what marks the task started for everyone else. A task marked ⚠︎ (`risky: true`) touches code execution, credentials, persistence, pushes or outside text: it gets a full review before it is closed.
4. Do the work with conventional commits: the change as `feat:`, `fix:`, `refactor:` or `perf:`, its tests after it as `test:`.
5. Close it: `agentic-roadmap close <ID>`. It writes the newest `feat`, `fix`, `refactor` or `perf` commit as the task's commit. A task that is only a document has no such commit: pass the one that did it, as `close <ID> --commit <sha>`. It refuses a task whose requirements are not all done.
6. Commit what `close` wrote as its own commit, `docs: close <ID>`, on the same branch. Then merge the branch into the base branch the way the repo does (a pull request, or a fast-forward merge where there is none) and delete it, so it no longer marks the task started.

## Several sessions at once

`agentic-roadmap free N` hands out the first N tasks free to take, one per session, each with the branch to start it on. Each session takes one and branches at once, so the next `next` or `free` leaves it out. The order is the same as `next`'s: what `focus` names, then the task the most work waits on, a risky one last. `agentic-roadmap focus <CODE|ID>...` puts blocks and tasks first, and `focus --clear` takes the plan as it reads again; commit it as `docs:`.

## Asking the plan

- `agentic-roadmap why <ID>`: what a task waits on, down to the tasks that can be taken now. Use it before choosing something that is not Next.
- `agentic-roadmap list --state ready` (or `done`, `started`, `waiting`), and `--block <CODE>`: the plan, or a slice of it.
- `agentic-roadmap list --by wave`: the tasks left in waves; a wave can run at once, in as many sessions as it has tasks, after the waves before it. «(critical)» marks the tasks the plan's length depends on. Use it to answer what can run in parallel and what comes after.
- `agentic-roadmap status`: how much of each block is done.
- `next`, `free`, `show`, `why`, `list`, `status` and `health` take `--json`: read that instead of parsing the text.

## Writing or changing the plan

1. Add each task with `agentic-roadmap add <BLOCK> "<title>" --done-when "<text>" --lines <N|doc> [--requires ID,ID]`. `--done-when` is checkable by a command, a test or a screen; `--lines` is your estimate of the logic it adds, tests aside, or `doc` for a document. `add` checks the plan with the task before writing it, and ends with what it did to the plan's health: read that line, and act on any «New problem».
2. Keep each task a vertical slice that can be used and checked on its own, at most about 150 lines of logic: split a bigger one. Add the tasks in the order they are built, so each one's requirements exist when it is added. Require only the tasks whose result a task uses, not every task before it: each needless requirement is a session left waiting.
3. A new block is a three-letter code, a file `roadmap/<CODE>.yaml` with its `name` and `tasks: []`, and its code in `roadmap.yaml`'s `blocks`, after the blocks it requires; then `add` its tasks. To change a task already there (its title, «Done when», size, requirements, or `risky: true`), edit its block's file; never change its id.
4. Run `agentic-roadmap check`. It must say «The plan is sound»: it refuses unknown requirements, repeated ids or blocks, cycles, an id outside its block, and commits the repo does not have.
5. Run `agentic-roadmap health` and fix the problems it ranks, worst first: tasks over the size cap, a plan that is a queue, a waiting task most of the work depends on, requirements another one already implies, and requirements on a block listed later. Rerun it until it says «No problems», or say which problem you leave and why.
6. Commit the plan as `docs:`, on its own.

To bring in a plan kept elsewhere (a Markdown file, a checklist, issues, notes), read it and build it with the steps above: blocks first, then each task with `add`, in the order they are built. Work already done goes in with `add`, then `close <ID> --commit <SHA>` when you can find the commit that did it; leave it out when you cannot.

When the repo has the plan as Markdown (`docs/roadmap.md` unless `roadmap.yaml` says `markdown:`), never edit it: `close`, `add` and `focus` rewrite it, `agentic-roadmap render` does after a hand edit to the YAML, and `check` fails when it no longer matches. Commit it with the YAML.

A new roadmap starts with `agentic-roadmap init`. Commit `roadmap/` on the base branch before any task: a task's branch can only mark it started once the plan is there.
