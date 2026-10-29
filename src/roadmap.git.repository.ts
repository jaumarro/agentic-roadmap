import { readStaged } from './git.adapter.ts';
import type { Roadmap } from './roadmap.model.ts';
import { readRoadmapWith, ROADMAP_DIR, RoadmapError } from './roadmap.repository.ts';

/** The roadmap under `root` as the index holds it: what the next commit records. */
export function readStagedRoadmap(root: string): Roadmap {
  return readRoadmapWith((file) => {
    const text = readStaged(root, `${ROADMAP_DIR}/${file}`);
    if (text === null) throw new RoadmapError(`${ROADMAP_DIR}/${file} is not staged.`);
    return text;
  });
}
