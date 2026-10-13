import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { historySchema } from "../shared/contracts";
const proposalSchema = z.object({
  title: z.string(),
  baseName: z.string(),
  baseTitle: z.string().nullable(),
  at: z.number(),
});
export const recordSchema = z.object({
  revision: z.number().default(0),
  managed: z.boolean().default(false),
  locked: z.boolean().default(false),
  owner: z.string().nullable().default(null),
  expectedName: z.string(),
  expectedTitle: z.string().nullable(),
  original: z.string(),
  proposal: proposalSchema.nullable().default(null),
  history: z.array(historySchema).default([]),
  hash: z.string().nullable().default(null),
  lastGeneratedAt: z.number().nullable().default(null),
  error: z.string().nullable().default(null),
  pending: z
    .object({
      before: z.string(),
      beforeTitle: z.string().nullable(),
      after: z.string(),
      kind: z.enum(["auto", "apply", "undo"]),
      at: z.number(),
    })
    .nullable()
    .default(null),
});
export type RecordState = z.infer<typeof recordSchema>;
const stateSchema = z.object({
  version: z.literal(1),
  records: z.record(z.string(), recordSchema),
  calls: z.array(z.number()),
  estimatedUsd: z.number(),
});
export type State = z.infer<typeof stateSchema>;
export class Store {
  state: State = { version: 1, records: {}, calls: [], estimatedUsd: 0 };
  private chain: Promise<unknown> = Promise.resolve();
  constructor(readonly file: string) {}
  async load() {
    try {
      this.state = stateSchema.parse(
        JSON.parse(await readFile(this.file, "utf8")),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        throw new Error(
          "Tiger title state is unreadable. Restore it before enabling automatic naming.",
        );
    }
  }
  save() {
    const json = JSON.stringify(this.state, null, 2);
    const task = this.chain.then(async () => {
      await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
      const tmp = this.file + ".tmp";
      await writeFile(tmp, json, { mode: 0o600 });
      await rename(tmp, this.file);
    });
    this.chain = task.catch(() => {});
    return task;
  }
}
