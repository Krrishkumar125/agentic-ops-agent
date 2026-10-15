import { describe, expect, it } from "vitest";
import { parseDecision } from "../src/agent/parse.js";

describe("parseDecision", () => {
  it("accepts fenced JSON and fills defaults", () => {
    const d = parseDecision('Sure!\n```json\n{"thought":"x","actions":[{"tool":"list_alerts"}]}\n```');
    expect(d.reflection).toBe("");
    expect(d.actions[0]).toEqual({ tool: "list_alerts", args: {}, why: "" });
    expect(d.final).toBeUndefined();
  });

  it("rejects replies without a thought", () => {
    expect(() => parseDecision('{"actions":[]}')).toThrow(/thought/);
  });

  it("rejects non-JSON", () => {
    expect(() => parseDecision("I think we should restart")).toThrow(/no JSON/);
  });
});
