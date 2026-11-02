# agentic-roadmap

A plan in your repo that people and coding agents can follow together. Ask what to work on next, see what each task
needs, and record the commit that finished it.

The plan is YAML in `roadmap/`. Dependencies decide which tasks are ready, branch names show which have started, and
commits show which are done. Review the plan in the same pull requests as the code. No server or database needed.

```yaml
# roadmap/LOG.yaml
name: Login
tasks:
  - id: LOG.1
    title: Sign in with email
    doneWhen: a user signs in and sees their page
    lines: 80
  - id: LOG.2
    title: Remember the session
    requires: [LOG.1]
    doneWhen: a reload keeps the user signed in
    lines: 40
```

```console
$ roadmap next
Next: LOG.1 · Sign in with email
  Done when: a user signs in and sees their page
  Start it on a branch named log-1/…
```

## Get started

Requires Node 20 or later. In an existing Git repo, install it as a dev dependency:

```bash
pnpm add -D agentic-roadmap
```

The package provides `agentic-roadmap` and its short name, `roadmap`. These examples use `pnpm exec roadmap`.
With npm, install with `npm install -D agentic-roadmap` and run `npx agentic-roadmap`. To try it without installing,
use `npx agentic-roadmap init`; `npx roadmap` without this package installed fetches an unrelated package.

Create a plan, add a block and two tasks, and give that block priority:

```bash
pnpm exec roadmap init
pnpm exec roadmap add-block LOG "Login"
pnpm exec roadmap add LOG "Sign in with email" --done-when "a user signs in and sees their page" --lines 80
pnpm exec roadmap add LOG "Remember the session" --done-when "a reload keeps the user signed in" --lines 40 --requires LOG.1
pnpm exec roadmap focus LOG
git add roadmap/
git commit -m "docs: plan login"
```

Run this on your base branch before starting task branches. `init` also creates a small tutorial block, `GET`;
keep it while learning the workflow, then remove its file and its entry from `roadmap.yaml` when you no longer need it.

```bash
pnpm exec roadmap next
pnpm exec roadmap show LOG.1
git switch -c log-1/sign-in
```

Implement sign-in, run your repo's checks, and commit the work. Then record that commit in the plan:

```bash
pnpm exec roadmap close LOG.1
git add roadmap/
git commit -m "docs: close LOG.1"
pnpm exec roadmap status
```

Merge the branch through your usual process. **If your repo uses squash merges, merge the work first**, then close the
task with `pnpm exec roadmap close LOG.1 --commit <squashed-sha>` on the base branch. The
[workflow guide](docs/workflow.md) covers closing, rebasing and stacked branches.

## Use it with coding agents

The [workflow skill](skill/SKILL.md) tells an agent how to choose a task, work on it, close it and propose new tasks.

For Claude Code:

```bash
pnpm exec roadmap install-skill
```

This copies the skill to `.claude/skills/roadmap-workflow/SKILL.md`. Run it again after upgrading the package.

For agents that read `AGENTS.md`, add:

```text
Plan and track work with agentic-roadmap: read node_modules/agentic-roadmap/skill/SKILL.md and follow it.
```

Agents can submit a whole plan with `add --from plan.md`. Query commands support `--json`, so scripts and agents can
read structured results. See the [CLI reference](docs/cli.md).

## Daily use

| Need                                     | Command after `pnpm exec roadmap` |
| ---------------------------------------- | --------------------------------- |
| Choose the next task                     | `next`                            |
| Read a task and its acceptance criterion | `show LOG.1`                      |
| Explain what blocks a task               | `why LOG.2`                       |
| Find work for several sessions           | `free 3`                          |
| See dependencies and parallel work       | `list --by wave` or `graph`       |
| Check the plan is valid                  | `check`                           |
| Find large tasks and bottlenecks         | `health`                          |
| Compare a plan change                    | `health --against main`           |
| Show progress                            | `status`                          |

`check` finds invalid dependencies, cycles and missing commits. `health` uses task size estimates to measure the
critical path and potential parallelism, and suggests where to split tasks or remove unnecessary dependencies.

## Working in parallel

`next` and `free` leave out tasks whose branches this clone knows about. Create a task branch promptly after choosing
work. **These commands do not reserve tasks:** two sessions querying at once can receive the same result. Across
machines, publish and fetch task branches so each clone can see the others' work.

`add` allocates IDs under a lock shared by the clone's worktrees, checking branches and uncommitted worktree files.
Separate clones can still allocate the same ID before exchanging branches; conflicting additions need resolution
when merged.

Two optional installs help keep plan changes valid and merge independent edits:

```bash
pnpm exec roadmap install-hook
pnpm exec roadmap install-merge-driver
```

The hook checks the staged plan before commits that touch it. The merge driver merges YAML tasks by ID; conflicting
changes to the same task still need resolution. Both installs are per clone; the driver also writes a committed
`.gitattributes` rule. See [setup and collaboration](docs/workflow.md#setup-and-collaboration).

## How it differs from task trackers

Most tools for agents' work, such as Beads or taskops, are issue trackers: a backlog agents claim work from, kept in a
store of their own. This one is a plan: ordered, with its dependencies checked and its shape measured.

|                      | agentic-roadmap                                                  | Issue trackers for agents      |
| -------------------- | ---------------------------------------------------------------- | ------------------------------ |
| Where the plan lives | YAML files in `roadmap/`, reviewed in pull requests              | their own store, as a database |
| Who started what     | read from branch names, with nothing to keep in sync             | claims written to the store    |
| What to take next    | the task the most work waits on, after your focus                | the priority or order you set  |
| From a plan to tasks | the plan ends with a table; `add --from` adds it all, or nothing | issues created one by one      |

Pick a tracker when you want a queue of issues many agents pull from across machines. Pick this when the work is a plan
you want to read, review and keep sound while several sessions build it.

## Documentation

- [Workflow](docs/workflow.md): choose, start and finish tasks; plan work; collaborate through Git.
- [CLI reference](docs/cli.md): commands, flags, JSON output and exit codes.
- [YAML format](docs/format.md): tasks, configuration, chapters and generated Markdown.
- [Library API](docs/api.md): read and analyze a plan from TypeScript or JavaScript.
- [Agent skill](skill/SKILL.md): the instructions installed for coding agents.
- [Changelog](CHANGELOG.md) and [releasing](docs/releasing.md).

## License

MIT
