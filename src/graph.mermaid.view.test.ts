import { describe, expect, it } from 'vitest';
import { readGraph } from './graph.service.ts';
import { renderMermaid } from './graph.mermaid.view.ts';
import type { Roadmap, Task } from './roadmap.model.ts';

function task(id: string, requires: string[] = [], commit?: string): Task {
  return { id, title: `Do "${id}"`, requires, doneWhen: 'x', lines: 10, ...(commit ? { commit } : {}) };
}

const PLAN: Roadmap = {
  blocks: [
    {
      code: 'GET',
      name: 'Get',
      tasks: [task('GET.1', [], 'abc1234'), task('GET.2', ['GET.1']), task('GET.3', ['GET.2'])],
    },
    { code: 'SID', name: 'Side', tasks: [task('SID.1', ['GET.1'])] },
  ],
  chapters: [{ name: 'Main', blocks: ['GET'] }],
};

describe('renderMermaid', () => {
  it('draws a subgraph per block, styles each task by state and outlines the critical ones', () => {
    const text = renderMermaid(PLAN, readGraph(PLAN, [], true));

    expect(text).toMatch(/^flowchart LR\n/);
    expect(text).toContain('  subgraph GET["GET · Get"]\n    GET_1["GET.1<br/>Do #quot;GET.1#quot;"]:::done\n');
    expect(text).toContain('  subgraph SID["SID · Side (parallel track)"]\n');
    expect(text).toContain('  GET_1 --> SID_1\n');
    expect(text).toContain('  class GET_2,GET_3 critical\n');
    expect(text).toContain('  classDef waiting ');
  });
});
