# Library API

Read and analyze a roadmap from TypeScript or JavaScript through the package root:

```ts
import { checkRoadmap, listFree, readRoadmap, readStates } from 'agentic-roadmap';

const root = process.cwd();
const roadmap = readRoadmap(root);
const problems = checkRoadmap(roadmap);
if (problems.length > 0) throw new Error('Fix the plan before analyzing it.');

// Supply the branch names your application knows about. The library does not run Git.
const branches = ['log-1/sign-in'];
const states = readStates(roadmap, branches);
const free = listFree(roadmap, branches);
```

`readRoadmap(root)` reads `root/roadmap/`; it does not search parent folders. It validates file structure and field
values and throws `RoadmapError` on reading or parsing failures. `checkRoadmap` then checks dependencies, IDs, focus
and chapter rules. Call it before analyzing a plan supplied by someone else.

The library exports readers and pure analysis functions. Use the CLI for writes and Git integration. Importing
internal `dist/` paths is unsupported.

## Read files from another source

`readRoadmapWith(read)` takes a synchronous `read(file)` callback returning each file's text, or `null` when missing.
Names are relative to `roadmap/`, such as `roadmap.yaml` and `LOG.yaml`. A missing required file throws `RoadmapError`.
This can read a plan from an archive, Git snapshot or in-memory files without a local checkout.

## Query functions

| Function                              | Result                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------- |
| `checkRoadmap(roadmap)`               | Structural and dependency problems as a `Problem[]`                       |
| `describeProblem(problem)`            | One problem in words                                                      |
| `readStates(roadmap, branches)`       | `Map<string, TaskState>`                                                  |
| `describeTask(roadmap, branches, id)` | The `show --json` task, or `null` for an unknown ID                       |
| `explainWait(roadmap, branches, id)`  | The `waitsOn` array of `why --json`                                       |
| `listFree(roadmap, branches)`         | All tasks available for `next` and `free`, in selection order             |
| `listInProgress(roadmap, branches)`   | The `inProgress` array of `next --json`                                   |
| `listRows(roadmap, branches, filter)` | Task rows, optionally filtered with `{ block, state }`; pass `{}` for all |
| `readGraph(roadmap, branches, all)`   | Graph nodes and edges; `all: true` includes done tasks                    |
| `measureProgress(roadmap)`            | Block progress, as `status --json`                                        |
| `measureHealth(roadmap)`              | Health figures and problems, as `health --json`                           |
| `describeHealthProblem(problem)`      | One health problem in words, with a suggested action                      |

The package exports the associated types, including `Roadmap`, `Block`, `Task`, `Chapter`, `Warnings`, `Problem`,
`TaskState`, `ShownTask`, `Wait`, `FreeTask`, `InProgress`, `Row`, `Graph`, `Progress`, `Health`, `HealthProblem` and
`ReadFile`.

The library does not verify that recorded commits exist or that generated Markdown matches: those are CLI `check`
checks that need Git or disk access. It also does not sort rows into the CLI's wave display or limit `listFree` to N
results. See the [CLI reference](cli.md) for JSON shapes and [YAML format](format.md) for stored fields.
