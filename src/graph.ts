import type { Roadmap } from './model.ts';
import { listRows, type Row } from './query.ts';

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

// Mermaid ids take no dots, and labels end at a double quote.
function readNodeId(id: string): string {
  return id.replace('.', '_');
}

// Past this a box gets too wide to read the graph; JSON keeps the whole title.
const TITLE_MAX = 40;

function shorten(title: string): string {
  if (title.length <= TITLE_MAX) return title;
  const cut = title.slice(0, TITLE_MAX);
  const word = cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:]$/, '');
  return `${word}…`;
}

function readLabel(row: Row): string {
  return `${row.id}<br/>${shorten(row.title)}`.replaceAll('"', '#quot;');
}

// Each fill sets its own text colour, so the chart reads the same on a light or a dark page.
const STYLES = [
  'classDef done fill:#e6f4ea,stroke:#3c8d50,color:#1e4620',
  'classDef started fill:#fff1c2,stroke:#b07800,color:#4a3300',
  'classDef ready fill:#dce9fb,stroke:#2f6fca,color:#0c2f66',
  'classDef waiting fill:#ececec,stroke:#888,color:#333',
  'classDef critical stroke:#c62828,stroke-width:3px',
];

/**
 * The graph as a Mermaid flowchart: a subgraph per block, a parallel track's named as one, each task styled by its
 * state and the critical ones outlined.
 */
export function renderMermaid(roadmap: Roadmap, graph: Graph): string {
  const blocks = roadmap.blocks
    .map((block) => ({ block, rows: graph.nodes.filter((node) => node.block === block.code) }))
    .filter(({ rows }) => rows.length > 0)
    .map(({ block, rows }) => {
      const track = rows.some((row) => row.track) ? ' (parallel track)' : '';
      const tasks = rows.map((row) => `    ${readNodeId(row.id)}["${readLabel(row)}"]:::${row.state}\n`);
      return `  subgraph ${block.code}["${block.code} · ${block.name}${track}"]\n${tasks.join('')}  end\n`;
    });
  const edges = graph.edges.map((edge) => `  ${readNodeId(edge.from)} --> ${readNodeId(edge.to)}\n`);
  const critical = graph.nodes.filter((node) => node.critical).map((node) => readNodeId(node.id));
  const outline = critical.length === 0 ? [] : [`  class ${critical.join(',')} critical\n`];
  const styles = STYLES.map((style) => `  ${style}\n`);
  return `flowchart LR\n${[...blocks, ...edges, ...outline, ...styles].join('')}`;
}
