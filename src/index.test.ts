import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { initRoadmap } from './source.ts';
import { checkRoadmap, listFree, listInProgress, readRoadmap, readRoadmapWith, readStates } from './index.ts';

function project(): string {
  const root = mkdtempSync(join(tmpdir(), 'agentic-roadmap-'));
  initRoadmap(root);
  return root;
}

describe('the library', () => {
  it('reads a plan and where its tasks stand, given the branches', () => {
    const roadmap = readRoadmap(project());
    const branches = ['get-1/start'];

    expect(checkRoadmap(roadmap)).toEqual([]);
    expect(readStates(roadmap, branches).get('GET.1')).toBe('started');
    expect(listInProgress(roadmap, branches).map((task) => task.id)).toEqual(['GET.1']);
    expect(listFree(roadmap, []).map((task) => task.id)).toEqual(['GET.1']);
  });

  it('reads a plan from files the caller holds, as another branch', () => {
    const root = project();
    const files = new Map(
      ['roadmap.yaml', 'GET.yaml'].map((file) => [file, readFileSync(join(root, 'roadmap', file), 'utf8')]),
    );

    const roadmap = readRoadmapWith((file) => files.get(file) ?? '');

    expect(roadmap).toEqual(readRoadmap(root));
  });
});
