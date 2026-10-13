import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
export const historySchema = z.object({
  at: z.number(),
  before: z.string(),
  beforeTitle: z.string().nullable(),
  after: z.string(),
  kind: z.enum(["auto", "apply", "undo"]),
});
export const rowSchema = z.object({
  id: z.string(),
  name: z.string(),
  project: z.string(),
  original: z.string(),
  revision: z.number(),
  locked: z.boolean(),
  managed: z.boolean(),
  busy: z.boolean(),
  proposal: z.string().nullable(),
  error: z.string().nullable(),
  history: z.array(historySchema),
  lastGeneratedAt: z.number().nullable(),
});
export const listTitles = defineRpc({
  name: "titles.list",
  input: z.object({}),
  output: z.object({
    rows: z.array(rowSchema),
    calls: z.number(),
    estimatedUsd: z.number(),
    busy: z.boolean(),
  }),
});
export const changeTitle = defineRpc({
  name: "titles.change",
  input: z.object({
    workspaceId: z.string(),
    revision: z.number().int(),
    action: z.enum(["preview", "apply", "lock", "unlock", "undo"]),
  }),
  output: z.object({ accepted: z.boolean() }),
});
export type TitleRow = z.infer<typeof rowSchema>;
