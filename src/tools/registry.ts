import { z } from "zod";
import type { ToolResult } from "../types.js";
import type { KnowledgeStore } from "../knowledge/store.js";
import type { LongTermMemory } from "../memory/longTerm.js";
import type { AuditLog } from "../logger.js";

/**
 * read     - only looks at internal knowledge, always safe
 * write    - creates an artifact (ticket, message, report); skipped in dry-run
 * critical - changes production; needs human approval, skipped in dry-run
 */
export type Risk = "read" | "write" | "critical";

export interface ToolContext {
  kb: KnowledgeStore;
  memory: LongTermMemory;
  audit: AuditLog;
  outboxDir: string;
  dryRun: boolean;
  approve: (summary: string) => Promise<boolean>;
}

export interface ToolDef<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  risk: Risk;
  schema: S;
  run: (args: z.infer<S>, ctx: ToolContext) => Promise<unknown> | unknown;
}

/** Keeps each tool's args typed from its schema while storing them in one list. */
export function defineTool<S extends z.ZodTypeAny>(def: ToolDef<S>): ToolDef {
  return def as unknown as ToolDef;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDef>();

  constructor(defs: ToolDef[], private readonly allowlist?: string[]) {
    for (const d of defs) this.tools.set(d.name, d);
  }

  /** Tools the model is allowed to see. */
  list(): ToolDef[] {
    return [...this.tools.values()].filter((t) => !this.allowlist || this.allowlist.includes(t.name));
  }

  /** Short text description used in the system prompt. */
  describe(): string {
    return this.list()
      .map((t) => `- ${t.name} [${t.risk}]: ${t.description}\n  args: ${JSON.stringify(shapeOf(t.schema))}`)
      .join("\n");
  }

  async execute(name: string, rawArgs: unknown, why: string, ctx: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool || (this.allowlist && !this.allowlist.includes(name))) {
      ctx.audit.write({ type: "tool_blocked", tool: name, reason: "not in allowlist" });
      return { tool: name, ok: false, output: `Tool "${name}" is not available.`, skipped: "not_allowed" };
    }
    const parsed = tool.schema.safeParse(rawArgs ?? {});
    if (!parsed.success) {
      return { tool: name, ok: false, output: `Invalid args: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}` };
    }
    const args = parsed.data;

    if (tool.risk !== "read" && ctx.dryRun) {
      ctx.audit.write({ type: "tool_dry_run", tool: name, args, why });
      return { tool: name, ok: true, output: `[dry-run] would run ${name}(${JSON.stringify(args)})`, skipped: "dry_run" };
    }
    if (tool.risk === "critical") {
      const ok = await ctx.approve(`${name}(${JSON.stringify(args)})\n  reason: ${why}`);
      ctx.audit.write({ type: "approval", tool: name, args, approved: ok });
      if (!ok) return { tool: name, ok: false, output: "Human operator denied this action.", skipped: "denied" };
    }
    try {
      const output = await tool.run(args, ctx);
      ctx.audit.write({ type: "tool_executed", tool: name, risk: tool.risk, args, why, output });
      return { tool: name, ok: true, output };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.audit.write({ type: "tool_error", tool: name, args, error: message });
      return { tool: name, ok: false, output: `Error: ${message}` };
    }
  }
}

/** Turn a zod object schema into a compact {field: type} hint for the prompt. */
function shapeOf(schema: z.ZodTypeAny): Record<string, string> {
  if (!(schema instanceof z.ZodObject)) return {};
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(schema.shape as Record<string, z.ZodTypeAny>)) {
    const optional = val.isOptional();
    const inner = optional && "unwrap" in val ? (val as z.ZodOptional<z.ZodTypeAny>).unwrap() : val;
    let type = inner instanceof z.ZodEnum ? (inner.options as string[]).join("|") : inner._def.typeName.replace("Zod", "").toLowerCase();
    if (inner.description) type += ` (${inner.description})`;
    out[key] = optional ? `${type}?` : type;
  }
  return out;
}
