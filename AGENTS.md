# Working on agentic-roadmap

This is a public package on npm. Every change ships to other people's repos and runs on their machines, so it is
written for a reader who has only the repo:

- No breaking change slips in. A change to the YAML, a command or its `--json` goes under `## Unreleased` in
  [CHANGELOG.md](CHANGELOG.md) as «Breaking:», and ships in a minor version while 0.x. Within a version, `--json` fields
  are only added, never renamed or removed.
- Behaviour and docs move together: [README.md](README.md), [docs/cli.md](docs/cli.md) and
  [skill/SKILL.md](skill/SKILL.md) say what the code does, in the same change.
- A plan is untrusted input: it may come from someone else's pull request. Nothing in it is run, written outside the
  repo, or printed raw to a terminal.
- Nothing private lands: no machine paths, tokens, or references to a local session, plan or tool.
- Every change comes with its tests, and `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm format:check` pass.
- No `any`, no disabled lint or type rules, no `--no-verify`.
- Conventional commits, one logical change each. Releasing is in [docs/releasing.md](docs/releasing.md).

## Where code goes

`src/` is flat. Each file is `subject.kind.ts`: the subject first, as the CLI names it (`health`, `task.close`), so
everything about one subject sorts together, and the kind last. [src/layout.test.ts](src/layout.test.ts) fails on a
name or an import that breaks this.

| Kind          | Holds                                  | May import            |
| ------------- | -------------------------------------- | --------------------- |
| `.model`      | the plan's types and their validation  | nothing of ours       |
| `.service`    | rules over a plan already read         | pure kinds            |
| `.policy`     | one decision, as which commit closes   | pure kinds            |
| `.parser`     | text in, data out                      | pure kinds            |
| `.view`       | data in, text for a person out         | pure kinds            |
| `.repository` | reading the plan, from disk or git     | anything but `cli.ts` |
| `.writer`     | writing the plan or its Markdown       | anything but `cli.ts` |
| `.adapter`    | git, the file system, locks            | anything but `cli.ts` |
| `.installer`  | setting a repo up: hook, driver, skill | anything but `cli.ts` |
| `.locator`    | finding this package's own files       | anything but `cli.ts` |

The pure kinds (model, service, policy, parser, view) never touch `node:fs`, `node:child_process` or an I/O kind, so
they are tested with plain data. `cli.ts` reads the command line and wires the rest; `index.ts` is the library, and
exports only what reads: pure kinds and the repository.

Tests sit next to their file, as `health.service.test.ts`. A test that drives the command line as a whole is
`<subject>.cli.test.ts`.
