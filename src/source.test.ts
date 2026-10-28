import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findRoot, initRoadmap, readRoadmap, RoadmapError } from './source.ts';

function project(): string {
  return mkdtempSync(join(tmpdir(), 'agentic-roadmap-'));
}

describe('initRoadmap', () => {
  it('writes a roadmap that reads back with its example block', () => {
    const root = project();
    initRoadmap(root);

    const roadmap = readRoadmap(root);

    expect(roadmap.blocks.map((block) => block.code)).toEqual(['GET']);
    expect(roadmap.blocks[0]?.tasks.map((task) => task.id)).toEqual(['GET.1', 'GET.2']);
  });

  it('refuses a folder that already has one', () => {
    const root = project();
    initRoadmap(root);

    expect(() => initRoadmap(root)).toThrow(RoadmapError);
  });

  it('fails without touching a block file that was there before', () => {
    const root = project();
    mkdirSync(join(root, 'roadmap'));
    writeFileSync(join(root, 'roadmap', 'GET.yaml'), 'mine\n');

    expect(() => initRoadmap(root)).toThrow(RoadmapError);
    expect(readFileSync(join(root, 'roadmap', 'GET.yaml'), 'utf8')).toBe('mine\n');
  });
});

describe('findRoot', () => {
  it('finds the roadmap from a folder below it', () => {
    const root = project();
    initRoadmap(root);
    const below = join(root, 'src', 'deep');
    mkdirSync(below, { recursive: true });

    expect(findRoot(below)).toBe(root);
  });

  it('takes the folder it is given over the search', () => {
    const root = project();
    initRoadmap(root);

    expect(findRoot(project(), root)).toBe(root);
  });

  it('says how to start one when there is none', () => {
    expect(() => findRoot(project())).toThrow(/agentic-roadmap init/);
  });
});

describe('readRoadmap', () => {
  it('names the file and the field of a task that does not read', () => {
    const root = project();
    initRoadmap(root);
    writeFileSync(
      join(root, 'roadmap', 'GET.yaml'),
      'name: Bad\ntasks:\n  - id: get1\n    title: x\n    doneWhen: y\n    lines: 5\n',
    );

    expect(() => readRoadmap(root)).toThrow(/roadmap\/GET\.yaml: tasks\.0\.id: an id is a block code/);
  });

  it('says which block file is missing', () => {
    const root = project();
    initRoadmap(root);
    writeFileSync(join(root, 'roadmap', 'roadmap.yaml'), 'blocks: [GET, XYZ]\n');

    expect(() => readRoadmap(root)).toThrow('roadmap/XYZ.yaml is missing.');
  });
});
