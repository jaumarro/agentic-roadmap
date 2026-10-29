import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findRoot, initRoadmap } from './source.ts';
import { listAllBranches, listFree, listRows, measureProgress, readRoadmap, readStates } from './index.ts';

describe('the library', () => {
  it('reads a plan from a folder below it, as the CLI does', () => {
    const root = mkdtempSync(join(tmpdir(), 'agentic-roadmap-'));
    initRoadmap(root);
    const found = findRoot(join(root, 'roadmap'));

    const roadmap = readRoadmap(found);
    const branches = listAllBranches(found);

    expect(readStates(roadmap, branches).get('GET.1')).toBe('ready');
    expect(listFree(roadmap, branches).map((task) => task.id)).toEqual(['GET.1']);
    expect(listRows(roadmap, branches, {}).map((row) => row.id)).toEqual(['GET.1', 'GET.2']);
    expect(measureProgress(roadmap).map(({ code, done, total }) => ({ code, done, total }))).toEqual([
      { code: 'GET', done: 0, total: 2 },
    ]);
  });
});
