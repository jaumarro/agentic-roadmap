/**
 * Reading a roadmap from code, as an app that shows the plan does: each function gives what a command's `--json` gives.
 * Writing it stays the CLI's, so ids and commits are only ever written by `add` and `close`. Nothing here runs git: the
 * caller passes its own branches, and `readRoadmapWith` reads the files from wherever the caller has them.
 */
export type { Block, Chapter, Roadmap, Task, Warnings } from './model.ts';
export type { ReadFile } from './source.ts';
export { readRoadmap, readRoadmapWith, RoadmapError } from './source.ts';
export type { Problem } from './check.ts';
export { checkRoadmap, describeProblem } from './check.ts';
export type { ShownTask, TaskState, Wait } from './state.ts';
export { describeTask, explainWait, readStates } from './state.ts';
export type { FreeTask, InProgress } from './free.ts';
export { listFree, listInProgress } from './free.ts';
export type { Row } from './query.ts';
export { listRows } from './query.ts';
export type { Graph } from './graph.ts';
export { readGraph } from './graph.ts';
export type { Progress } from './query.ts';
export { measureProgress } from './query.ts';
export type { Health, HealthProblem } from './health.ts';
export { describeHealthProblem, measureHealth } from './health.ts';
