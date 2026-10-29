import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDocument } from 'yaml';
import { describeProblems } from './check.service.ts';
import type { Roadmap } from './roadmap.model.ts';
import { CONFIG_FILE, readCode, ROADMAP_DIR, RoadmapError } from './roadmap.repository.ts';

/**
 * Writes `focus` into roadmap.yaml, keeping its comments; an empty focus removes the key. The plan is checked with the
 * new focus first, so a focus naming no block or task is never written, and an unsound one already there can be fixed.
 */
export function setFocus(root: string, roadmap: Roadmap, focus: string[]): void {
  const problems = describeProblems({ ...roadmap, focus });
  if (problems.length > 0)
    throw new RoadmapError(`The focus would leave the plan unsound:\n  ${problems.join('\n  ')}`);
  const name = `${ROADMAP_DIR}/${CONFIG_FILE}`;
  const path = join(root, name);
  try {
    const doc = parseDocument(readFileSync(path, 'utf8'));
    if (focus.length === 0) {
      doc.delete('focus');
    } else {
      const node = doc.createNode(focus);
      node.flow = true;
      doc.set('focus', node);
    }
    writeFileSync(path, doc.toString({ lineWidth: 0, flowCollectionPadding: false }));
  } catch (error) {
    throw new RoadmapError(`Could not write ${name}: ${readCode(error)}.`);
  }
}
