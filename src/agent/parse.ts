import { z } from "zod";
import type { AgentDecision } from "../types.js";

const decisionSchema = z.object({
  reflection: z.string().default(""),
  thought: z.string(),
  plan: z.array(z.string()).default([]),
  actions: z
    .array(z.object({ tool: z.string(), args: z.record(z.string(), z.unknown()).default({}), why: z.string().default("") }))
    .default([]),
  final: z
    .object({
      answer: z.string(),
      actions_taken: z.array(z.string()).default([]),
      open_questions: z.array(z.string()).optional(),
    })
    .nullish()
    .transform((v) => v ?? undefined),
});

/** Pull the first JSON object out of a model reply (handles ```json fences and stray text). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object found in model reply");
  return JSON.parse(candidate.slice(start, end + 1));
}

export function parseDecision(text: string): AgentDecision {
  const result = decisionSchema.safeParse(extractJson(text));
  if (!result.success) {
    throw new Error(`reply does not match the decision format: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  return result.data;
}
