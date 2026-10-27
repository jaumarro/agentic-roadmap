import type { ShownTask, Wait } from './state.ts';

function readLines(lines: number | 'doc'): string {
  return lines === 'doc' ? 'a document' : `~${lines} lines`;
}

function readPlace(shown: ShownTask): string {
  if (shown.commit !== null) return `Done with ${shown.commit}.`;
  if (shown.startedOn.length > 0) return `Started on ${shown.startedOn.join(', ')}.`;
  return shown.state === 'ready' ? 'Ready to take.' : 'Waiting: run «why» to see on what.';
}

function listRefs(title: string, refs: ShownTask['requires']): string {
  if (refs.length === 0) return `${title}: nothing\n`;
  return `${title}:\n${refs.map((ref) => `  ${ref.id} · ${ref.title} (${ref.state})\n`).join('')}`;
}

/** A task as a person reads it: what it is, where it stands, and what it needs and opens. */
export function renderShown(shown: ShownTask): string {
  return [
    `${shown.id} · ${shown.title}\n`,
    `  Block: ${shown.block.code} · ${shown.block.name}\n`,
    `  Done when: ${shown.doneWhen}\n`,
    `  Size: ${readLines(shown.lines)}\n`,
    `  ${readPlace(shown)}\n`,
    listRefs('Requires', shown.requires),
    listRefs('Unblocks', shown.unblocks),
  ].join('');
}

function renderWaits(waits: Wait[], depth: number): string {
  const indent = '  '.repeat(depth);
  return waits
    .map((wait) => `${indent}${wait.id} · ${wait.title} (${wait.state})\n${renderWaits(wait.waitsOn, depth + 1)}`)
    .join('');
}

/** Why task `id` cannot be taken yet: the tree of what it waits on, down to what can be taken now. */
export function renderWhy(id: string, state: string, waits: Wait[]): string {
  if (state === 'done') return `${id} is done.\n`;
  if (waits.length === 0) return `${id} waits on nothing: it is ${state}.\n`;
  return `${id} waits on:\n${renderWaits(waits, 1)}`;
}
