import type { ChatMessage } from "../types.js";

/**
 * Working memory for one run: the conversation with the model.
 * Old tool observations are compacted so the prompt doesn't grow without bound.
 */
export class ShortTermMemory {
  private messages: ChatMessage[] = [];

  constructor(private readonly maxChars = 24_000) {}

  add(msg: ChatMessage) {
    this.messages.push(msg);
    this.compact();
  }

  all(): ChatMessage[] {
    return [...this.messages];
  }

  private size() {
    return this.messages.reduce((n, m) => n + m.content.length, 0);
  }

  private compact() {
    // Keep the first message (the task) and the latest exchanges intact;
    // shorten older observations first.
    for (let i = 1; i < this.messages.length - 4 && this.size() > this.maxChars; i++) {
      const m = this.messages[i];
      if (m.role === "user" && m.content.length > 400) {
        m.content = m.content.slice(0, 400) + " …[older observation truncated]";
      }
    }
  }
}
