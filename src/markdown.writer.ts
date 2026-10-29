import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Problem } from './check.service.ts';
import type { Block, Roadmap, Task } from './roadmap.model.ts';
import { readCode, ROADMAP_DIR, RoadmapError } from './roadmap.repository.ts';
import { writeInside } from './safe-write.adapter.ts';

const DEFAULT_MARKDOWN = 'docs/roadmap.md';
const DONE_MARK = '✅ ';
const RISKY_MARK = ' ⚠︎';

/** The Markdown file's path from the folder holding roadmap/. */
export function readMarkdownPath(roadmap: Roadmap): string {
  return roadmap.markdown ?? DEFAULT_MARKDOWN;
}

function escapeCell(text: string): string {
  return text.replaceAll('|', '\\|');
}

function renderRow(task: Task): string {
  const done = task.commit === undefined ? '' : DONE_MARK;
  const risky = task.risky === true ? RISKY_MARK : '';
  const requires = task.requires.length === 0 ? '—' : task.requires.join(', ');
  const doneWhen = task.commit === undefined ? task.doneWhen : `${task.commit}: ${task.doneWhen}`;
  const lines = task.lines === 'doc' ? 'doc' : `~${task.lines}`;
  const cells = [`${done}${task.id}${risky}`, task.title, requires, doneWhen, lines].map(escapeCell);
  return `| ${cells.join(' | ')} |\n`;
}

function renderBlock(block: Block): string {
  const intro = block.intro === undefined || block.intro === '' ? '' : `${block.intro.trim()}\n\n`;
  const heading = `## ${block.code} · ${block.name}\n\n${intro}`;
  if (block.tasks.length === 0) return `${heading}No tasks yet.\n`;
  const table = '| Id | Task | Requires | Done when | Lines |\n| - | - | - | - | - |\n';
  return heading + table + block.tasks.map(renderRow).join('');
}

/**
 * The plan as Markdown, for reading on GitHub. Progress is left out on purpose: a table every close rewrites is what
 * makes parallel branches conflict, and status prints it instead.
 */
export function renderMarkdown(roadmap: Roadmap): string {
  const focus = roadmap.focus ?? [];
  const focused = focus.length === 0 ? '' : `Focus: ${focus.join(', ')}\n\n`;
  const note = `<!-- Generated from ${ROADMAP_DIR}/ by agentic-roadmap render. Edit the YAML, then run render. -->\n\n`;
  return `# Roadmap\n\n${note}${focused}${roadmap.blocks.map(renderBlock).join('\n')}`;
}

/** Writes the Markdown where the config says; the path written. */
export function writeMarkdown(root: string, roadmap: Roadmap): string {
  const name = readMarkdownPath(roadmap);
  try {
    writeInside(root, name, renderMarkdown(roadmap));
  } catch (error) {
    if (error instanceof RoadmapError) throw error;
    throw new RoadmapError(`Could not write ${name}: ${readCode(error)}.`);
  }
  return name;
}

/**
 * Writes the Markdown again when the repo keeps one, so a writer never leaves it behind the YAML. One kept by default
 * would conflict on every pair of branches closing tasks in a block, as the merge driver only merges the YAML.
 */
export function syncMarkdown(root: string, roadmap: Roadmap): void {
  if (roadmap.markdown !== undefined) writeMarkdown(root, roadmap);
}

// A formatter pads table cells and lengthens the dash rows; neither changes what the table says.
function normalize(markdown: string): string {
  return markdown
    .split('\n')
    .map((line) => {
      if (!line.startsWith('|')) return line.trimEnd();
      const cells = line.split(/(?<!\\)\|/).map((cell) => cell.trim());
      return cells.map((cell) => (/^:?-+:?$/.test(cell) ? '-' : cell)).join('|');
    })
    .join('\n')
    .trimEnd();
}

function readFromDisk(root: string, name: string): string | null {
  const path = join(root, name);
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/** The problem with the Markdown the repo keeps when it says something the YAML does not. */
export function checkMarkdown(root: string, roadmap: Roadmap, read = readFromDisk): Problem[] {
  if (roadmap.markdown === undefined) return [];
  const path = roadmap.markdown;
  const text = read(root, path);
  if (text === null) return [];
  if (normalize(text) === normalize(renderMarkdown(roadmap))) return [];
  return [{ kind: 'stale-markdown', path }];
}
