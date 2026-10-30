---
name: roadmap-workflow
description: Work from a repo's agentic-roadmap plan, the roadmap/ folder of YAML blocks. Use it to find what to do next, to start and close a task, to ask why a task is not ready, and to write or change the plan so its health holds. Use it whenever a repo has roadmap/roadmap.yaml, when you plan work in such a repo (plan mode included), or when the user asks what to work on next.
---

# Working from the roadmap

The plan lives in `roadmap/`: `roadmap.yaml` lists the blocks in order, and each block is `roadmap/<CODE>.yaml` with its tasks. The `agentic-roadmap` command reads and writes it; when it is a dev dependency of the repo, run it as `pnpm exec agentic-roadmap` (or `npx agentic-roadmap`). It finds `roadmap/` from any folder below it. `agentic-roadmap help` lists every command.

Ids and commits are the tool's to write. Never type an `id:` or a `commit:` into the YAML: `add` picks the next free id, looking at every local branch too, and `close` writes the commit, quoted, after checking it exists.

## Taking the next task

1. Run `agentic-roadmap next`. Take the task it names as **Next**. It never names one a branch already started; those show under «In progress».
2. Read the task before you start: `agentic-roadmap show <ID>` gives its block, its «Done when», what it requires and what it unblocks. «Done when» is what you must make true, and how it is checked.
3. Branch from the base branch, named after the task: its id in lower case with a hyphen, then a short slug, as `abc-3/close-command`. That branch is what marks the task started for everyone else. A task marked ⚠︎ (`risky: true`) touches code execution, credentials, persistence, pushes or outside text: it gets a full review before it is closed.
4. Do the work with conventional commits: the change as `feat:`, `fix:`, `refactor:` or `perf:`, its tests after it as `test:`.
5. Close it: `agentic-roadmap close <ID>`. From the commits since the branch left the base branch (`base:` in `roadmap.yaml`, else the remote's default branch, else `main` or `master`), stopping at the newest `docs: close` of another task, it writes the newest `feat`, `fix`, `refactor` or `perf` one as the task's commit, else the newest `build` one, else the newest that is not `docs:`, else, on the task's branch, the newest `docs:` one that is no close. A task with `lines: doc` takes that `docs:` one first. So commit tooling, as an upgrade of this package, as `build:` or `chore:`, never as the task's `feat:`. A branch with no commit of its own is refused rather than given another task's: commit the work first, or pass `--commit <sha>`. It refuses a task whose requirements are not all done.
6. Commit what `close` wrote as its own commit, `docs: close <ID>`, on the same branch: that subject is where the next task's commits start, so keep it as written. Then merge the branch into the base branch the way the repo does (a pull request, or a fast-forward merge where there is none) and delete it, so it no longer marks the task started.

A repo that squashes branches on merge drops the commit `close` cited, and `check` then fails on the base. There, merge the task's branch first, then close it on the base: `agentic-roadmap close <ID> --commit <the squashed commit>`, committed as `docs: close <ID>`. A rebase that rewrites a task's commit after it was closed, as folding a fixup in, leaves the old sha behind: record the new one with `agentic-roadmap close <ID> --commit <new sha>`, which also works on a done task, and fold that change into the `docs: close <ID>` commit.

Stacking task branches, each on the one before, as a prototype that merges nothing yet does, works on one condition: close each task on its branch (step 6 included) before you branch the next from it. The next branch then sees it done and can close its own task, and `close` takes only the commits that branch added. On the base branch, the stack shows as its first task in progress until the stack merges.

## Several sessions at once

`agentic-roadmap free N` hands out the first N tasks free to take, one per session, each with the branch to start it on. Each session takes one and branches at once, so the next `next` or `free` leaves it out. The order is the same as `next`'s: what `focus` names, then the task the most work waits on, a risky one last. `agentic-roadmap focus <CODE|ID>...` puts blocks and tasks first, and `focus --clear` takes the plan as it reads again; commit it as `docs:`.

When `roadmap.yaml` has `chapters`, a block in none of them is a parallel track: `next` and `free` leave its tasks out unless `focus` names them. To work a track, focus it in that session, or take its task by id after `why <ID>` shows it ready.

## Asking the plan

- `agentic-roadmap why <ID>`: what a task waits on, down to the tasks that can be taken now. Use it before choosing something that is not Next.
- `agentic-roadmap list --state ready` (or `done`, `started`, `waiting`), and `--block <CODE>`: the plan, or a slice of it.
- `agentic-roadmap list --by wave`: the tasks left in waves; a wave can run at once, in as many sessions as it has tasks, after the waves before it. «(critical)» marks the tasks the plan's length depends on. Use it to answer what can run in parallel and what comes after.
- `agentic-roadmap graph`: the tasks left and their requirements as a Mermaid flowchart, to show the user the dependencies; `--json` for nodes and edges, `--all` with the done tasks too.
- `agentic-roadmap status`: how much of each block is done.
- `next`, `free`, `show`, `why`, `list`, `status` and `health` take `--json`: read that instead of parsing the text.

## Proposing a plan

When you plan work in a repo with `roadmap/`, end the plan with its tasks as a table, under a `<!-- roadmap -->` line, so the user approves the tasks as they will enter the roadmap:

```markdown
<!-- roadmap -->

| Key      | Block | Task                       | Requires     | Done when                                     | Lines |
| -------- | ----- | -------------------------- | ------------ | --------------------------------------------- | ----- |
| parse    | ANL   | Parse the log              | —            | parse on a sample log gives one row per entry | 40    |
| report ⚠︎ | ANL   | Report from the parsed log | parse, COR.3 | report prints totals per block                | 30    |
```

- Key: a short name for the row, unique in the table; `add` gives the real id. ⚠︎ after it marks a risky task.
- Block: a block the roadmap has. For a new one, create it first (below), and say so in the plan.
- Requires: keys of other rows, or ids already in the plan, comma-separated; `—` for none. Only what the task uses.
- Done when and Lines follow the rules below: checkable, and at most about 150 lines of logic.

Once the user approves the plan, run `agentic-roadmap add --from <the plan's file>`. It adds every row with its id, swaps the keys for those ids, and writes them all or, when the plan would break, none. Read its health line, then commit the plan as `docs:`.

## Writing or changing the plan

1. Add each task with `agentic-roadmap add <BLOCK> "<title>" --done-when "<text>" --lines <N|doc> [--requires ID,ID]`. `--done-when` is checkable by a command, a test or a screen; `--lines` is your estimate of the logic it adds, tests aside, or `doc` for a document. `add` checks the plan with the task before writing it, and ends with what it did to the plan's health: read that line, and act on any «New problem».
2. Keep each task a vertical slice that can be used and checked on its own, at most about 150 lines of logic: split a bigger one. Add the tasks in the order they are built, so each one's requirements exist when it is added. Require only the tasks whose result a task uses, not every task before it: each needless requirement is a session left waiting.
3. Start a new block with `agentic-roadmap add-block <CODE> "<name>"`, a three-letter code; it goes after the other blocks in `roadmap.yaml`, so move it up if a block listed before it requires it. In a plan with `chapters`, it starts as a parallel track: add it to a chapter unless that is what you want. Then `add` its tasks. To change a task already there (its title, «Done when», size, requirements, or `risky: true`), edit its block's file; never change its id.
4. Run `agentic-roadmap check`. It must say «The plan is sound»: it refuses unknown requirements, repeated ids or blocks, cycles, an id outside its block, and commits the repo does not have.
5. Run `agentic-roadmap health` and fix the problems it ranks, worst first: tasks over the size cap, a plan that is a queue, a waiting task most of the work depends on, requirements another one already implies, and requirements on a block listed later. Rerun it until it says «No problems», or say which problem you leave and why.
6. Commit the plan as `docs:`, on its own.

To bring in a plan kept elsewhere (a Markdown file, a checklist, issues, notes), read it and build it with the steps above: blocks first, then each task with `add`, in the order they are built. Work already done goes in with `add`, then `close <ID> --commit <SHA>` when you can find the commit that did it; leave it out when you cannot.

A plan of more than about 50 tasks is too slow to bring in one `add` at a time. Write a one-off script instead, kept outside the repo and thrown away after, that writes `roadmap/roadmap.yaml` and one `roadmap/<CODE>.yaml` per block straight from the old plan. This is the one time ids and commits are written without the tool: keep the plan's own ids, which branches, commits and people already name, and its commits as quoted shas. Then `agentic-roadmap check` must say «The plan is sound», which also proves every cited commit exists. Run `agentic-roadmap health` and compare `next` and `free` with what the old plan said, and commit `roadmap/` as one `docs:` commit.

When the repo keeps the plan as Markdown (the file `markdown:` names in `roadmap.yaml`), never edit it: `close`, `add` and `focus` rewrite it, `agentic-roadmap render` does after a hand edit to the YAML, and `check` fails when it no longer matches. Commit it with the YAML.

A new roadmap starts with `agentic-roadmap init`. Commit `roadmap/` on the base branch before any task: a task's branch can only mark it started once the plan is there.

Two installs make parallel work safe, each once per clone. Both change the repo's git setup, so ask the user before running them:

- `agentic-roadmap install-merge-driver`: git merges `roadmap/*.yaml` task by task, so two branches that add or close tasks in one block, or that each start a block, merge without a conflict. It writes `.gitattributes`, which is committed, and the driver in `.git/config`, which every clone sets again.
- `agentic-roadmap install-hook`: a pre-commit hook runs `check --staged` when a commit touches the plan, so a broken plan never lands. When the repo already has a pre-commit hook (husky, lefthook), it leaves it alone and prints the line to add to it.

Check whether they are there with `git config merge.agentic-roadmap.driver` and a look at `.git/hooks/pre-commit`.
