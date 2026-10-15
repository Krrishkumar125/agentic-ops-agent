import { describe, expect, it } from "vitest";
import { Agent } from "../src/agent/agent.js";
import { ToolRegistry } from "../src/tools/registry.js";
import { allTools } from "../src/tools/index.js";
import { ScriptedLLM } from "../src/llm/mock.js";
import { makeCtx, reply } from "./helpers.js";

const finish = reply({ thought: "done", actions: [], final: { answer: "all good", actions_taken: [] } });

describe("Agent loop", () => {
  it("perceives, acts, feeds observations back and finishes", async () => {
    const llm = new ScriptedLLM([
      reply({ thought: "look first", actions: [{ tool: "get_service_status", args: { service: "notifications" }, why: "check" }] }),
      reply({ reflection: "it is down", thought: "ticket", actions: [{ tool: "create_ticket", args: { team: "growth", title: "down", severity: "high", body: "ALR-103" }, why: "RB-3" }] }),
      finish,
    ]);
    const ctx = makeCtx();
    const result = await new Agent({ llm, tools: new ToolRegistry(allTools), ctx, maxSteps: 5 }).run("is notifications ok?");

    expect(result.status).toBe("done");
    expect(result.steps).toBe(3);
    expect(result.actionsTaken).toEqual(["create_ticket(team=growth, title=down, severity=high, body=ALR-103)"]);
    // first prompt contains the environment snapshot; second contains the tool output
    expect(llm.calls[0].at(-1)!.content).toMatch(/ENVIRONMENT/);
    expect(llm.calls[1].at(-1)!.content).toMatch(/CrashLoopBackOff/);
    // the run is remembered for next time
    expect(ctx.memory.recall("notifications")).toHaveLength(1);
  });

  it("stops at the step budget", async () => {
    const loop = reply({ thought: "again", actions: [{ tool: "list_alerts", args: {}, why: "x" }] });
    const result = await new Agent({ llm: new ScriptedLLM([loop]), tools: new ToolRegistry(allTools), ctx: makeCtx(), maxSteps: 3 }).run("t");
    expect(result.status).toBe("max_steps");
  });

  it("recovers from an invalid reply", async () => {
    const llm = new ScriptedLLM(["not json", finish]);
    const ctx = makeCtx();
    const result = await new Agent({ llm, tools: new ToolRegistry(allTools), ctx, maxSteps: 4 }).run("t");
    expect(result.status).toBe("done");
    expect(llm.calls[1].at(-1)!.content).toMatch(/invalid/);
    expect(ctx.audit.entries.some((e) => e.type === "bad_reply")).toBe(true);
  });

  it("does not count denied critical actions as executed", async () => {
    const llm = new ScriptedLLM([
      reply({ thought: "restart", actions: [{ tool: "restart_service", args: { service: "fraud-check" }, why: "RB-2" }] }),
      finish,
    ]);
    const result = await new Agent({ llm, tools: new ToolRegistry(allTools), ctx: makeCtx({ approve: async () => false }), maxSteps: 3 }).run("t");
    expect(result.actionsTaken).toEqual([]);
    expect(llm.calls[1].at(-1)!.content).toMatch(/denied/);
  });

  it("runs the bundled mock demo end to end in dry-run", async () => {
    const { demoScript, DEMO_TASK } = await import("../src/demo/mockScript.js");
    const result = await new Agent({ llm: new ScriptedLLM(demoScript), tools: new ToolRegistry(allTools), ctx: makeCtx({ dryRun: true }), maxSteps: 8 }).run(DEMO_TASK);
    expect(result.status).toBe("done");
    expect(result.actionsTaken).toEqual([]);
  });
});
