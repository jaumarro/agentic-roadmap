# agentic-roadmap

A roadmap kept as YAML in your repo, which people and coding agents follow from the command line: what to do next, who
has started what, and closing a task with the commit that did it.

Ids and commits are written by the tool, never by hand, so parallel sessions don't hand out the same id or cite a sha a
rebase replaced.

`render` writes the plan as Markdown for GitHub, `docs/roadmap.md` unless `markdown:` in `roadmap/roadmap.yaml` says
otherwise, and the commands that change the plan keep it current. It has no progress table, since one every close
rewrites conflicts across branches: `status` prints it. Keep your formatter off the generated file, or it re-pads the
tables on every close.

Status: early. The commands land one usable slice at a time; `agentic-roadmap help` lists them.

Coding agents learn the workflow from [`skill/SKILL.md`](skill/SKILL.md): taking the next task, branching, closing it,
asking the plan, and writing a plan whose `health` holds.
