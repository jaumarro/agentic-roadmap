import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Block, Roadmap, Task } from './model.ts';
import { ROADMAP_DIR, RoadmapError } from './source.ts';

const DEFAULT_MARKDOWN = 'docs/roadmap.md';
const DONE_MARK = '✅ ';
const RISKY_MARK = ' ⚠︎';

function readCode(error: unknown): string {
  return error instanceof Error && 'code' in error ? String(error.code) : String(error);
}

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
  const path = join(root, name);
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, renderMarkdown(roadmap));
  } catch (error) {
    throw new RoadmapError(`Could not write ${name}: ${readCode(error)}.`);
  }
  return name;
}

/** Writes the Markdown again when there is one, so a writer never leaves it behind the YAML. */
export function syncMarkdown(root: string, roadmap: Roadmap): void {
  if (existsSync(join(root, readMarkdownPath(roadmap)))) writeMarkdown(root, roadmap);
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

/** The problem with the Markdown when one exists and says something the YAML does not; none without one. */
export function checkMarkdown(root: string, roadmap: Roadmap, read = readFromDisk): string[] {
  const name = readMarkdownPath(roadmap);
  const text = read(root, name);
  if (text === null) return [];
  if (normalize(text) === normalize(renderMarkdown(roadmap))) return [];
  return [`${name} does not match ${ROADMAP_DIR}/: edit the YAML, not the Markdown, then run render`];
}

/** Each block's progress, and the whole plan's. */
export type Progress = { code: string; name: string; done: number; total: number };

export function measureProgress(roadmap: Roadmap): Progress[] {
  return roadmap.blocks.map((block) => ({
    code: block.code,
    name: block.name,
    done: block.tasks.filter((task) => task.commit !== undefined).length,
    total: block.tasks.length,
  }));
}

function readPercent(done: number, total: number): string {
  return total === 0 ? '—' : `${Math.round((done / total) * 100)} %`;
}

export function renderProgress(progress: Progress[]): string {
  const done = progress.reduce((sum, block) => sum + block.done, 0);
  const total = progress.reduce((sum, block) => sum + block.total, 0);
  const rows = [
    ...progress.map((block) => [
      `${block.code} · ${block.name}`,
      `${block.done} / ${block.total}`,
      readPercent(block.done, block.total),
    ]),
    ['All', `${done} / ${total}`, readPercent(done, total)],
  ];
  const widths = [0, 1].map((column) => Math.max(...rows.map((row) => row[column]?.length ?? 0)));
  return rows
    .map(
      ([name = '', count = '', percent = '']) =>
        `${name.padEnd(widths[0] ?? 0)}  ${count.padEnd(widths[1] ?? 0)}  ${percent}\n`,
    )
    .join('');
}
