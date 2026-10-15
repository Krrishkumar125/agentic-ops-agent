import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KnowledgeStore } from "../src/knowledge/store.js";
import { LongTermMemory } from "../src/memory/longTerm.js";
import { AuditLog } from "../src/logger.js";
import type { ToolContext } from "../src/tools/registry.js";

export function makeCtx(over: Partial<ToolContext> = {}): ToolContext & { dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "opsagent-"));
  return {
    dir,
    kb: new KnowledgeStore(join(__dirname, "..", "data")),
    memory: new LongTermMemory(join(dir, "memory.json")),
    audit: new AuditLog(join(dir, "audit.jsonl"), "test-run"),
    outboxDir: join(dir, "outbox"),
    dryRun: false,
    approve: async () => true,
    ...over,
  };
}

export const reply = (o: object) => JSON.stringify(o);
