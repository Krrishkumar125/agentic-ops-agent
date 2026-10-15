import type { AgentDecision, LLMProvider, ToolCall, ToolResult } from "../types.js";
import { ToolRegistry, type ToolContext } from "../tools/registry.js";
import { ShortTermMemory } from "../memory/shortTerm.js";
import { FallbackLLM } from "../llm/fallback.js";
import { parseDecision } from "./parse.js";
import { initialObservation, systemPrompt } from "./prompt.js";

export interface AgentOptions {
  llm: LLMProvider;
  tools: ToolRegistry;
  ctx: ToolContext;
  maxSteps: number;
  onEvent?: (e: AgentEvent) => void;
}

export type AgentEvent =
  | { type: "decision"; step: number; decision: AgentDecision; provider: string }
  | { type: "observation"; step: number; results: ToolResult[] }
  | { type: "error"; step: number; message: string };

export interface RunResult {
  status: "done" | "max_steps" | "llm_failed";
  answer: string;
  actionsTaken: string[];
  openQuestions: string[];
  steps: number;
}

export class Agent {
  constructor(private readonly opts: AgentOptions) {}

  async run(task: string): Promise<RunResult> {
    const { llm, tools, ctx, maxSteps } = this.opts;
    const emit = this.opts.onEvent ?? (() => {});
    const memory = new ShortTermMemory();
    const executed: string[] = [];
    const system = { role: "system" as const, content: systemPrompt(tools.describe(), maxSteps, ctx.dryRun) };

    // PERCEIVE: task + environment snapshot + relevant long-term memories
    const past = ctx.memory.recall(task, 3);
    memory.add({ role: "user", content: initialObservation(task, ctx.kb, past) });
    ctx.audit.write({ type: "run_start", task, dry_run: ctx.dryRun, max_steps: maxSteps, recalled: past.length });

    let parseFailures = 0;
    for (let step = 1; step <= maxSteps; step++) {
      // PLAN: ask the model what to do next
      let raw: string;
      try {
        raw = await llm.complete([system, ...memory.all()], new AbortController().signal);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        ctx.audit.write({ type: "llm_failed", step, error: message });
        emit({ type: "error", step, message });
        return this.finish(task, { status: "llm_failed", answer: `Stopped: ${message}`, actionsTaken: executed, openQuestions: [], steps: step });
      }
      const provider = llm instanceof FallbackLLM ? llm.lastAttempts.at(-1)?.provider ?? llm.name : llm.name;
      if (llm instanceof FallbackLLM) ctx.audit.write({ type: "llm_attempts", step, attempts: llm.lastAttempts });

      let decision: AgentDecision;
      try {
        decision = parseDecision(raw);
      } catch (err) {
        // Self-correct: tell the model what was wrong and let it try again.
        const message = err instanceof Error ? err.message : String(err);
        parseFailures++;
        ctx.audit.write({ type: "bad_reply", step, error: message, raw: raw.slice(0, 500) });
        emit({ type: "error", step, message });
        memory.add({ role: "assistant", content: raw.slice(0, 2000) });
        memory.add({ role: "user", content: `Your reply was invalid (${message}). Reply with one JSON object in the required format.` });
        if (parseFailures >= 3) break;
        continue;
      }
      memory.add({ role: "assistant", content: JSON.stringify(decision) });
      ctx.audit.write({ type: "decision", step, provider, decision });
      emit({ type: "decision", step, decision, provider });

      if (decision.final && decision.actions.length === 0) {
        return this.finish(task, {
          status: "done",
          answer: decision.final.answer,
          actionsTaken: executed.length ? executed : decision.final.actions_taken,
          openQuestions: decision.final.open_questions ?? [],
          steps: step,
        });
      }

      // ACT: run the requested tools
      const results = await this.act(decision.actions);
      for (const r of results) if (r.ok && !r.skipped && r.tool !== undefined) {
        const call = decision.actions.find((a) => a.tool === r.tool);
        if (call && tools.list().find((t) => t.name === r.tool)?.risk !== "read") executed.push(`${r.tool}(${JSON.stringify(call.args)})`);
      }
      emit({ type: "observation", step, results });

      // REFLECT happens at the start of the next step: the model reads these
      // observations and must fill in "reflection" before deciding again.
      memory.add({ role: "user", content: `OBSERVATIONS (step ${step}):\n${JSON.stringify(results)}` });
      if (decision.actions.length === 0) {
        memory.add({ role: "user", content: "You returned no actions and no final answer. Either act or finish." });
      }
    }

    return this.finish(task, {
      status: "max_steps",
      answer: "Stopped at the step limit before the task was finished. See the audit log for progress.",
      actionsTaken: executed,
      openQuestions: [],
      steps: maxSteps,
    });
  }

  /** Read-only calls run in parallel; anything that changes state runs one by one, in order. */
  private async act(calls: ToolCall[]): Promise<ToolResult[]> {
    const { tools, ctx } = this.opts;
    const riskOf = (name: string) => tools.list().find((t) => t.name === name)?.risk ?? "read";
    const results: ToolResult[] = new Array(calls.length);
    const reads = calls.map((c, i) => ({ c, i })).filter(({ c }) => riskOf(c.tool) === "read");
    await Promise.all(reads.map(async ({ c, i }) => (results[i] = await tools.execute(c.tool, c.args, c.why, ctx))));
    for (const [i, c] of calls.entries()) {
      if (riskOf(c.tool) !== "read") results[i] = await tools.execute(c.tool, c.args, c.why, ctx);
    }
    return results;
  }

  private finish(task: string, result: RunResult): RunResult {
    const { ctx } = this.opts;
    ctx.audit.write({ type: "run_end", ...result });
    ctx.memory.remember({
      run_id: ctx.audit.runId,
      at: new Date().toISOString(),
      task,
      summary: result.answer.slice(0, 600),
      actions: result.actionsTaken,
    });
    return result;
  }
}
