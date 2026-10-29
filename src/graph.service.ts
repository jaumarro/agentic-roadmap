import type { Roadmap } from './roadmap.model.ts';
import { listRows, type Row } from './query.service.ts';

export type Graph = { nodes: Row[]; edges: { from: string; to: string }[] };

/** The tasks left, or every task with `all`, and each requirement among them as an edge from it to what needs it. */
export function readGraph(roadmap: Roadmap, branches: string[], all: boolean): Graph {
  const nodes = listRows(roadmap, branches, {}).filter((row) => all || row.state !== 'done');
  const shown = new Set(nodes.map((node) => node.id));
  const edges = roadmap.blocks
    .flatMap((block) => block.tasks)
    .filter((task) => shown.has(task.id))
    .flatMap((task) => task.requires.filter((id) => shown.has(id)).map((id) => ({ from: id, to: task.id })));
  return { nodes, edges };
}
