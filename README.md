# agentic-roadmap

A roadmap kept as YAML in your repo, which people and coding agents follow from the command line: what to do next, who
has started what, and closing a task with the commit that did it.

Ids and commits are written by the tool, never by hand, so parallel sessions don't hand out the same id or cite a sha a
rebase replaced.

Status: early. The commands land one usable slice at a time; `agentic-roadmap help` lists them.

Coding agents learn the workflow from [`skill/SKILL.md`](skill/SKILL.md): taking the next task, branching, closing it,
asking the plan, and writing a plan whose `health` holds.
