import type { ChatMessage, LLMProvider } from "../types.js";

/**
 * Offline stand-in for a real model, used by the tests and by `--mock` demo runs
 * so the project can be tried without API keys. It replays a script of JSON
 * replies; it is NOT the agent's reasoning — real runs always use an LLM.
 */
export class ScriptedLLM implements LLMProvider {
  readonly name: string;
  readonly calls: ChatMessage[][] = [];
  private i = 0;

  constructor(private readonly script: (string | Error)[], name = "mock") {
    this.name = name;
  }

  async complete(messages: ChatMessage[]): Promise<string> {
    this.calls.push(messages);
    const next = this.script[Math.min(this.i++, this.script.length - 1)];
    if (next instanceof Error) throw next;
    return next;
  }
}
