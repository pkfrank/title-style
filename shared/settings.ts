import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
export const DEFAULT_INSTRUCTIONS = `Use English. Write Subject · Verb object, at most 45 characters. The action must begin with an imperative verb such as Design, Build, Fix, Draft, Review, Triage, Research, Plan, Send, Schedule or Update, never a noun such as Architecture. Rewrite provisional titles into this format. Put the recognizable project/topic first. Keep the subject stable across updates. Keep useful names and identifiers; omit opaque Slack/channel IDs and generic words like task/session/investigate unless meaningful. Prefer a broad umbrella when several agents share the workspace. Never claim Done, Verified, Approved or Ready for review, and never infer progress from idle status. Keep the existing title unless the actual objective materially changed. Acknowledgments such as good/keep going do not change the objective.`;
export const titleStyleSettings = defineSettings({
  id: "naming",
  scope: "host",
  version: 1,
  schema: z.object({
    enabled: z.boolean().default(true),
    instructions: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .default(DEFAULT_INSTRUCTIONS),
    model: z.enum(["claude-haiku-4-5"]).default("claude-haiku-4-5"),
    cooldownSeconds: z.number().int().min(60).max(3600).default(120),
    hourlyLimit: z.number().int().min(1).max(100).default(30),
  }),
});
export type TitleStyleSettings = z.output<typeof titleStyleSettings.schema>;
