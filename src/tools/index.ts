import { z } from "zod";
import { mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineTool, type ToolDef } from "./registry.js";

let ticketCounter = 0;

function outbox(dir: string, file: string, line: unknown) {
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, file), JSON.stringify(line) + "\n");
}

export const searchKnowledge = defineTool({
  name: "search_knowledge",
  description: "Keyword search across all internal sources (services, alerts, runbooks, policies). Returns snippets with their source.",
  risk: "read",
  schema: z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(10).optional() }),
  run: ({ query, limit }, { kb }) => kb.search(query, limit ?? 5).map((d) => ({ id: d.id, source: d.source, text: d.text })),
});

export const getServiceStatus = defineTool({
  name: "get_service_status",
  description: "Read the service snapshot for one service, plus its alerts. Includes the snapshot timestamp so you can spot stale data.",
  risk: "read",
  schema: z.object({ service: z.string() }),
  run: ({ service }, { kb }) => {
    const svc = kb.getService(service);
    if (!svc) return { error: `Unknown service "${service}"`, known: kb.services.map((s) => s.name) };
    return { snapshot_at: kb.servicesSnapshotAt, service: svc, alerts: kb.alerts.filter((a) => a.service === service) };
  },
});

export const listAlerts = defineTool({
  name: "list_alerts",
  description: "List current alerts, newest first, optionally filtered by minimum severity.",
  risk: "read",
  schema: z.object({ min_severity: z.enum(["low", "medium", "high"]).optional() }),
  run: ({ min_severity }, { kb }) => {
    const rank = { low: 0, medium: 1, high: 2 } as Record<string, number>;
    const min = rank[min_severity ?? "low"];
    return [...kb.alerts].filter((a) => (rank[a.severity] ?? 0) >= min).sort((a, b) => b.at.localeCompare(a.at));
  },
});

export const getOncall = defineTool({
  name: "get_oncall",
  description: "Who is on call for a team and which channel to notify.",
  risk: "read",
  schema: z.object({ team: z.string() }),
  run: ({ team }, { kb }) => kb.oncall[team] ?? { error: `No on-call entry for team "${team}"` },
});

export const recallMemory = defineTool({
  name: "recall_memory",
  description: "Look up what happened in earlier runs (past incidents, decisions and outcomes).",
  risk: "read",
  schema: z.object({ query: z.string() }),
  run: ({ query }, { memory }) => memory.recall(query, 5),
});

export const createTicket = defineTool({
  name: "create_ticket",
  description: "Open an incident ticket for a team. Use evidence from the knowledge sources in the body.",
  risk: "write",
  schema: z.object({
    team: z.string(),
    title: z.string(),
    severity: z.enum(["low", "medium", "high"]),
    body: z.string(),
  }),
  run: (args, { outboxDir }) => {
    ticketCounter += 1;
    const ticket = { id: `INC-${Date.now().toString().slice(-5)}${ticketCounter}`, ...args, created_at: new Date().toISOString() };
    outbox(outboxDir, "tickets.jsonl", ticket);
    return { created: ticket.id };
  },
});

export const notifyOncall = defineTool({
  name: "notify_oncall",
  description: "Send a message to a team's on-call channel (simulated: written to the outbox).",
  risk: "write",
  schema: z.object({ channel: z.string(), message: z.string() }),
  run: (args, { outboxDir }) => {
    outbox(outboxDir, "notifications.jsonl", { ...args, sent_at: new Date().toISOString() });
    return { delivered: true, channel: args.channel };
  },
});

export const restartService = defineTool({
  name: "restart_service",
  description: "Restart a service's pods (simulated). Production change: needs human approval.",
  risk: "critical",
  schema: z.object({ service: z.string() }),
  run: ({ service }, { kb, outboxDir }) => {
    if (!kb.getService(service)) throw new Error(`Unknown service "${service}"`);
    outbox(outboxDir, "changes.jsonl", { action: "restart", service, at: new Date().toISOString() });
    return { restarted: service };
  },
});

export const rollbackDeploy = defineTool({
  name: "rollback_deploy",
  description: "Roll a service back to its previous version (simulated). Production change: needs human approval.",
  risk: "critical",
  schema: z.object({ service: z.string(), from_version: z.string() }),
  run: ({ service, from_version }, { kb, outboxDir }) => {
    const svc = kb.getService(service);
    if (!svc) throw new Error(`Unknown service "${service}"`);
    if (svc.version !== from_version) throw new Error(`${service} is on ${svc.version}, not ${from_version}`);
    outbox(outboxDir, "changes.jsonl", { action: "rollback", service, from_version, at: new Date().toISOString() });
    return { rolled_back: service, from_version };
  },
});

export const writeReport = defineTool({
  name: "write_report",
  description: "Write a markdown report for humans (summary of findings and actions).",
  risk: "write",
  schema: z.object({ title: z.string(), markdown: z.string() }),
  run: ({ title, markdown }, { outboxDir }) => {
    mkdirSync(outboxDir, { recursive: true });
    const file = join(outboxDir, `report-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.md`);
    writeFileSync(file, `# ${title}\n\n${markdown}\n`);
    return { path: file };
  },
});

export const allTools: ToolDef[] = [
  searchKnowledge,
  getServiceStatus,
  listAlerts,
  getOncall,
  recallMemory,
  createTicket,
  notifyOncall,
  restartService,
  rollbackDeploy,
  writeReport,
];
