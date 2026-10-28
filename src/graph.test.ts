import { describe, expect, it } from 'vitest';
import { readGraph, renderMermaid } from './graph.ts';
import type { Roadmap, Task } from './model.ts';

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

describe('readGraph', () => {
  it('gives the tasks left and the requirements among them, or every task with all', () => {
    const left = readGraph(PLAN, [], false);

    expect(left.nodes.map((node) => node.id)).toEqual(['GET.2', 'GET.3', 'SID.1']);
    expect(left.edges).toEqual([{ from: 'GET.2', to: 'GET.3' }]);
    expect(readGraph(PLAN, [], true).edges).toEqual([
      { from: 'GET.1', to: 'GET.2' },
      { from: 'GET.2', to: 'GET.3' },
      { from: 'GET.1', to: 'SID.1' },
    ]);
  });

  it('gives each node its state, wave and critical mark', () => {
    expect(readGraph(PLAN, ['get-3/x'], false).nodes).toMatchObject([
      { id: 'GET.2', state: 'ready', wave: 1, critical: true },
      { id: 'GET.3', state: 'started', wave: 2, critical: true },
      { id: 'SID.1', state: 'ready', wave: 1, critical: false, track: true },
    ]);
  });
});

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
