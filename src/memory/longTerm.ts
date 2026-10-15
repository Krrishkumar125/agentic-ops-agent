import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface Episode {
  run_id: string;
  at: string;
  task: string;
  summary: string;
  actions: string[];
}

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9-]{3,}/g) ?? []);

/**
 * Persistent memory across runs, stored as a JSON file. Recall is by word
 * overlap, which is enough for a few hundred episodes; swapping in embeddings
 * would only change `recall`.
 */
export class LongTermMemory {
  private episodes: Episode[] = [];

  constructor(private readonly file: string | null) {
    if (file && existsSync(file)) this.episodes = JSON.parse(readFileSync(file, "utf8"));
  }

  remember(ep: Episode) {
    this.episodes.push(ep);
    if (this.file) {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, JSON.stringify(this.episodes, null, 2));
    }
  }

  recall(query: string, limit = 3): Episode[] {
    const q = words(query);
    return this.episodes
      .map((ep) => {
        const w = words(`${ep.task} ${ep.summary} ${ep.actions.join(" ")}`);
        let overlap = 0;
        for (const t of q) if (w.has(t)) overlap++;
        return { ep, overlap };
      })
      .filter((x) => x.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap || b.ep.at.localeCompare(a.ep.at))
      .slice(0, limit)
      .map((x) => x.ep);
  }

  count() {
    return this.episodes.length;
  }
}
