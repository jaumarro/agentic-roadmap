import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Document, isMap, isScalar, isSeq, parseDocument, type YAMLMap, type YAMLSeq } from 'yaml';
import { ROADMAP_DIR, RoadmapError } from './roadmap.model.ts';
import { readCode } from './roadmap.repository.ts';
import { writeInside } from './safe-write.adapter.ts';

/** A block file open for editing: its document, with comments and layout, and its list of tasks. */
export type OpenBlock = { doc: Document; tasks: YAMLSeq };

function readName(code: string): string {
  return `${ROADMAP_DIR}/${code}.yaml`;
}

function openBlock(root: string, code: string): { text: string; open: OpenBlock } {
  const name = readName(code);
  const text = readFileSync(join(root, name), 'utf8');
  const doc = parseDocument(text);
  const tasks = doc.get('tasks');
  if (!isSeq(tasks)) throw new RoadmapError(`${name} has no task list to change.`);
  return { text, open: { doc, tasks } };
}

/** Task `id`'s entry in an open block; an error when the file does not hold it. */
export function findTaskNode(block: OpenBlock, id: string): YAMLMap {
  const node = block.tasks.items.find((item) => isMap(item) && item.get('id') === id);
  if (!isMap(node)) throw new RoadmapError(`${id} could not be found in its block's file.`);
  return node;
}

/** Renames `from` to `to` where a task's list under `key` holds it, keeping the entry and any comment on it. */
export function renameId(node: YAMLMap, key: string, from: string, to: string): void {
  const list = node.get(key, true);
  if (!isSeq(list)) return;
  for (const item of list.items) if (isScalar(item) && item.value === from) item.value = to;
}

/**
 * Sets a task's list of ids under `key`, or removes the key when the list is empty. A list already there keeps its
 * layout, and each id that stays keeps its entry, so a comment written on a requirement survives. A new list goes on
 * one line, as the plan writes them, right after the task's title, where a reader looks for it.
 */
export function setIdList(block: OpenBlock, node: YAMLMap, key: string, ids: string[]): void {
  if (ids.length === 0) {
    node.delete(key);
    return;
  }
  const current = node.get(key, true);
  if (isSeq(current)) {
    const entries = current.items;
    current.items = ids.map(
      (id) => entries.find((item) => isScalar(item) && item.value === id) ?? block.doc.createNode(id),
    );
    return;
  }
  const list = block.doc.createNode(ids);
  if (isSeq(list)) list.flow = true;
  if (node.has(key)) {
    node.set(key, list);
    return;
  }
  const title = node.items.findIndex((pair) => isScalar(pair.key) && pair.key.value === 'title');
  node.items.splice(title + 1, 0, block.doc.createPair(key, list));
}

/** Whether `name` holds `text` again, written back if it had changed. */
export function putBack(root: string, name: string, text: string): boolean {
  try {
    if (readFileSync(join(root, name), 'utf8') !== text) writeInside(root, name, text);
    return true;
  } catch {
    return false;
  }
}

function writeBlock(root: string, name: string, text: string): void {
  try {
    writeInside(root, name, text);
  } catch (error) {
    if (error instanceof RoadmapError) throw error;
    throw new RoadmapError(`Could not write ${name}: ${readCode(error)}.`);
  }
}

/**
 * Opens the files of blocks `codes`, lets `edit` change them in memory, then writes every one or none: a write that
 * fails puts back the files already written, or names those it can't.
 */
export function editBlocks(root: string, codes: string[], edit: (blocks: Map<string, OpenBlock>) => void): void {
  const originals = new Map<string, string>();
  try {
    const opened = [...new Set(codes)].map((code) => ({ code, ...openBlock(root, code) }));
    edit(new Map(opened.map(({ code, open }) => [code, open])));
    for (const { code, text, open } of opened) {
      const name = readName(code);
      originals.set(name, text);
      writeBlock(root, name, open.doc.toString({ lineWidth: 0, flowCollectionPadding: false }));
    }
  } catch (error) {
    const stuck = [...originals].filter(([name, text]) => !putBack(root, name, text)).map(([name]) => name);
    const cause = error instanceof RoadmapError ? error.message : `Could not write the plan: ${readCode(error)}.`;
    const left = stuck.length === 0 ? '' : ` ${stuck.join(', ')} kept the change: restore them with git.`;
    throw new RoadmapError(`${cause}${left}`);
  }
}
