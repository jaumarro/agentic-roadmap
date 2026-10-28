# agentic-roadmap

Your project's plan, kept as YAML files in the repo. People and coding agents ask it what to do next, and close each
task with the commit that did it.

- **No database, no server.** The plan is plain files in `roadmap/`, reviewed like any other code.
- **Safe in parallel.** The tool picks ids and commits. Sessions in one clone, on its branches and worktrees, never take
  the same id, committed or not: `add` takes a lock the worktrees share and reads all of them. Clones on other machines
  see each other only through pushed branches; an id both took is caught when they merge. A task counts as started as
  soon as a branch is named after it.
- **Readable anywhere.** `roadmap render` writes the plan as Markdown tables whenever you want to share it.

## Why this one

Most tools for agents' tasks are issue trackers: a backlog that agents claim work from, kept in a database. This one is
a plan: ordered, its dependencies checked, and its shape measured.

|                      | agentic-roadmap                                                                          | Trackers such as Beads or taskops         |
| -------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------- |
| Where the plan lives | YAML files in `roadmap/`, read and reviewed in PRs                                       | a database (Dolt, SQLite) or a JSONL log  |
| What runs it         | Node and two libraries                                                                   | a database engine, often a daemon or sync |
| Who has started what | read from branch names: nothing to keep in sync                                          | claims written to the store               |
| A plan that is wrong | `check` refuses cycles, unknown requirements, repeated ids and commits that do not exist | mostly left to whoever writes it          |
| A plan that is weak  | `health`: critical path, parallelism, bottlenecks, oversized tasks                       | not measured                              |
| What to take next    | the task the most work waits on, after your focus                                        | priority or order you set                 |
| From a plan to tasks | the plan ends with a table; `add --from` adds it all, or nothing                         | one task at a time                        |

Pick a tracker when you want a queue of issues many agents pull from across machines. Pick this when the work is a
plan you want to read, review and keep sound while several sessions build it.

## Install

Needs Node 24 or later.

```bash
pnpm add -D github:jaumarro/agentic-roadmap
```

pnpm builds the package on install, and asks you first: it prints an `allowBuilds:` line for your
`pnpm-workspace.yaml`. Add it and install again.

This gives you two commands, `agentic-roadmap` and its short name `roadmap`.

## Start

```bash
roadmap init           # creates roadmap/ with an example block
roadmap install-skill  # teaches coding agents the workflow
roadmap install-hook   # refuses commits that break the plan
```

## The plan

`roadmap/roadmap.yaml` lists the blocks in order. Each block lives in its own file, `roadmap/<CODE>.yaml`:

```yaml
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

Don't write ids or commits by hand: `add` and `close` do it.

## Daily use

| Step                     | Command                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| What do I do now?        | `roadmap next`                                                                              |
| Start the task           | a branch named after it: `log-1/sign-in`                                                    |
| Finish it                | `roadmap close LOG.1`, then commit as `docs: close LOG.1`                                   |
| Add a task               | `roadmap add LOG "Sign out" --done-when "the button signs out" --lines 20 --requires LOG.1` |
| Several sessions at once | `roadmap free 3` gives one free task per session                                            |
| Is the plan fine?        | `roadmap check` and `roadmap health`                                                        |
| How far along?           | `roadmap status`                                                                            |

`roadmap help` lists every command.

To keep a Markdown copy in the repo, name it in `roadmap/roadmap.yaml` (`markdown: docs/roadmap.md`): `add`, `close`
and `focus` then keep it current, and `check` fails when someone edits it by hand. Keep your formatter off it. Two
branches closing tasks in one block will conflict on it, which is why there is none by default.

## Coming from another plan

Ask your agent to move it in. With the skill installed, it reads your plan, whatever its shape, and builds `roadmap/`
with `add`.

## License

MIT
