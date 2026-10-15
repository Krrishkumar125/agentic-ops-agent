import type { ChatMessage, LLMProvider } from "../types.js";

export interface FallbackAttempt {
  provider: string;
  ok: boolean;
  ms: number;
  error?: string;
}

export class AllProvidersFailedError extends Error {
  constructor(readonly attempts: FallbackAttempt[]) {
    super(`All LLM providers failed: ${attempts.map((a) => `${a.provider}: ${a.error}`).join(" | ")}`);
  }
}

/**
 * Tries providers in order. Each attempt gets its own timeout, so one slow
 * provider can't stall the agent; on error or timeout we move to the next.
 */
export class FallbackLLM implements LLMProvider {
  readonly name: string;
  lastAttempts: FallbackAttempt[] = [];

  constructor(private readonly providers: LLMProvider[], private readonly timeoutMs: number) {
    if (providers.length === 0) throw new Error("FallbackLLM needs at least one provider");
    this.name = providers.map((p) => p.name).join("->");
  }

  async complete(messages: ChatMessage[], outer?: AbortSignal): Promise<string> {
    this.lastAttempts = [];
    for (const provider of this.providers) {
      const started = Date.now();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(new Error(`timed out after ${this.timeoutMs}ms`)), this.timeoutMs);
      const onOuterAbort = () => ctrl.abort(outer?.reason);
      outer?.addEventListener("abort", onOuterAbort);
      try {
        const text = await Promise.race([
          provider.complete(messages, ctrl.signal),
          new Promise<never>((_, reject) =>
            ctrl.signal.addEventListener("abort", () => reject(ctrl.signal.reason ?? new Error("aborted"))),
          ),
        ]);
        this.lastAttempts.push({ provider: provider.name, ok: true, ms: Date.now() - started });
        return text;
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        this.lastAttempts.push({ provider: provider.name, ok: false, ms: Date.now() - started, error });
        if (outer?.aborted) break;
      } finally {
        clearTimeout(timer);
        outer?.removeEventListener("abort", onOuterAbort);
      }
    }
    throw new AllProvidersFailedError(this.lastAttempts);
  }
}
