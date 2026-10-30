import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isSeq, parseDocument, stringify } from 'yaml';
import {
  BLOCK_CODE,
  InvalidPlan,
  readBlock,
  type Roadmap,
  CONFIG_FILE,
  ROADMAP_DIR,
  RoadmapError,
} from './roadmap.model.ts';
import { readCode } from './roadmap.repository.ts';
import { writeInside } from './safe-write.adapter.ts';

/**
 * Starts block `code` with no tasks: its file, then its code at the end of roadmap.yaml's blocks. The config is written
 * last, as it is what makes the file a block: a write that fails leaves no block half made.
 */
export function addBlock(root: string, roadmap: Roadmap, code: string, name: string): string {
  if (!BLOCK_CODE.test(code)) throw new RoadmapError(`${code} is no block code: capital letters and digits, as ABC.`);
  if (roadmap.blocks.some((block) => block.code === code)) throw new RoadmapError(`The plan already has ${code}.`);
  const file = `${ROADMAP_DIR}/${code}.yaml`;
  if (existsSync(join(root, file))) throw new RoadmapError(`${file} already exists; add ${code} to roadmap.yaml.`);
  if (name.trim() === '') throw new RoadmapError("Say the block's name: add-block <CODE> <NAME>.");
  try {
    readBlock({ name, tasks: [] });
  } catch (error) {
    if (error instanceof InvalidPlan) throw new RoadmapError(`The name ${error.message}.`);
    throw error;
  }
  try {
    writeInside(root, file, stringify({ name, tasks: [] }));
  } catch (error) {
    throw readWriteError(file, error);
  }
  const configName = `${ROADMAP_DIR}/${CONFIG_FILE}`;
  const config = join(root, configName);
  try {
    const doc = parseDocument(readFileSync(config, 'utf8'));
    const blocks = doc.get('blocks');
    if (!isSeq(blocks)) throw new RoadmapError(`${configName} has no blocks list to add to.`);
    blocks.items.push(doc.createNode(code));
    writeFileSync(config, doc.toString({ lineWidth: 0, flowCollectionPadding: false }));
  } catch (error) {
    rmSync(join(root, file));
    throw readWriteError(configName, error);
  }
  return file;
}

function readWriteError(name: string, error: unknown): RoadmapError {
  return error instanceof RoadmapError ? error : new RoadmapError(`Could not write ${name}: ${readCode(error)}.`);
}
