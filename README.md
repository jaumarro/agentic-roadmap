# agentic-roadmap

Your project's plan, kept as YAML files in the repo. People and coding agents ask it what to do next, and close each
task with the commit that did it.

- **No database, no server.** The plan is plain files in `roadmap/`, reviewed like any other code.
- **Safe in parallel.** The tool picks ids and commits, so two sessions never take the same id. A task counts as
  started as soon as a branch is named after it.
- **Readable on GitHub.** A Markdown copy of the plan is kept up to date for you.

## Install

Needs Node 24 or later.

```bash
pnpm add -D github:jaumarro/agentic-roadmap
```

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

Keep your formatter off the Markdown copy (`docs/roadmap.md`), or it rewrites the tables on every close.

## License

MIT
