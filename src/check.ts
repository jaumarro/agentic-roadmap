import { checkChapters, readChapterOf } from './chapters.ts';
import type { Block, Roadmap, Task } from './model.ts';

function countBy(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

function readRepeated(values: string[]): [string, number][] {
  return [...countBy(values)].filter(([, count]) => count > 1);
}

/** Each cycle once, as the path that closes it, walking the requirements depth first in the plan's order. */
function findCycles(tasks: Task[]): string[][] {
  const requires = new Map(tasks.map((task) => [task.id, task.requires]));
  const done = new Set<string>();
  const cycles: string[][] = [];
  const visit = (id: string, path: string[]) => {
    const at = path.indexOf(id);
    if (at !== -1) {
      cycles.push([...path.slice(at), id]);
      return;
    }
    if (done.has(id) || !requires.has(id)) return;
    for (const required of requires.get(id) ?? []) visit(required, [...path, id]);
    done.add(id);
  };
  for (const task of tasks) visit(task.id, []);
  return cycles;
}

/** Each block once, as first listed: a block listed twice is one problem, not every one of its tasks twice. */
function readBlocksOnce(roadmap: Roadmap): Roadmap['blocks'] {
  return roadmap.blocks.filter((block, at) => roadmap.blocks.findIndex((each) => each.code === block.code) === at);
}

/** What makes the plan unsound on its own, without git: each problem in words a person can act on. */
export function checkRoadmap(roadmap: Roadmap): string[] {
  const blocks = readBlocksOnce(roadmap);
  const tasks = blocks.flatMap((block) => block.tasks);
  const ids = new Set(tasks.map((task) => task.id));
  const repeatedBlocks = readRepeated(roadmap.blocks.map((block) => block.code));
  const outside = blocks.flatMap((block) =>
    block.tasks.filter((task) => !task.id.startsWith(`${block.code}.`)).map((task) => ({ task, block })),
  );
  const unknown = tasks.flatMap((task) =>
    task.requires.filter((id) => !ids.has(id)).map((id) => `${task.id} requires ${id}, which no task has`),
  );
  const codes = new Set(blocks.map((block) => block.code));
  const unfocused = (roadmap.focus ?? []).filter((entry) => !codes.has(entry) && !ids.has(entry));
  return [
    ...repeatedBlocks.map(([code]) => `block ${code} is listed twice`),
    ...unfocused.map((entry) => `the focus names ${entry}, which is no block or task`),
    ...outside.map(({ task, block }) => `${task.id} sits in block ${block.code}`),
    ...readRepeated(tasks.map((task) => task.id)).map(([id, count]) => `${id} is given to ${count} tasks`),
    ...unknown,
    ...checkChapters(roadmap, tasks),
    ...findCycles(tasks).map((cycle) => `a cycle: ${cycle.join(' → ')}`),
  ];
}

const BLOCK_SIZE: [number, number] = [5, 25];

function countTasks(count: number): string {
  return count === 1 ? '1 task' : `${count} tasks`;
}
const MAX_CHAIN = 5;
const MAX_BLOCKS_WAITED_ON = 3;

/** The longest run of pending tasks inside one block that ends at `id`; the plan has no cycle by now. */
function readChain(id: string, byId: Map<string, Task>, chains: Map<string, number>): number {
  const known = chains.get(id);
  if (known !== undefined) return known;
  const task = byId.get(id);
  if (task === undefined || task.commit !== undefined) return 0;
  const code = id.split('.')[0];
  const inBlock = task.requires.filter((need) => need.split('.')[0] === code);
  const chain = 1 + Math.max(0, ...inBlock.map((need) => readChain(need, byId, chains)));
  chains.set(id, chain);
  return chain;
}

/** The other blocks of its own chapter that a block's pending tasks wait on; any block when there are no chapters. */
function readBlocksWaitedOn(block: Block, chapterOf: Map<string, number | null> | null): string[] {
  const own = chapterOf?.get(block.code);
  const needed = block.tasks
    .filter((task) => task.commit === undefined)
    .flatMap((task) => task.requires.map((id) => id.split('.')[0] ?? id))
    .filter((code) => code !== block.code && (chapterOf === null || chapterOf.get(code) === own));
  return [...new Set(needed)];
}

/**
 * What makes a sound plan harder to work in parallel, without failing check: a block too small or too big, a long
 * chain of pending tasks inside a block, and a block waiting on many blocks of its chapter.
 */
export function warnRoadmap(roadmap: Roadmap): string[] {
  const [min, max] = roadmap.warnings?.blockSize ?? BLOCK_SIZE;
  const maxChain = roadmap.warnings?.chain ?? MAX_CHAIN;
  const maxWaitedOn = roadmap.warnings?.blocksWaitedOn ?? MAX_BLOCKS_WAITED_ON;
  const blocks = readBlocksOnce(roadmap);
  const chapterOf = readChapterOf(roadmap);
  const byId = new Map(blocks.flatMap((block) => block.tasks).map((task) => [task.id, task]));
  const chains = new Map<string, number>();
  const perBlock = blocks.flatMap((block) => {
    const size = block.tasks.length;
    const waitedOn = readBlocksWaitedOn(block, chapterOf);
    return [
      ...(size < min || size > max ? [`${block.code} has ${countTasks(size)}, outside ${min} to ${max}`] : []),
      ...(waitedOn.length > maxWaitedOn ? [`${block.code} waits on ${waitedOn.join(', ')}`] : []),
    ];
  });
  const longChains = [...byId.keys()].flatMap((id) => {
    const chain = readChain(id, byId, chains);
    return chain > maxChain ? [`${id} ends a chain of ${chain} pending tasks in its block`] : [];
  });
  return [...perBlock, ...longChains];
}

/** The done tasks whose commit `hasCommit` does not find. */
export function findMissingCommits(roadmap: Roadmap, hasCommit: (sha: string) => boolean): string[] {
  return readBlocksOnce(roadmap)
    .flatMap((block) => block.tasks)
    .flatMap((task) =>
      task.commit === undefined || hasCommit(task.commit)
        ? []
        : [`${task.id} cites ${task.commit}, which this repo does not have`],
    );
}
