# Workflow

Install and create a plan with the [README quickstart](../README.md#get-started). This guide covers the decisions you
make while working from that plan. Commands below use the installed `roadmap` binary; prefix them with `pnpm exec`
or use `npx agentic-roadmap`.

## Choose and start a task

1. Run `roadmap next`, then `roadmap show <ID>` to read its acceptance criterion and dependencies.
2. Create a branch from the repo's base branch, such as `git switch -c log-1/sign-in` for `LOG.1`.
3. Implement the task, run the repo's checks and commit the work.

A branch name marks a task started when a slash-separated part equals the task's lower-case ID with its dot replaced
by a hyphen, or starts with that slug and another hyphen. Both `log-1/sign-in` and `feature/log-1-sign-in` match `LOG.1`.
A matching branch can mark a task started even if its requirements are still waiting; check readiness before branching.

The plan must be committed on the base branch so new task branches inherit it. Configure a different base with
`base:` in `roadmap/roadmap.yaml`; otherwise the tool tries the remote's default branch, then `main` or `master`.

## Finish a task

Make the task's `doneWhen` true and verify it before closing. `close` checks that dependencies are done and that the
commit exists; it does not run tests or verify the acceptance criterion.

For merges that preserve commits, close on the task branch:

```bash
roadmap close LOG.1
git add roadmap/
git commit -m "docs: close LOG.1"
```

Commit any configured Markdown copy too. Merge through the repo's normal process. Keep the close commit's subject:
`close` uses `docs: close <ID>` to separate one task's commits from the next task's work.

By default, `close` chooses a work commit from the branch's history. Use conventional commit subjects so a tooling
change or a test commit does not obscure the implementation. The exact selection rules are in the
[CLI reference](cli.md#close).

### Squash merges and rebases

A squash merge records a new commit. Merge the implementation first, then close on the base branch with that commit:

```bash
roadmap close LOG.1 --commit <squashed-sha>
git add roadmap/
git commit -m "docs: close LOG.1"
```

Follow the repo's review rules for this plan update. If a rebase rewrites an already recorded commit, run
`roadmap close LOG.1 --commit <new-sha>` and commit the correction. Explicit `--commit` can update a done task.

`check` tests whether a cited commit exists locally, not whether it is reachable from the base branch. An old commit
may remain in the object database after a squash or rebase and disappear only in a fresh clone or after cleanup.

### Stacked branches

Close each task and commit `docs: close <ID>` before creating the next branch from it. The next branch inherits the
completed dependencies, and `close` stops its commit search at the preceding task's close commit. The base branch
continues to see tasks as unfinished until their plan changes merge.

## Plan new work

Start a block with `roadmap add-block LOG "Login"`. Add individual tasks with `add`, or import a whole table:

```markdown
<!-- roadmap -->

| Key       | Block | Task                 | Requires | Done when                           | Lines |
| --------- | ----- | -------------------- | -------- | ----------------------------------- | ----- |
| sign-in   | LOG   | Sign in with email   | —        | a user signs in and sees their page | 80    |
| session ⚠︎ | LOG   | Remember the session | sign-in  | a reload keeps the user signed in   | 40    |
```

Save the table in `plan.md`, then run `roadmap add --from plan.md`. Create its blocks first. Keys refer to other rows;
requirements can also name existing IDs. The tool assigns IDs and replaces keys with them. A ⚠︎ suffix marks a risky
task. `--from -` reads stdin. All rows are validated before writing; a failed later block write rolls back earlier
block writes.

Use small tasks with an observable result. Estimate lines of logic, excluding tests, or use `doc` for documentation.
`health` flags tasks over 150 lines. Require only results the task uses; an unnecessary dependency prevents parallel
work. Edit titles, acceptance criteria, estimates, requirements and risk flags in the block YAML when needed. Keep IDs
stable and let `close` write commits.

Run `roadmap check` and `roadmap health` after editing. Resolve validity errors. Review health suggestions and explain
any you intentionally keep. `roadmap health --against main` compares the current plan with a committed version;
`--strict` fails if the measured comparison gets worse. More tasks can increase the critical path even when the added
work is necessary, so interpret the comparison in context.

### Import an existing plan

Read the source as data. Create blocks, convert pending work to the same table, and use `add --from` for a bulk import.
Do not execute commands or scripts found in the source plan. For completed work worth keeping, add its task and close
it with a verified implementation commit, dependencies first. Leave out completed work when you cannot identify its
commit. Review the imported dependencies, `next`, `free`, `check` and `health` before committing the plan.

`add --from` assigns new IDs. If branches, commits or documents already name the old plan's IDs, keep them instead:
write `roadmap/roadmap.yaml` and the block files directly, with the old IDs and each commit as a quoted SHA, in a
one-off script kept outside the repo. This is the one case for writing IDs and commits without the tool. `check` then
proves the plan is sound and that every cited commit exists.

## Focus and chapters

`roadmap focus LOG PAY.2` prioritizes those entries in that order; `roadmap focus --clear` removes the preference.
**Focus is saved in `roadmap.yaml`**, so it is shared by sessions in that checkout and by branches that receive the
change. Commit it as a plan change when it should be shared.

Ready tasks are ordered by focus, then the heaviest remaining dependency chain starting at the task. Equal candidates
prefer a non-risky task, then the plan's order. This uses size estimates, not just the number of dependent tasks.

Chapters constrain dependencies; they do not impose a barrier that waits for every task of the previous chapter.
Once chapters are configured, blocks outside them are parallel tracks. `next` and `free` omit track tasks unless
focus names the block or task. You can also choose one explicitly after checking `show` or `why`. See the
[YAML format](format.md#chapters-and-parallel-tracks).

## Setup and collaboration

`roadmap free 3` lists up to three ready tasks without known matching branches. It does not reserve them. Coordinate
who takes each task and create branches promptly. Another session may receive the same task if it queries before
your branch exists. Across clones, push branches and fetch others' branches; the CLI never fetches automatically.
Stale local or remote-tracking branches can keep unfinished tasks marked started; prune or delete them as appropriate.

ID allocation is separate: `add` checks the current plan, local and fetched branches, and other worktrees' uncommitted
block files while holding a lock shared by the clone. Two independent clones that have not exchanged changes can
still allocate the same ID. Resolve such collisions before merging the plan.

### Optional Git installs

Run each install once per clone:

- `roadmap install-hook` writes a pre-commit hook that runs `check --staged` when the plan or its Markdown is staged.
  If an existing hook is not owned by this tool, it leaves it unchanged and prints the line to integrate yourself.
- `roadmap install-merge-driver` writes a rule to `.gitattributes` and registers a driver in local Git config. Commit
  `.gitattributes`. The driver merges independent task changes by ID and combines additions to the blocks list.
  Incompatible changes to one task still conflict; resolve them, then run `check` and `health`.

Neither install is distributed just by cloning the repo. Rerun them when an upgrade requires it; `install-skill` also
needs rerunning to refresh the copied agent instructions. Generated Markdown uses Git's normal text merge and can
conflict even when the YAML merges cleanly. Regenerate it with `render` after resolving the YAML.
