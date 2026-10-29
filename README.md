# agentic-roadmap

Your project's plan, kept as YAML files in the repo. People and coding agents ask it what to do next, and close each
task with the commit that did it.

## In one minute

A plan is a block of tasks, each with what it requires and when it counts as done:

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

Ask it what to do, do it on a branch named after the task, and close it with its commit:

```console
$ roadmap next
Next: LOG.1 · Sign in with email
  Done when: a user signs in and sees their page
  Start it on a branch named log-1/…

$ git switch -c log-1/sign-in
$ git commit -m "feat: sign in with email"
$ roadmap close LOG.1
Closed LOG.1 with d719ae2 in roadmap/LOG.yaml. Commit it as «docs: close LOG.1».
$ git commit -am "docs: close LOG.1"
$ git switch main && git merge log-1/sign-in

$ roadmap next
Next: LOG.2 · Remember the session
  Done when: a reload keeps the user signed in
  Start it on a branch named log-2/…

$ roadmap status
LOG · Login  1 / 2  50 %
All          1 / 2  50 %
```

- **No database, no server.** The plan is plain files in `roadmap/`, reviewed like any other code.
- **Safe in parallel.** The tool picks ids and commits. Sessions in one clone, on its branches and worktrees, never take
  the same id, committed or not: `add` takes a lock the worktrees share and reads all of them. Clones on other machines
  see each other through fetched branches; an id both took before either pushed is caught when they merge. A task
  counts as started as soon as a branch is named after it.
- **A plan that holds.** `check` refuses cycles, unknown requirements, repeated ids and commits the repo does not have.
  `health` measures the critical path, how many sessions the plan keeps busy, and its bottlenecks.

## Install

Needs Node 20 or later. Add it to the repo as a dev dependency, so every clone and session runs the same version:

```bash
pnpm add -D agentic-roadmap   # or: npm install -D agentic-roadmap
```

It gives two commands, `agentic-roadmap` and its short name `roadmap`; run them with `pnpm exec` or `npx`. To try it
first without installing: `npx agentic-roadmap init`.

## Start

```bash
npx roadmap init                  # creates roadmap/ with an example block
npx roadmap install-skill         # teaches Claude Code the workflow
npx roadmap install-hook          # refuses commits that break the plan
npx roadmap install-merge-driver  # merges parallel edits to the plan task by task
```

Commit `roadmap/` on your base branch before the first task. After an upgrade, run `install-skill` again so agents
read the new workflow.

## For coding agents

The workflow agents follow is in [`skill/SKILL.md`](skill/SKILL.md): take the next task, branch, close it with its
commit, and plan work that ends with a table `add --from` turns into tasks.

- Claude Code: `roadmap install-skill` copies it to `.claude/skills/roadmap-workflow/`, and it loads whenever the repo
  has `roadmap/`, or when you plan work in it.
- Other agents that read `AGENTS.md` (Codex, Cursor and others): add a line pointing at it, as
  `Plan and track work with agentic-roadmap: read node_modules/agentic-roadmap/skill/SKILL.md and follow it.`

Every command that answers a question takes `--json`, and errors go to stderr, so an agent can parse the answer. The
[CLI reference](docs/cli.md) has the JSON shapes, exit codes and what each command needs from git.

## Daily use

| Step                     | Command                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| What do I do now?        | `roadmap next`                                                                              |
| Start the task           | a branch named after it: `log-1/sign-in`                                                    |
| Finish it                | `roadmap close LOG.1`, then commit as `docs: close LOG.1`                                   |
| Add a task               | `roadmap add LOG "Sign out" --done-when "the button signs out" --lines 20 --requires LOG.1` |
| Add a whole plan         | `roadmap add --from plan.md`, from the table under `<!-- roadmap -->`                       |
| Several sessions at once | `roadmap free 3` gives one free task per session                                            |
| What can run in parallel | `roadmap list --by wave`, or `roadmap graph` for a Mermaid diagram                          |
| Is the plan fine?        | `roadmap check` and `roadmap health`                                                        |
| How far along?           | `roadmap status`                                                                            |

Don't write ids or commits by hand: `add` and `close` do it. `roadmap help` lists every command, and
`roadmap <command> --help` explains one.

To keep a Markdown copy in the repo, name it in `roadmap/roadmap.yaml` (`markdown: docs/roadmap.md`): `add`, `close`
and `focus` then keep it current, and `check` fails when someone edits it by hand. Keep your formatter off it. Two
branches closing tasks in one block will conflict on it, which is why there is none by default.

## From code

An app that shows the plan reads it with the package itself, so it never parses the YAML on its own. Writing stays the
CLI's, and nothing in the library runs git: you pass the branches you read.

```ts
import { checkRoadmap, listFree, readRoadmap, readStates } from 'agentic-roadmap';

const roadmap = readRoadmap(root);
const problems = checkRoadmap(roadmap); // [{ kind: 'cycle', tasks: [...] }, ...]; describeProblem gives the words
const states = readStates(roadmap, branches); // Map of id to 'done' | 'started' | 'ready' | 'waiting'
const free = listFree(roadmap, branches); // in the order `next` and `free` hand them out
```

Each command's `--json` has its function, giving the same shape: `describeTask` for `show`, `explainWait` for `why`,
`listRows` for `list`, `readGraph` for `graph`, `measureProgress` for `status`, `measureHealth` for `health` (with
`describeHealthProblem` for its problems' words), and
`listInProgress` for the tasks a branch started. `readRoadmapWith(read)` reads a plan from files you hold, as another
branch's, with `read(file)` giving each file in `roadmap/` by name, or null when there is none.

## How it differs from task trackers

Most tools for agents' work, such as Beads or taskops, are issue trackers: a backlog agents claim work from, kept in a
store of their own. This one is a plan: ordered, its dependencies checked, and its shape measured.

|                      | agentic-roadmap                                                  | Issue trackers for agents      |
| -------------------- | ---------------------------------------------------------------- | ------------------------------ |
| Where the plan lives | YAML files in `roadmap/`, read and reviewed in PRs               | their own store, as a database |
| Who has started what | read from branch names: nothing to keep in sync                  | claims written to the store    |
| What to take next    | the task the most work waits on, after your focus                | the priority or order you set  |
| From a plan to tasks | the plan ends with a table; `add --from` adds it all, or nothing | issues created one by one      |

Pick a tracker when you want a queue of issues many agents pull from across machines. Pick this when the work is a
plan you want to read, review and keep sound while several sessions build it.

## Coming from another plan

Ask your agent to move it in. With the skill installed, it reads your plan, whatever its shape, and builds `roadmap/`
with `add --from`.

## License

MIT
