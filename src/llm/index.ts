import type { LLMProvider } from "../types.js";
import { GeminiProvider } from "./gemini.js";
import { OpenAICompatibleProvider } from "./openaiCompatible.js";
import { FallbackLLM } from "./fallback.js";

/** Build the provider chain from env vars; providers without a key are skipped. */
export function providersFromEnv(env: NodeJS.ProcessEnv = process.env): LLMProvider[] {
  const order = (env.LLM_PROVIDERS ?? "gemini,openai,groq").split(",").map((s) => s.trim());
  const out: LLMProvider[] = [];
  for (const name of order) {
    if (name === "gemini" && env.GEMINI_API_KEY)
      out.push(new GeminiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL ?? "gemini-2.0-flash"));
    if (name === "openai" && env.OPENAI_API_KEY)
      out.push(new OpenAICompatibleProvider("openai", "https://api.openai.com/v1", env.OPENAI_API_KEY, env.OPENAI_MODEL ?? "gpt-4o-mini"));
    if (name === "groq" && env.GROQ_API_KEY)
      out.push(new OpenAICompatibleProvider("groq", "https://api.groq.com/openai/v1", env.GROQ_API_KEY, env.GROQ_MODEL ?? "llama-3.3-70b-versatile"));
  }
  return out;
}

export function llmFromEnv(env: NodeJS.ProcessEnv = process.env): FallbackLLM {
  const providers = providersFromEnv(env);
  if (providers.length === 0)
    throw new Error("No LLM API key found. Set GEMINI_API_KEY, OPENAI_API_KEY or GROQ_API_KEY in .env, or run with --mock.");
  return new FallbackLLM(providers, Number(env.LLM_TIMEOUT_MS ?? 20000));
}
