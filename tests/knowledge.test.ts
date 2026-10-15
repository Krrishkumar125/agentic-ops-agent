import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { KnowledgeStore, parseCsv } from "../src/knowledge/store.js";

const kb = new KnowledgeStore(join(__dirname, "..", "data"));

describe("KnowledgeStore", () => {
  it("loads every source type", () => {
    const sources = new Set(kb.docs.map((d) => d.source));
    expect(sources).toContain("services.json");
    expect(sources).toContain("alerts.json");
    expect(sources).toContain("runbooks.csv");
    expect([...sources].some((s) => s.startsWith("kb/"))).toBe(true);
  });

  it("ranks the matching runbook first", () => {
    const hits = kb.search("redis pool exhaustion latency");
    expect(hits[0].source === "runbooks.csv" || hits[0].source === "alerts.json").toBe(true);
    expect(hits.map((h) => h.id)).toContain("runbook:RB-2");
  });

  it("returns nothing for an unrelated query", () => {
    expect(kb.search("kubernetes banana")).toEqual([]);
  });

  it("parses csv rows by header", () => {
    expect(parseCsv("a,b\n1,2\n3,4")).toEqual([{ a: "1", b: "2" }, { a: "3", b: "4" }]);
  });
});
