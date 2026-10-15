import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ToolRegistry } from "../src/tools/registry.js";
import { allTools } from "../src/tools/index.js";
import { makeCtx } from "./helpers.js";

describe("ToolRegistry guardrails", () => {
  it("blocks tools outside the allowlist", async () => {
    const reg = new ToolRegistry(allTools, ["list_alerts"]);
    const ctx = makeCtx();
    const r = await reg.execute("restart_service", { service: "fraud-check" }, "test", ctx);
    expect(r.skipped).toBe("not_allowed");
    expect(reg.list().map((t) => t.name)).toEqual(["list_alerts"]);
  });

  it("rejects invalid arguments", async () => {
    const r = await new ToolRegistry(allTools).execute("create_ticket", { team: "x" }, "test", makeCtx());
    expect(r.ok).toBe(false);
    expect(String(r.output)).toMatch(/Invalid args/);
  });

  it("simulates write tools in dry-run and writes nothing", async () => {
    const ctx = makeCtx({ dryRun: true });
    const r = await new ToolRegistry(allTools).execute("notify_oncall", { channel: "#x", message: "hi" }, "t", ctx);
    expect(r.skipped).toBe("dry_run");
    expect(existsSync(join(ctx.outboxDir, "notifications.jsonl"))).toBe(false);
  });

  it("asks for approval on critical tools and respects a denial", async () => {
    let asked = "";
    const ctx = makeCtx({ approve: async (s) => ((asked = s), false) });
    const r = await new ToolRegistry(allTools).execute("restart_service", { service: "fraud-check" }, "RB-2", ctx);
    expect(asked).toContain("restart_service");
    expect(r.skipped).toBe("denied");
    expect(existsSync(join(ctx.outboxDir, "changes.jsonl"))).toBe(false);
  });

  it("runs approved critical tools and records them in the audit log", async () => {
    const ctx = makeCtx();
    const r = await new ToolRegistry(allTools).execute("rollback_deploy", { service: "payments-api", from_version: "v2.14.0" }, "RB-1", ctx);
    expect(r.ok).toBe(true);
    expect(readFileSync(join(ctx.outboxDir, "changes.jsonl"), "utf8")).toContain("rollback");
    expect(ctx.audit.entries.map((e) => e.type)).toEqual(["approval", "tool_executed"]);
  });

  it("surfaces tool errors instead of throwing", async () => {
    const r = await new ToolRegistry(allTools).execute("rollback_deploy", { service: "payments-api", from_version: "v1.0.0" }, "t", makeCtx());
    expect(r.ok).toBe(false);
    expect(String(r.output)).toMatch(/not v1.0.0/);
  });
});
