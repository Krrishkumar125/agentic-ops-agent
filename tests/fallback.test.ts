import { describe, expect, it } from "vitest";
import { FallbackLLM, AllProvidersFailedError } from "../src/llm/fallback.js";
import { ScriptedLLM } from "../src/llm/mock.js";
import { providersFromEnv } from "../src/llm/index.js";
import type { LLMProvider } from "../src/types.js";

const hanging: LLMProvider = { name: "slow", complete: () => new Promise(() => {}) };

describe("FallbackLLM", () => {
  it("falls through a failing and a hanging provider to a working one", async () => {
    const llm = new FallbackLLM([new ScriptedLLM([new Error("HTTP 500")], "gemini"), hanging, new ScriptedLLM(["{}"], "groq")], 50);
    await expect(llm.complete([])).resolves.toBe("{}");
    expect(llm.lastAttempts.map((a) => [a.provider, a.ok])).toEqual([["gemini", false], ["slow", false], ["groq", true]]);
    expect(llm.lastAttempts[1].error).toMatch(/timed out/);
  });

  it("throws with every attempt when all fail", async () => {
    const llm = new FallbackLLM([new ScriptedLLM([new Error("a")], "p1"), new ScriptedLLM([new Error("b")], "p2")], 50);
    await expect(llm.complete([])).rejects.toBeInstanceOf(AllProvidersFailedError);
  });

  it("builds providers in the configured order and skips missing keys", () => {
    const names = providersFromEnv({ LLM_PROVIDERS: "groq,gemini,openai", GROQ_API_KEY: "x", OPENAI_API_KEY: "y" }).map((p) => p.name);
    expect(names).toEqual(["groq", "openai"]);
  });
});
