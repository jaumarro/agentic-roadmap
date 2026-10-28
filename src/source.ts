import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { parse, YAMLError } from 'yaml';
import type { z } from 'zod';
import { readStaged } from './git.ts';
import { blockSchema, configSchema, type Roadmap } from './model.ts';

export const ROADMAP_DIR = 'roadmap';
export const CONFIG_FILE = 'roadmap.yaml';

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

function readCode(error: unknown): string {
  return error instanceof Error && 'code' in error ? String(error.code) : String(error);
}

/** A roadmap file's text by its name in `roadmap/`, from the working tree or from another branch. */
export type ReadFile = (file: string) => string;

function readFromDisk(root: string): ReadFile {
  return (file) => {
    const path = join(root, ROADMAP_DIR, file);
    const name = relative(root, path);
    if (!existsSync(path)) throw new RoadmapError(`${name} is missing.`);
    try {
      return readFileSync(path, 'utf8');
    } catch (error) {
      throw new RoadmapError(`Could not read ${name}: ${readCode(error)}.`);
    }
  };
}

/** What `file` holds as YAML, with any failure to read or parse it as a one-line message naming the file. */
function parseYaml(read: ReadFile, file: string): unknown {
  const name = `${ROADMAP_DIR}/${file}`;
  const text = read(file);
  try {
    return parse(text);
  } catch (error) {
    if (!(error instanceof YAMLError)) throw error;
    const line = error.linePos?.[0].line;
    // yaml ends its message with where it is, which the line number in front already says.
    const message = error.message.split('\n')[0]?.replace(/ at line \d+, column \d+:?$/, '');
    throw new RoadmapError(line === undefined ? `${name}: ${message}` : `${name}, line ${line}: ${message}`);
  }
}

function readYaml<T>(read: ReadFile, file: string, schema: z.ZodType<T>): T {
  const content = parseYaml(read, file);
  const name = `${ROADMAP_DIR}/${file}`;
  if (content === null || content === undefined) throw new RoadmapError(`${name} is empty.`);
  const checked = schema.safeParse(content);
  if (checked.success) return checked.data;
  const [issue] = checked.error.issues;
  const where = issue?.path.join('.') || 'the file';
  throw new RoadmapError(`${name}: ${where}: ${issue?.message ?? 'not valid'}`);
}

/** The roadmap `read` gives, each block read from its own file in the order the config lists them. */
export function readRoadmapWith(read: ReadFile): Roadmap {
  const config = readYaml(read, CONFIG_FILE, configSchema);
  const blocks = config.blocks.map((code) => ({ code, ...readYaml(read, `${code}.yaml`, blockSchema) }));
  return {
    blocks,
    focus: config.focus,
    markdown: config.markdown,
    ...(config.chapters === undefined ? {} : { chapters: config.chapters }),
    ...(config.warnings === undefined ? {} : { warnings: config.warnings }),
  };
}

/** The roadmap in the working tree under `root`. */
export function readRoadmap(root: string): Roadmap {
  return readRoadmapWith(readFromDisk(root));
}

/** The roadmap under `root` as the index holds it: what the next commit records. */
export function readStagedRoadmap(root: string): Roadmap {
  return readRoadmapWith((file) => {
    const text = readStaged(root, `${ROADMAP_DIR}/${file}`);
    if (text === null) throw new RoadmapError(`${ROADMAP_DIR}/${file} is not staged.`);
    return text;
  });
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

/** The nearest folder above `dir` with a roadmap, which already covers it; none at the top. */
function findCovering(dir: string): string | null {
  for (let above = dirname(dir); ; above = dirname(above)) {
    if (existsSync(join(above, ROADMAP_DIR, CONFIG_FILE))) return above;
    if (dirname(above) === above) return null;
  }
}

/**
 * Starts a roadmap in `dir` with an example block; refuses one already there or above. The block is written first and
 * the config last, since the config is what makes it a roadmap: a write that fails leaves none half made.
 */
export function initRoadmap(dir: string): string {
  const folder = join(dir, ROADMAP_DIR);
  if (existsSync(join(folder, CONFIG_FILE))) throw new RoadmapError(`${ROADMAP_DIR}/${CONFIG_FILE} already exists.`);
  const covering = findCovering(dir);
  if (covering !== null) throw new RoadmapError(`A roadmap already covers this folder, at ${covering}.`);
  const block = join(folder, 'GET.yaml');
  let wroteBlock = false;
  try {
    mkdirSync(folder, { recursive: true });
    writeFileSync(block, STARTER_BLOCK, { flag: 'wx' });
    wroteBlock = true;
    writeFileSync(join(folder, CONFIG_FILE), STARTER_CONFIG, { flag: 'wx' });
  } catch (error) {
    if (wroteBlock) rmSync(block);
    throw new RoadmapError(`Could not write the roadmap in ${dir}: ${readCode(error)}.`);
  }
  return dir;
}
