/**
 * Reading a roadmap from code, as an app that shows the plan does. Writing it stays the CLI's, so ids and commits are
 * only ever written by `add` and `close`. Nothing here runs git: the caller passes its own branches, and
 * `readRoadmapWith` reads the files from wherever the caller has them, as another branch.
 */
export type { Block, Chapter, Roadmap, Task, Warnings } from './model.ts';
export type { ReadFile } from './source.ts';
export { readRoadmap, readRoadmapWith, RoadmapError } from './source.ts';
export type { Problem } from './check.ts';
export { checkRoadmap, describeProblem } from './check.ts';
export type { TaskState } from './state.ts';
export { readStates } from './state.ts';
export type { FreeTask, InProgress } from './free.ts';
export { listFree, listInProgress } from './free.ts';
