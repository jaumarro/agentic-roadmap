import { z } from 'zod';

const TASK_ID = /^[A-Z][A-Z0-9]*\.[0-9]+$/;

export const taskSchema = z.strictObject({
  id: z.string().regex(TASK_ID, 'an id is a block code, a dot and a number, as ABC.1'),
  title: z.string().min(1),
  requires: z.array(z.string().regex(TASK_ID)).default([]),
  doneWhen: z.string().min(1),
  /** How big it is: lines of logic, or `doc` for a document. */
  lines: z.union([z.number().int().positive(), z.literal('doc')]),
  /** The commit that closed it; a task with one is done. */
  commit: z
    .string()
    .regex(/^[0-9a-f]{7,40}$/)
    .optional(),
});

export const blockSchema = z.strictObject({
  name: z.string().min(1),
  tasks: z.array(taskSchema),
});

export const configSchema = z.strictObject({
  /** The blocks, by code, in the order the plan reads them; each lives in `roadmap/<CODE>.yaml`. */
  blocks: z.array(z.string().regex(/^[A-Z][A-Z0-9]*$/)).min(1),
});

export type Task = z.infer<typeof taskSchema>;
export type Block = z.infer<typeof blockSchema> & { code: string };
export type Roadmap = { blocks: Block[] };
