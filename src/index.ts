/**
 * Reading a roadmap from code, as an app that shows the plan does: each function gives what a command's `--json` gives.
 * Writing it stays the CLI's, so ids and commits are only ever written by `add` and `close`. Nothing here runs git: the
 * caller passes its own branches, and `readRoadmapWith` reads the files from wherever the caller has them.
 */
export type { Block, Chapter, Roadmap, Task, Warnings } from './roadmap.model.ts';
export type { ReadFile } from './roadmap.repository.ts';
export { readRoadmap, readRoadmapWith, RoadmapError } from './roadmap.repository.ts';
export type { Problem } from './check.service.ts';
export { checkRoadmap, describeProblem } from './check.service.ts';
export type { ShownTask, TaskState, Wait } from './state.service.ts';
export { describeTask, explainWait, readStates } from './state.service.ts';
export type { FreeTask, InProgress } from './free.service.ts';
export { listFree, listInProgress } from './free.service.ts';
export type { Row } from './query.service.ts';
export { listRows } from './query.service.ts';
export type { Graph } from './graph.service.ts';
export { readGraph } from './graph.service.ts';
export type { Progress } from './query.service.ts';
export { measureProgress } from './query.service.ts';
export type { Health, HealthProblem } from './health.service.ts';
export { describeHealthProblem, measureHealth } from './health.service.ts';
