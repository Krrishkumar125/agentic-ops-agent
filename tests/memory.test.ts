import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LongTermMemory } from "../src/memory/longTerm.js";
import { ShortTermMemory } from "../src/memory/shortTerm.js";

describe("memory", () => {
  it("persists episodes across instances and recalls by overlap", () => {
    const file = join(mkdtempSync(join(tmpdir(), "mem-")), "m.json");
    new LongTermMemory(file).remember({ run_id: "1", at: "2026-10-15T00:00:00Z", task: "payments-api errors", summary: "rolled back v2.14.0", actions: ["rollback_deploy"] });
    const again = new LongTermMemory(file);
    expect(again.count()).toBe(1);
    expect(again.recall("why is payments-api failing")[0].run_id).toBe("1");
    expect(again.recall("printer jam")).toEqual([]);
  });

  it("truncates old observations when the context grows", () => {
    const st = new ShortTermMemory(2000);
    st.add({ role: "user", content: "task" });
    for (let i = 0; i < 10; i++) st.add({ role: "user", content: "x".repeat(1000) });
    const all = st.all();
    expect(all[0].content).toBe("task");
    expect(all[1].content).toMatch(/truncated/);
    expect(all.at(-1)!.content.length).toBe(1000);
  });
});
