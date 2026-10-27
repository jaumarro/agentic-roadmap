import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RoadmapError } from './source.ts';

const SKILL = 'roadmap-workflow';

function readCode(error: unknown): string {
  return error instanceof Error && 'code' in error ? String(error.code) : String(error);
}

/** Copies the package's skill into `root`'s `.claude/skills`, over an older copy; the path written, from `root`. */
export function installSkill(root: string): string {
  const source = fileURLToPath(new URL('../skill/SKILL.md', import.meta.url));
  const folder = join(root, '.claude', 'skills', SKILL);
  const target = join(folder, 'SKILL.md');
  try {
    mkdirSync(folder, { recursive: true });
    writeFileSync(target, readFileSync(source, 'utf8'));
  } catch (error) {
    throw new RoadmapError(`Could not install the skill in ${folder}: ${readCode(error)}.`);
  }
  return relative(root, target);
}
