# Roadmap

<!-- Generated from roadmap/ by agentic-roadmap render. Edit the YAML, then run render. -->

## COR · The core loop

| Id | Task | Requires | Done when | Lines |
| - | - | - | - | - |
| ✅ COR.1 | Set up the package with its tools and a CLI that prints its usage | — | 283754d: pnpm test, typecheck, lint and format:check pass on a CLI that prints its usage | ~50 |
| ✅ COR.2 | Start a roadmap with init and name the task to take with next | COR.1 | 47910e8: init in an empty folder, then next from a subfolder names the right task and its branch | ~150 |
| ✅ COR.3 | Close a task with its commit, and check the plan | COR.2 | 59f1e65: close writes the sha of the last non-docs commit, quoted, and next moves on; check fails on an unknown requirement, a repeated id or block, a cycle, an id outside its block and a sha this repo does not have; next refuses a plan check rejects and says why; next says when a branch already started the task | ~150 |
| ✅ COR.4 | Add a task with an id the tool picks | COR.3 | 98eb237: two branches that each add a task to the same block get different ids, and check passes after merging both | ~120 |
| ✅ COR.5 | Clean errors, strict flags and no roadmap inside another | COR.3 | b6fb0f3: a YAML syntax error and a folder it cannot write end in a message with the file and line, never a stack trace, and init writes nothing half-done; --root with no value or with a flag fails; init under an existing roadmap refuses; next tells «all done», «no tasks» and «blocked» apart; --help exits 0 | ~100 |
| ✅ COR.6 | Merge two branches' block files by task id, so parallel adds and closes merge without asking | COR.4 | 451f9b8: with merge-driver installed, two branches that each add a task to one block, and two that close different tasks in it, merge with no conflict and check passes; the same id changed on both sides still stops the merge | ~80 |
| ✅ COR.7 | Check the staged plan before each commit, with a pre-commit hook to install | — | 876ae55: check --staged reads roadmap/ and the Markdown from the index; install-hook adds a pre-commit that runs it when they are staged, keeping any hook already there; a commit with a broken requires is refused | ~60 |

## QRY · Ask the whole plan

| Id | Task | Requires | Done when | Lines |
| - | - | - | - | - |
| ✅ QRY.1 | Show a task and why it is not ready | COR.3 | 31de877: show ID gives its block, done when, requirements with their state, what it unblocks, and its commit or branch; why ID walks the requirements not done down to the ones ready to take; both with --json | ~120 |
| ✅ QRY.2 | List the plan with filters | QRY.1 | 3b327ce: list gives every task with its state, and --block, --state ready\|done\|started\|waiting narrow it; --json gives the same rows | ~80 |
| ✅ QRY.3 | Measure the plan's health, so whoever writes it can tell whether it got better | QRY.1 | 3f266fc: health gives the critical path weighted by lines, the average parallelism, the widest set of tasks that can run at once, the tasks blocking most of the plan, the requires a longer path already implies, the share of requires across blocks and the tasks over the size cap; it ranks the 3 to 5 worst problems with the task or block to fix; --json gives the same; --strict fails past the thresholds | ~150 |
| ✅ QRY.4 | Compare the plan's health with another branch | QRY.3 | e12483e: health --against main shows each metric before and after, reading the other branch's roadmap from git without checking it out, and names what got worse | ~80 |
| ✅ QRY.5 | Say what adding a task did to the plan's health | QRY.3, COR.4 | 7ca107c: add ends with the change it made, as «critical path 8 → 9 · parallelism 3.1 → 2.8», and names any problem it brought in | ~40 |

## PAR · Several sessions at once

| Id | Task | Requires | Done when | Lines |
| - | - | - | - | - |
| ✅ PAR.1 | Hand out several free tasks at once, with --json | COR.3 | bb57c90: free 3 hands out three different ready tasks no branch started, in next's order; next --json and free --json give the same rows | ~70 |
| ✅ PAR.2 | Put a block or a task first with focus | PAR.1 | 7259dec: focus XYZ ABC.4 writes the focus in roadmap.yaml, and next and free put XYZ's tasks and ABC.4 first, in the focus's order; focus --clear empties it; check refuses a focus naming no block or task | ~70 |
| ✅ PAR.3 | Mark a task risky, and order the rest by size | PAR.1 | 771e1ad: a task can say risky true; next and free take, after focus and fewest requirements, the smaller task first and a risky one last; show and list mark it | ~50 |
| ✅ PAR.4 | Chapters, and the plan-size warnings, in check | COR.3 | e1c1a4c: roadmap.yaml can name chapters; check refuses a task requiring one from a later chapter, and warns on a block outside 5 to 25 tasks and a chain of more than 5 pending tasks | ~60 |

## DOC · A plan readable on GitHub

| Id | Task | Requires | Done when | Lines |
| - | - | - | - | - |
| ✅ DOC.1 | Render the plan as Markdown, and show progress with status | COR.3 | 317c19d: render writes the Markdown the config names, with no progress table; status shows each block's progress; check fails when the Markdown was edited by hand | ~150 |

## AGT · Agents follow it unprompted

| Id | Task | Requires | Done when | Lines |
| - | - | - | - | - |
| ✅ AGT.1 | A skill with today's workflow | QRY.3 | c281a02: skill/SKILL.md tells an agent how to take the next task, branch, close it, ask the plan with show, why and list, and plan with check and health; every command it names exists and runs as it says | doc |
| ✅ AGT.2 | Install the skill in a repo, and prove an agent follows it | AGT.1, COR.4, PAR.1 | 300997e: install-skill copies the skill into a repo's .claude/skills; the skill covers add and free; in a test repo with it installed, asking Claude for what is next and to do it makes it use next, name the branch after the task and close it, and asking it to plan a feature makes it add the tasks with add, run health and fix the worst problems | ~40 |

## REV · reviewer adopts it

| Id | Task | Requires | Done when | Lines |
| - | - | - | - | - |
| ✅ REV.1 | Make the package installable, by npm or a git dependency, with the maintainer's yes | AGT.2 | 258b0b9: reviewer can add agentic-roadmap as a dependency without a local path | doc |
| REV.2 | Move reviewer's plan to the package and drop its plan scripts | REV.1 | reviewer's pnpm scripts call the CLI, scripts/plan-* are gone and /api/roadmap answers the same JSON as before | ~150 |

## ANL · Read the plan's shape

| Id | Task | Requires | Done when | Lines |
| - | - | - | - | - |
| ✅ ANL.1 | Order next and free by focus, then by how much work each task unblocks | QRY.3, PAR.3 | 260a7b0: one analysis gives each task its wave, bottom level and float; health prints the same figures; a small task off the critical path no longer goes ahead of one on it | ~80 |
| ANL.2 | List the pending tasks by wave, critical ones marked | ANL.1, QRY.2 | list --by wave groups the tasks not done by wave, focused first within each, critical marked, parallel tracks apart, with --state and --json as for list | ~30 |
| ANL.3 | Warn when free hands out more tasks than the plan keeps busy | PAR.1, QRY.3 | free N with N over the plan's width says how many sessions it keeps busy | ~10 |
| ANL.4 | Compare each closed task's estimate with the lines its commit changed | QRY.3 | health says how far estimates fall from the lines the closing commits changed, by block, and health --json gives the figures | ~40 |
| ANL.6 | Give the dependency graph as Mermaid or JSON | ANL.1 | graph --mermaid prints a flowchart with each task's state and critical ones marked, a parallel track as its own subgraph; graph --json gives nodes and edges with state, wave and critical | ~50 |
