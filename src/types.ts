export type Role = "system" | "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
}

/** Minimal interface every LLM backend implements. */
export interface LLMProvider {
  readonly name: string;
  complete(messages: ChatMessage[], signal: AbortSignal): Promise<string>;
}

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
  /** Why the model wants to run this call. Required so every action is explained. */
  why: string;
}

/** What the model must return on every step (validated with zod). */
export interface AgentDecision {
  /** What the last observations told the model (empty on the first step). */
  reflection: string;
  thought: string;
  plan: string[];
  actions: ToolCall[];
  final?: {
    answer: string;
    actions_taken: string[];
    open_questions?: string[];
  };
}

export interface ToolResult {
  tool: string;
  ok: boolean;
  output: unknown;
  skipped?: "dry_run" | "denied" | "not_allowed";
}
