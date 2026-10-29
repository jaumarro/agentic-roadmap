import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCode, RoadmapError } from './source.ts';
import { writeInside } from './write-inside.ts';

const SKILL = 'roadmap-workflow';

/** Copies the package's skill into `root`'s `.claude/skills`, over an older copy; the path written, from `root`. */
export function installSkill(root: string): string {
  const source = fileURLToPath(new URL('../skill/SKILL.md', import.meta.url));
  const folder = join(root, '.claude', 'skills', SKILL);
  const target = join(folder, 'SKILL.md');
  try {
    writeInside(root, relative(root, target), readFileSync(source, 'utf8'));
  } catch (error) {
    if (error instanceof RoadmapError) throw error;
    throw new RoadmapError(`Could not install the skill in ${folder}: ${readCode(error)}.`);
  }
  return relative(root, target);
}
