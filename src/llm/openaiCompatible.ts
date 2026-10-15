import type { ChatMessage, LLMProvider } from "../types.js";

/** Works for OpenAI and Groq, since Groq exposes the same chat completions API. */
export class OpenAICompatibleProvider implements LLMProvider {
  constructor(
    readonly name: string,
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async complete(messages: ChatMessage[], signal: AbortSignal): Promise<string> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) throw new Error(`${this.name} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error(`${this.name} returned no content`);
    return text;
  }
}
