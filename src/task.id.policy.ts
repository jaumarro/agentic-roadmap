import { parse } from 'yaml';
import type { Roadmap } from './roadmap.model.ts';

function readNumber(id: string, code: string): number | null {
  const match = new RegExp(`^${code}\\.(\\d+)$`).exec(id);
  return match?.[1] === undefined ? null : Number(match[1]);
}

/** The task ids a block file's text holds; none when it does not read. */
function readIds(text: string): string[] {
  try {
    const content: unknown = parse(text);
    if (typeof content !== 'object' || content === null || !('tasks' in content) || !Array.isArray(content.tasks)) {
      return [];
    }
    return content.tasks.flatMap((task: unknown) =>
      typeof task === 'object' && task !== null && 'id' in task && typeof task.id === 'string' ? [task.id] : [],
    );
  } catch {
    return [];
  }
}

/**
 * The next free id in block `code`: one past the highest number here or on any local branch, so two sessions adding on
 * their own branches never give out the same one.
 */
export function readNextId(roadmap: Roadmap, code: string, onBranches: string[]): string {
  const here = roadmap.blocks.filter((block) => block.code === code).flatMap((block) => block.tasks.map((t) => t.id));
  const elsewhere = onBranches.flatMap(readIds);
  const numbers = [...here, ...elsewhere].flatMap((id) => {
    const number = readNumber(id, code);
    return number === null ? [] : [number];
  });
  return `${code}.${Math.max(0, ...numbers) + 1}`;
}
