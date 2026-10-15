import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, extname, basename } from "node:path";

export interface KnowledgeDoc {
  id: string;
  source: string; // file it came from
  text: string;
  data?: unknown; // original structured record, when there is one
}

export interface Service {
  name: string;
  team: string;
  status: string;
  error_rate_pct: number;
  p95_latency_ms: number;
  version: string;
  last_deploy_at: string;
  depends_on: string[];
}

export interface Alert {
  id: string;
  at: string;
  service: string;
  severity: string;
  message: string;
}

/** Tiny CSV parser: enough for our runbooks (no quoted fields). */
export function parseCsv(raw: string): Record<string, string>[] {
  const lines = raw.trim().split(/\r?\n/);
  const header = lines.shift()?.split(",") ?? [];
  return lines.map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(header.map((h, i) => [h, cells[i]?.trim() ?? ""]));
  });
}

const tokenize = (s: string) => s.toLowerCase().match(/[a-z0-9-]+/g) ?? [];

/**
 * Loads every internal source from a data folder and offers keyword search
 * (TF-IDF style scoring). It is deliberately simple; a vector DB could replace
 * `search` without changing the tools that call it.
 */
export class KnowledgeStore {
  readonly docs: KnowledgeDoc[] = [];
  services: Service[] = [];
  servicesSnapshotAt = "";
  alerts: Alert[] = [];
  oncall: Record<string, { primary: string; channel: string }> = {};

  constructor(private readonly dir: string) {
    this.load();
  }

  private read(name: string) {
    return readFileSync(join(this.dir, name), "utf8");
  }

  private load() {
    if (existsSync(join(this.dir, "services.json"))) {
      const s = JSON.parse(this.read("services.json"));
      this.services = s.services;
      this.servicesSnapshotAt = s.snapshot_at;
      for (const svc of this.services) {
        this.docs.push({
          id: `service:${svc.name}`,
          source: "services.json",
          text: `${svc.name} team ${svc.team} status ${svc.status} error rate ${svc.error_rate_pct}% version ${svc.version} depends on ${svc.depends_on.join(" ")}`,
          data: svc,
        });
      }
    }
    if (existsSync(join(this.dir, "alerts.json"))) {
      this.alerts = JSON.parse(this.read("alerts.json"));
      for (const a of this.alerts) {
        this.docs.push({ id: `alert:${a.id}`, source: "alerts.json", text: `${a.service} ${a.severity} ${a.message}`, data: a });
      }
    }
    if (existsSync(join(this.dir, "oncall.json"))) {
      this.oncall = JSON.parse(this.read("oncall.json"));
    }
    if (existsSync(join(this.dir, "runbooks.csv"))) {
      for (const r of parseCsv(this.read("runbooks.csv"))) {
        this.docs.push({
          id: `runbook:${r.id}`,
          source: "runbooks.csv",
          text: `${r.service} ${r.symptom} ${r.recommended_action} risk ${r.risk}`,
          data: r,
        });
      }
    }
    const kbDir = join(this.dir, "kb");
    if (existsSync(kbDir)) {
      for (const f of readdirSync(kbDir).filter((f) => extname(f) === ".md")) {
        // one doc per paragraph/bullet so search returns focused snippets
        const chunks = readFileSync(join(kbDir, f), "utf8").split(/\n(?=- |\n)/).map((c) => c.trim()).filter(Boolean);
        chunks.forEach((text, i) => this.docs.push({ id: `kb:${basename(f, ".md")}#${i}`, source: `kb/${f}`, text }));
      }
    }
  }

  search(query: string, limit = 5): KnowledgeDoc[] {
    const q = tokenize(query);
    if (q.length === 0) return [];
    const docTokens = this.docs.map((d) => tokenize(d.text));
    const df = new Map<string, number>();
    for (const toks of docTokens) for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1);
    const n = this.docs.length;
    return this.docs
      .map((doc, i) => {
        const toks = docTokens[i];
        let score = 0;
        for (const term of q) {
          const tf = toks.filter((t) => t === term).length;
          if (tf) score += (tf / toks.length) * Math.log(1 + n / (df.get(term) ?? 1));
        }
        return { doc, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.doc);
  }

  getService(name: string) {
    return this.services.find((s) => s.name === name);
  }
}
