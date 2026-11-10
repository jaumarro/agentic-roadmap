# YAML format

A roadmap has one configuration file, `roadmap/roadmap.yaml`, and a YAML file for each listed block. The commands
find the nearest configuration above the current folder, or use `--root` or `AGENTIC_ROADMAP_ROOT`.

Use `add-block` and `add` to create blocks and tasks, and `close` to write commits. The examples below explain the
stored format. Unknown fields are rejected.

## Configuration

Only `blocks` is required; list at least one block. Its order is the reading order and the final tie-breaker for task
selection.

```yaml
blocks: [LOG, PAY, OPS]
focus: [PAY]
base: main
markdown: docs/roadmap.md
chapters:
  - name: First release
    blocks: [LOG, PAY]
warnings:
  blockSize: [5, 25]
  chain: 5
  blocksWaitedOn: 3
```

| Field      | Meaning                                                            | When omitted                                    |
| ---------- | ------------------------------------------------------------------ | ----------------------------------------------- |
| `blocks`   | Ordered block codes, each naming `<CODE>.yaml`                     | Required                                        |
| `focus`    | Blocks or task IDs to prioritize, in order                         | No preference                                   |
| `base`     | Branch from which task work starts                                 | Remote default, then `main` or `master`         |
| `markdown` | Generated Markdown path, relative to the folder holding `roadmap/` | No automatic Markdown copy                      |
| `chapters` | Ordered chapters, each with `name` and `blocks`                    | All blocks participate in normal task selection |
| `warnings` | Thresholds for non-failing `check` warnings                        | Values shown above                              |

Block codes start with an upper-case letter and contain upper-case letters or digits. They need not have three
letters. `ROADMAP` is reserved because its file would collide with the config on case-insensitive file systems.

`check` also warns when `focus` names a done task or a block whose tasks are all done. Warning thresholds affect
`check`, not `health`. `blockSize` counts all tasks in a block; `chain` counts pending tasks
in a dependency chain within one block; `blocksWaitedOn` counts distinct other blocks its pending tasks require within
its chapter, or across the plan when there are no chapters.

## Blocks and tasks

For the configuration above, `roadmap/LOG.yaml` could contain:

```yaml
name: Login
intro: Sign-in and session handling.
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
    risky: true
```

A block has a one-line `name`, optional Markdown `intro`, and a `tasks` list, which may be empty.

| Task field | Meaning                                                                          |
| ---------- | -------------------------------------------------------------------------------- |
| `id`       | Stable `<BLOCK>.<number>` assigned by `add`                                      |
| `title`    | Required, non-empty, one-line task title                                         |
| `doneWhen` | Required, non-empty, one-line acceptance criterion                               |
| `lines`    | Required positive whole number estimating logic, excluding tests; or `doc`       |
| `requires` | Task IDs whose results this task needs; defaults to `[]`                         |
| `risky`    | Optional boolean; defaults to false                                              |
| `commit`   | Quoted hexadecimal SHA, 7–40 digits, written by `close`; its presence means done |

Use `risky: true` for work involving code execution, credentials, persistence, pushes or untrusted input. It is a
review signal and a selection tie-breaker; the CLI does not enforce a review or run acceptance checks.

Titles, acceptance criteria, and block and chapter names cannot contain line breaks. For a folded YAML scalar use
`>-`, which strips the trailing newline, rather than `>`. Text cannot contain terminal control characters other than
allowed whitespace.

## Task states

States are derived, never stored as a `state:` field. In precedence order:

1. `done`: the task has a `commit`.
2. `started`: a known branch matches the task ID.
3. `ready`: all required tasks have commits.
4. `waiting`: at least one required task is not done.

Readiness is separate from selection: a parallel-track task can be `ready` while omitted by `next` and `free`.
A branch does not prove that a session is still active. See [branch matching and collaboration](workflow.md).

## Chapters and parallel tracks

A chapter has a name and a list of blocks. A block can belong to at most one chapter. Tasks in a chapter may require
tasks in the same or an earlier chapter; they may not require a later chapter or a parallel track.

Once `chapters` is configured, a listed block that belongs to none is a parallel track: in the example, `OPS`. Track
tasks may depend on chapter tasks. `next` and `free` include track tasks only when `focus` names them or their block.
A newly added block starts as a track until you place it in a chapter.

Chapters constrain dependency direction. They do not force the entire previous chapter to finish before a ready task
in the next chapter can start.

## Generated Markdown

Set `markdown: docs/roadmap.md` to keep a readable copy. The path must be relative and stay inside the repo;
absolute paths and `..` segments are refused. Writes refuse symlinks in the target path.

`add`, `add-block`, `close` and `focus` refresh the configured copy. After editing YAML yourself, run `roadmap render`.
`check` fails if the copy is missing or no longer matches. Commit it with the YAML and exclude it from formatters.

Without `markdown:`, `render` explicitly writes `docs/roadmap.md`, but subsequent commands do not maintain or check it.
If a command reports that it changed the YAML but could not update Markdown, fix the target and run `render`;
do not repeat the original command.
