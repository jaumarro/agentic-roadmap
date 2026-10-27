import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { parse } from 'yaml';
import type { z } from 'zod';
import { blockSchema, configSchema, type Roadmap } from './model.ts';

export const ROADMAP_DIR = 'roadmap';
const CONFIG_FILE = 'roadmap.yaml';

/** A roadmap that cannot be found or read, with a message meant for the person at the terminal. */
export class RoadmapError extends Error {}

/** The folder holding `roadmap/roadmap.yaml`: `override` when given, else the nearest one from `start` upwards. */
export function findRoot(start: string, override?: string): string {
  if (override !== undefined) {
    if (!existsSync(join(override, ROADMAP_DIR, CONFIG_FILE))) {
      throw new RoadmapError(`No ${ROADMAP_DIR}/${CONFIG_FILE} in ${override}.`);
    }
    return override;
  }
  for (let dir = start; ; dir = dirname(dir)) {
    if (existsSync(join(dir, ROADMAP_DIR, CONFIG_FILE))) return dir;
    if (dirname(dir) === dir) break;
  }
  throw new RoadmapError(`No ${ROADMAP_DIR}/${CONFIG_FILE} here or above; run \`agentic-roadmap init\` to start one.`);
}

function readYaml<T>(root: string, file: string, schema: z.ZodType<T>): T {
  const path = join(root, ROADMAP_DIR, file);
  if (!existsSync(path)) throw new RoadmapError(`${relative(root, path)} is missing.`);
  const checked = schema.safeParse(parse(readFileSync(path, 'utf8')));
  if (checked.success) return checked.data;
  const [issue] = checked.error.issues;
  const where = issue?.path.join('.') || 'the file';
  throw new RoadmapError(`${relative(root, path)}: ${where}: ${issue?.message ?? 'not valid'}`);
}

/** The roadmap under `root`, each block read from its own file in the order the config lists them. */
export function readRoadmap(root: string): Roadmap {
  const config = readYaml(root, CONFIG_FILE, configSchema);
  return { blocks: config.blocks.map((code) => ({ code, ...readYaml(root, `${code}.yaml`, blockSchema) })) };
}

const STARTER_CONFIG = `# The blocks of the plan, by code, in the order it reads them. Each lives in roadmap/<CODE>.yaml.
blocks: [GET]
`;

const STARTER_BLOCK = `name: Getting started
tasks:
  - id: GET.1
    title: Write the first real block of this roadmap
    doneWhen: roadmap/ has a block of its own with its tasks
    lines: doc
  - id: GET.2
    title: Remove this example block
    requires: [GET.1]
    doneWhen: GET is gone from roadmap.yaml and its file deleted
    lines: doc
`;

/** Starts a roadmap in `dir` with an example block; refuses to touch one already there. */
export function initRoadmap(dir: string): string {
  const folder = join(dir, ROADMAP_DIR);
  if (existsSync(join(folder, CONFIG_FILE))) throw new RoadmapError(`${ROADMAP_DIR}/${CONFIG_FILE} already exists.`);
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, CONFIG_FILE), STARTER_CONFIG);
  writeFileSync(join(folder, 'GET.yaml'), STARTER_BLOCK);
  return folder;
}
