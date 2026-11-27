import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import type { Problem } from './check.service.ts';
import { ROADMAP_DIR, RoadmapError, type Block, type Roadmap, type Task } from './roadmap.model.ts';
import { readCode } from './roadmap.repository.ts';
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

// Nothing in either that could close the link early or open another piece of Markdown.
const WEB_LINK = /^https?:\/\/[^\s()<>[\]|\\`]+$/;
const REPO_PATH = /^[\w@~.-]+(\/[\w@~.-]+)*(#[\w.-]*)?$/;
const FILE_NAME = /\.[A-Za-z]\w*$/;

/**
 * A ref as Markdown: a link when it is a web address or a path from the folder holding roadmap/, which is rewritten
 * to start at `from`, the folder the copy sits in, so it opens from there in any viewer. Anything else is text, with
 * what could start a link or a tag escaped.
 */
function renderRef(ref: string, from: string): string {
  // The label goes in backticks, which neither pattern lets in, so `__init__.py` is not read as bold.
  if (WEB_LINK.test(ref)) return `[\`${ref}\`](${ref})`;
  const [path = '', anchor] = ref.split('#');
  // A path ends as a file name does: `owner/repo#12`, `github.com/org/repo/issues/3` and `v1.2` name no file here.
  const isPath = REPO_PATH.test(ref) && FILE_NAME.test(path) && !path.split('/').includes('..');
  const target = isPath ? posix.relative(from, path) : '';
  if (target === '') return ref.replaceAll(/[[\]<>`\\]/g, (mark) => `\\${mark}`);
  const section = anchor === undefined ? '' : `#${anchor}`;
  return `[\`${ref}\`](${target}${section})`;
}

function renderRow(task: Task, withRef: boolean, from: string): string {
  const done = task.commit === undefined ? '' : DONE_MARK;
  const risky = task.risky === true ? RISKY_MARK : '';
  const requires = task.requires.length === 0 ? '—' : task.requires.join(', ');
  const doneWhen = task.commit === undefined ? task.doneWhen : `${task.commit}: ${task.doneWhen}`;
  const lines = task.lines === 'doc' ? 'doc' : `~${task.lines}`;
  const shownRef = task.ref === undefined ? '—' : renderRef(task.ref, from);
  const ref = withRef ? [shownRef] : [];
  const cells = [`${done}${task.id}${risky}`, task.title, requires, doneWhen, lines, ...ref].map(escapeCell);
  return `| ${cells.join(' | ')} |\n`;
}

function renderBlock(block: Block, from: string): string {
  const intro = block.intro === undefined || block.intro === '' ? '' : `${block.intro.trim()}\n\n`;
  const heading = `## ${block.code} · ${block.name}\n\n${intro}`;
  if (block.tasks.length === 0) return `${heading}No tasks yet.\n`;
  // Only a block that uses refs gets the column, so a plan without them renders as it always did.
  const withRef = block.tasks.some((task) => task.ref !== undefined);
  const table = withRef
    ? '| Id | Task | Requires | Done when | Lines | Ref |\n| - | - | - | - | - | - |\n'
    : '| Id | Task | Requires | Done when | Lines |\n| - | - | - | - | - |\n';
  return heading + table + block.tasks.map((task) => renderRow(task, withRef, from)).join('');
}

/**
 * The plan as Markdown, for reading on GitHub. Progress is left out on purpose: a table every close rewrites is what
 * makes parallel branches conflict, and status prints it instead.
 */
export function renderMarkdown(roadmap: Roadmap): string {
  const focus = roadmap.focus ?? [];
  const focused = focus.length === 0 ? '' : `Focus: ${focus.join(', ')}\n\n`;
  const note = `<!-- Generated from ${ROADMAP_DIR}/ by agentic-roadmap render. Edit the YAML, then run render. -->\n\n`;
  const from = posix.dirname(readMarkdownPath(roadmap).replaceAll('\\', '/'));
  const blocks = roadmap.blocks.map((block) => renderBlock(block, from));
  return `# Roadmap\n\n${note}${focused}${blocks.join('\n')}`;
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
