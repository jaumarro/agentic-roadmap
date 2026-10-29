import { readStaged } from './git.adapter.ts';
import { ROADMAP_DIR, RoadmapError, type Roadmap } from './roadmap.model.ts';
import { readRoadmapWith } from './roadmap.repository.ts';

/** The roadmap under `root` as the index holds it: what the next commit records. */
export function readStagedRoadmap(root: string): Roadmap {
  return readRoadmapWith((file) => {
    const text = readStaged(root, `${ROADMAP_DIR}/${file}`);
    if (text === null) throw new RoadmapError(`${ROADMAP_DIR}/${file} is not staged.`);
    return text;
  });
}
