import { isMap, isSeq, parseDocument, type Document, type Node } from 'yaml';

/** A merged file's text, or why it could not be merged without a person. */
export type Merged = { text: string } | { conflict: string };

type Entry = { id: string; node: Node; value: unknown };

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function readValue(doc: Document): unknown {
  const value: unknown = doc.toJSON();
  return value;
}

function readKeys(value: unknown): string[] {
  return typeof value === 'object' && value !== null ? Object.keys(value) : [];
}

function readEntries(doc: Document): Entry[] | null {
  const tasks = doc.get('tasks');
  if (!isSeq(tasks)) return null;
  return tasks.items.flatMap((item) => {
    if (!isMap(item)) return [];
    const id = item.get('id');
    const value: unknown = item.toJSON();
    return typeof id === 'string' ? [{ id, node: item, value }] : [];
  });
}

function indexById(entries: Entry[]): Map<string, Entry> {
  return new Map(entries.map((entry) => [entry.id, entry]));
}

/**
 * The one side's change against `base`: unchanged on one side takes the other; changed alike takes either; changed
 * differently is a conflict, as is a task one side dropped and the other changed.
 */
function pick(base: Entry | undefined, ours: Entry | undefined, theirs: Entry | undefined): Entry | null | 'conflict' {
  if (same(ours?.value, theirs?.value)) return ours ?? null;
  if (same(ours?.value, base?.value)) return theirs ?? null;
  if (same(theirs?.value, base?.value)) return ours ?? null;
  return 'conflict';
}

/** Merges a key outside the task list into `ours`; the key's name when both sides changed it differently. */
function mergeKey(ours: Document, base: Document, theirs: Document, key: string): string[] {
  const [o, b, t]: unknown[] = [ours.get(key), base.get(key), theirs.get(key)];
  if (same(o, t) || same(t, b)) return [];
  if (!same(o, b)) return [key];
  ours.set(key, t);
  return [];
}

function mergeWhole(base: Document, ours: Document, theirs: Document, oursText: string, theirsText: string): Merged {
  const [b, o, t] = [readValue(base), readValue(ours), readValue(theirs)];
  if (same(o, t) || same(t, b)) return { text: oursText };
  if (same(o, b)) return { text: theirsText };
  return { conflict: 'both sides changed a file with no task list' };
}

/**
 * Merges three versions of a block file task by task: tasks keep `ours`'s order, and tasks only `theirs` has follow in
 * theirs. Comments and layout come from ours. A file with no task list merges only when one side left it unchanged.
 */
export function mergeBlock(baseText: string, oursText: string, theirsText: string): Merged {
  const base = parseDocument(baseText);
  const ours = parseDocument(oursText);
  const theirs = parseDocument(theirsText);
  if ([base, ours, theirs].some((doc) => doc.errors.length > 0)) return { conflict: 'a version does not parse' };
  const baseEntries = readEntries(base);
  const ourEntries = readEntries(ours);
  const theirEntries = readEntries(theirs);
  if (baseEntries === null || ourEntries === null || theirEntries === null) {
    return mergeWhole(base, ours, theirs, oursText, theirsText);
  }
  const baseById = indexById(baseEntries);
  const ourById = indexById(ourEntries);
  const theirById = indexById(theirEntries);
  const theirsOnly = theirEntries.map((entry) => entry.id).filter((id) => !ourById.has(id));
  const conflicts: string[] = [];
  const kept: Node[] = [];
  for (const id of [...ourEntries.map((entry) => entry.id), ...theirsOnly]) {
    const chosen = pick(baseById.get(id), ourById.get(id), theirById.get(id));
    if (chosen === 'conflict') conflicts.push(id);
    else if (chosen !== null) kept.push(chosen.node);
  }
  const keys = new Set([...readKeys(readValue(ours)), ...readKeys(readValue(theirs))]);
  keys.delete('tasks');
  const keyConflicts = [...keys].flatMap((key) => mergeKey(ours, base, theirs, key));
  if (conflicts.length > 0 || keyConflicts.length > 0) {
    return { conflict: `both sides changed ${[...conflicts, ...keyConflicts].join(', ')}` };
  }
  const tasks = ours.get('tasks');
  if (isSeq(tasks)) tasks.items = kept;
  return { text: ours.toString({ lineWidth: 0, flowCollectionPadding: false }) };
}
