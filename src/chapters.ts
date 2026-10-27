import type { Roadmap, Task } from './model.ts';

/** Each block's chapter, by its place in the order, and null for a parallel track; null when the plan has no chapters. */
export function readChapterOf(roadmap: Roadmap): Map<string, number | null> | null {
  const { chapters } = roadmap;
  if (chapters === undefined || chapters.length === 0) return null;
  const chapterOf = new Map<string, number | null>(roadmap.blocks.map((block) => [block.code, null]));
  for (const [at, chapter] of chapters.entries()) {
    for (const code of chapter.blocks) if (chapterOf.get(code) === null) chapterOf.set(code, at);
  }
  return chapterOf;
}

function readBlockCode(id: string): string {
  return id.split('.')[0] ?? id;
}

/** What breaks the chapters: a block they name that the plan lacks or names twice, and a requirement out of order. */
export function checkChapters(roadmap: Roadmap, tasks: Task[]): string[] {
  const chapterOf = readChapterOf(roadmap);
  if (chapterOf === null) return [];
  const named = (roadmap.chapters ?? []).flatMap((chapter) => chapter.blocks);
  const unknown = [...new Set(named)].filter((code) => !chapterOf.has(code));
  const twice = [...new Set(named.filter((code, at) => named.indexOf(code) !== at))];
  // A chapter may need its own and earlier chapters, and a track may need any; no chapter needs a track.
  const later = tasks.flatMap((task) => {
    const own = chapterOf.get(readBlockCode(task.id));
    if (own === null || own === undefined) return [];
    return task.requires.flatMap((id) => {
      const needed = chapterOf.get(readBlockCode(id));
      if (needed === undefined || (needed !== null && needed <= own)) return [];
      const where = needed === null ? 'a parallel track' : 'a later chapter';
      return [`${task.id} requires ${id}, from ${where}`];
    });
  });
  return [
    ...unknown.map((code) => `a chapter names block ${code}, which the plan does not list`),
    ...twice.map((code) => `block ${code} is in more than one chapter`),
    ...later,
  ];
}

/** Whether `task` sits on a parallel track, which next and free hand out only when focused. */
export function isOnTrack(chapterOf: Map<string, number | null> | null, task: Task): boolean {
  return chapterOf !== null && chapterOf.get(readBlockCode(task.id)) === null;
}
