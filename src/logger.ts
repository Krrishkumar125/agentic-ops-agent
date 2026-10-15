import { mkdirSync, appendFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Append-only JSONL audit log. Every step, LLM call, approval and tool run is
 * written here with the run id, so a run can be replayed and reviewed later.
 */
export class AuditLog {
  readonly entries: Record<string, unknown>[] = [];

  constructor(private readonly file: string | null, readonly runId: string) {
    if (file) mkdirSync(dirname(file), { recursive: true });
  }

  write(event: Record<string, unknown>) {
    const entry = { ts: new Date().toISOString(), run_id: this.runId, ...event };
    this.entries.push(entry);
    if (this.file) appendFileSync(this.file, JSON.stringify(entry) + "\n");
  }
}
