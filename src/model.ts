import { z } from 'zod';

const TASK_ID = /^[A-Z][A-Z0-9]*\.[0-9]+$/;

export const taskSchema = z.strictObject({
  id: z.string().regex(TASK_ID, 'an id is a block code, a dot and a number, as ABC.1'),
  title: z.string().min(1),
  requires: z.array(z.string().regex(TASK_ID)).default([]),
  doneWhen: z.string().min(1),
  /** How big it is: lines of logic, or `doc` for a document. */
  lines: z.union([z.number().int().positive(), z.literal('doc')], {
    error: 'lines is a positive whole number, or doc',
  }),
  /** It touches code execution, credentials, persistence, pushes or outside text: a full review, and taken last. */
  risky: z.boolean().optional(),
  /** The commit that closed it; a task with one is done. */
  commit: z
    .string({ error: 'a commit is a quoted sha, as commit: "1234567"' })
    .regex(/^[0-9a-f]{7,40}$/, 'a commit is 7 to 40 hexadecimal digits')
    .optional(),
});

export const blockSchema = z.strictObject({
  name: z.string().min(1),
  /** What the block is for, as Markdown, printed above its tasks. */
  intro: z.string().optional(),
  tasks: z.array(taskSchema),
});

export const configSchema = z.strictObject({
  /** The blocks, by code, in the order the plan reads them; each lives in `roadmap/<CODE>.yaml`. */
  blocks: z.array(z.string().regex(/^[A-Z][A-Z0-9]*$/)).min(1),
  /** Blocks and tasks to take first, in this order, ahead of the rest of the plan. */
  focus: z.array(z.string()).default([]),
  /**
   * The chapters, in order, each with its blocks. A task may require its own chapter or an earlier one; once there are
   * chapters, a block in none is a parallel track, which next and free leave to its own sessions unless focused.
   */
  chapters: z.array(z.strictObject({ name: z.string().min(1), blocks: z.array(z.string()) })).optional(),
  /** Where check warns that the plan is getting harder to work in parallel. */
  warnings: z
    .strictObject({
      blockSize: z.tuple([z.number().int().nonnegative(), z.number().int().positive()]).optional(),
      chain: z.number().int().positive().optional(),
      blocksWaitedOn: z.number().int().nonnegative().optional(),
    })
    .optional(),
  /** The branch tasks start from and merge back into; the remote's default branch, else main or master, unless set. */
  base: z.string().min(1).optional(),
  /** Where to keep the plan as Markdown, from the folder holding roadmap/; set, add, close and focus keep it current. */
  markdown: z.string().min(1).optional(),
});

export type Task = z.infer<typeof taskSchema>;
export type Block = z.infer<typeof blockSchema> & { code: string };
type Config = z.infer<typeof configSchema>;
export type Chapter = NonNullable<Config['chapters']>[number];
export type Warnings = NonNullable<Config['warnings']>;
export type Roadmap = {
  blocks: Block[];
  focus?: string[];
  markdown?: string;
  base?: string;
  chapters?: Chapter[];
  warnings?: Warnings;
};
