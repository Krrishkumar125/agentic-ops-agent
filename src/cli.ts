#!/usr/bin/env node
import "dotenv/config";
import { parseArgs } from "node:util";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Agent, type AgentEvent } from "./agent/agent.js";
import { KnowledgeStore } from "./knowledge/store.js";
import { LongTermMemory } from "./memory/longTerm.js";
import { AuditLog } from "./logger.js";
import { ToolRegistry } from "./tools/registry.js";
import { allTools } from "./tools/index.js";
import { llmFromEnv } from "./llm/index.js";
import { ScriptedLLM } from "./llm/mock.js";
import { makeApprover, type ApprovalMode } from "./approval.js";
import { DEMO_TASK, demoScript } from "./demo/mockScript.js";
import type { LLMProvider } from "./types.js";

const HELP = `Usage: opsagent [options] "<task>"

Options:
  --data <dir>         knowledge folder (default: ./data)
  --dry-run            simulate write/critical tools instead of running them
  --approve <mode>     ask | auto-approve | deny  (default: ask)
  --tools <a,b,c>      tool allowlist (default: all tools)
  --max-steps <n>      step budget (default: AGENT_MAX_STEPS or 8)
  --mock               offline replay of the demo task, no API keys needed
  -h, --help
`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      data: { type: "string", default: "data" },
      "dry-run": { type: "boolean", default: false },
      approve: { type: "string", default: "ask" },
      tools: { type: "string" },
      "max-steps": { type: "string" },
      mock: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) return console.log(HELP);

  const task = positionals.join(" ").trim() || DEMO_TASK;
  const stateDir = resolve(process.env.AGENT_STATE_DIR ?? ".agent");
  const runId = new Date().toISOString().replace(/[:.]/g, "-") + "-" + randomUUID().slice(0, 6);
  const maxSteps = Number(values["max-steps"] ?? process.env.AGENT_MAX_STEPS ?? 8);
  const mode = values.approve as ApprovalMode;
  if (!["ask", "auto-approve", "deny"].includes(mode)) throw new Error(`--approve must be ask, auto-approve or deny`);

  let llm: LLMProvider;
  if (values.mock) {
    if (positionals.length) console.warn("[mock] the offline replay only covers the demo task; ignoring your task text.");
    llm = new ScriptedLLM(demoScript, "mock-replay");
  } else {
    llm = llmFromEnv();
  }

  const audit = new AuditLog(join(stateDir, "runs", `${runId}.jsonl`), runId);
  const tools = new ToolRegistry(allTools, values.tools?.split(",").map((s) => s.trim()));
  const agent = new Agent({
    llm,
    tools,
    maxSteps,
    ctx: {
      kb: new KnowledgeStore(resolve(values.data!)),
      memory: new LongTermMemory(join(stateDir, "memory.json")),
      audit,
      outboxDir: join(stateDir, "outbox"),
      dryRun: values["dry-run"]!,
      approve: makeApprover(mode),
    },
    onEvent: print,
  });

  console.log(`Task: ${values.mock ? DEMO_TASK : task}`);
  console.log(`LLM: ${llm.name} | dry-run: ${values["dry-run"]} | approvals: ${mode} | max steps: ${maxSteps}`);
  const result = await agent.run(values.mock ? DEMO_TASK : task);

  console.log(`\n=== ${result.status.toUpperCase()} after ${result.steps} step(s) ===`);
  console.log(result.answer);
  if (result.actionsTaken.length) console.log(`\nActions executed:\n- ${result.actionsTaken.join("\n- ")}`);
  if (result.openQuestions.length) console.log(`\nOpen questions:\n- ${result.openQuestions.join("\n- ")}`);
  console.log(`\nAudit log: ${join(stateDir, "runs", `${runId}.jsonl`)}`);
  if (result.status !== "done") process.exitCode = 1;
}

function print(e: AgentEvent) {
  if (e.type === "decision") {
    console.log(`\n--- step ${e.step} (${e.provider}) ---`);
    if (e.decision.reflection) console.log(`reflect: ${e.decision.reflection}`);
    console.log(`think:   ${e.decision.thought}`);
    for (const a of e.decision.actions) console.log(`act:     ${a.tool} ${JSON.stringify(a.args)}\n         why: ${a.why}`);
  } else if (e.type === "observation") {
    for (const r of e.results) {
      const tag = r.skipped ? r.skipped : r.ok ? "ok" : "failed";
      const out = JSON.stringify(r.output);
      console.log(`observe: ${r.tool} -> ${tag}: ${out.length > 160 ? out.slice(0, 160) + "…" : out}`);
    }
  } else {
    console.log(`error (step ${e.step}): ${e.message}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
