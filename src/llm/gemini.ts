import type { ChatMessage, LLMProvider } from "../types.js";

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";
  constructor(private readonly apiKey: string, private readonly model: string) {}

  async complete(messages: ChatMessage[], signal: AbortSignal): Promise<string> {
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
    const res = await fetch(url, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      }),
    });
    if (!res.ok) throw new Error(`gemini HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
    if (!text) throw new Error("gemini returned no text");
    return text;
  }
}
