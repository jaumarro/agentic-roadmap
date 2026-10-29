import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from './cli.ts';
import { initRoadmap } from './source.ts';
import {
  checkRoadmap,
  describeTask,
  explainWait,
  listFree,
  listInProgress,
  listRows,
  measureHealth,
  measureProgress,
  readGraph,
  readRoadmap,
  readRoadmapWith,
  readStates,
  RoadmapError,
} from './index.ts';

function project(): string {
  const root = mkdtempSync(join(tmpdir(), 'agentic-roadmap-'));
  initRoadmap(root);
  return root;
}

function readJson(args: string[], cwd: string): unknown {
  let text = '';
  run([...args, '--json'], { cwd, env: {}, out: (written) => (text += written), err: () => undefined });
  return JSON.parse(text);
}

describe('the library', () => {
  it('gives what each command gives as JSON', () => {
    // Outside a git repo, so the CLI sees no branches, as the library given none.
    const root = project();
    const roadmap = readRoadmap(root);

    expect(describeTask(roadmap, [], 'GET.2')).toEqual(readJson(['show', 'GET.2'], root));
    expect({ id: 'GET.2', state: 'waiting', waitsOn: explainWait(roadmap, [], 'GET.2') }).toEqual(
      readJson(['why', 'GET.2'], root),
    );
    expect(listRows(roadmap, [], {})).toEqual(readJson(['list'], root));
    expect(readGraph(roadmap, [], false)).toEqual(readJson(['graph'], root));
    expect(measureProgress(roadmap)).toEqual(readJson(['status'], root));
    expect(measureHealth(roadmap)).toEqual(readJson(['health'], root));
    expect(listFree(roadmap, [])).toEqual(readJson(['free', '9'], root));
  });

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

  it('names the file a reader lacks or fails on, as a RoadmapError', () => {
    const config = 'blocks: [GET]\n';
    const missing = (file: string) => (file === 'roadmap.yaml' ? config : null);
    const failing = (file: string) => {
      if (file === 'roadmap.yaml') return config;
      throw new Error('no such object');
    };

    expect(() => readRoadmapWith(missing)).toThrow(new RoadmapError('roadmap/GET.yaml is missing.'));
    expect(() => readRoadmapWith(failing)).toThrow(new RoadmapError('Could not read roadmap/GET.yaml: no such object'));
  });
});
