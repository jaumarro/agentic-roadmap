import { readOnBranches, readStaged, resolveCommit } from './git.adapter.ts';
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

/** The roadmap as `revision` has it, read from git without checking it out. */
export function readRoadmapAt(root: string, revision: string): Roadmap {
  if (resolveCommit(root, revision) === null) throw new RoadmapError(`This repo has no ${revision} to compare with.`);
  return readRoadmapWith((file) => {
    // `./` makes the path relative to `root`, wherever the repo's top is.
    const [text] = readOnBranches(root, `./${ROADMAP_DIR}/${file}`, [revision]);
    if (text === undefined) throw new RoadmapError(`${ROADMAP_DIR}/${file} is missing on ${revision}.`);
    return text;
  });
}
