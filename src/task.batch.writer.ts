import { readNextId } from './task.id.policy.ts';
import { appendTask } from './task.add.writer.ts';
import { describeProblems } from './check.service.ts';
import type { PlanRow } from './plan-table.parser.ts';
import { RoadmapError, type Roadmap, type Task } from './roadmap.model.ts';

/**
 * Adds every row, each with the next free id of its block as add gives it, and keys in Requires swapped for those ids.
 * The plan is checked with all of them first: one problem and none is written.
 */
export function addRows(
  root: string,
  roadmap: Roadmap,
  rows: PlanRow[],
  readOnBranches: (code: string) => string[],
): { id: string; title: string }[] {
  const unknown = rows.find((row) => !roadmap.blocks.some((block) => block.code === row.block));
  if (unknown !== undefined) {
    throw new RoadmapError(`${unknown.key}: no block ${unknown.block} in this roadmap; add the block first.`);
  }
  let planned = roadmap;
  const idOf = new Map<string, string>();
  for (const row of rows) {
    const id = readNextId(planned, row.block, readOnBranches(row.block));
    idOf.set(row.key, id);
    const placeholder: Task = { id, title: row.title, requires: [], doneWhen: row.doneWhen, lines: row.lines };
    planned = {
      ...planned,
      blocks: planned.blocks.map((block) =>
        block.code === row.block ? { ...block, tasks: [...block.tasks, placeholder] } : block,
      ),
    };
  }
  const tasks = rows.map((row) => ({
    code: row.block,
    id: idOf.get(row.key) ?? '',
    task: {
      title: row.title,
      requires: row.requires.map((each) => idOf.get(each) ?? each),
      doneWhen: row.doneWhen,
      lines: row.lines,
      ...(row.risky ? { risky: true } : {}),
    },
  }));
  const byId = new Map(tasks.map((each) => [each.id, each.task]));
  const after = {
    ...planned,
    blocks: planned.blocks.map((block) => ({
      ...block,
      tasks: block.tasks.map((task) => {
        const added = byId.get(task.id);
        return added === undefined ? task : { id: task.id, ...added };
      }),
    })),
  };
  const ids = [...idOf.values()];
  const problems = describeProblems(after).filter((problem) => ids.some((id) => problem.includes(id)));
  if (problems.length > 0) {
    // The ids were never written, so the problem names the table's keys.
    const named = [...idOf].reduce(
      (text, [key, id]) => text.replaceAll(new RegExp(`\\b${id.replace('.', '\\.')}\\b`, 'g'), key),
      problems.join('; '),
    );
    throw new RoadmapError(`Nothing added: ${named}.`);
  }
  for (const each of tasks) appendTask(root, each.code, each.id, each.task);
  return tasks.map((each) => ({ id: each.id, title: each.task.title }));
}
