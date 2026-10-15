/**
 * Recorded model replies for the default demo task, so `--mock` can show a full
 * run without API keys. These were written to mirror what a real model does on
 * this task; real runs never use this file.
 */
export const DEMO_TASK =
  "Check the health of our services, find anything customers are feeling right now, and handle it according to our runbooks and policy.";

export const demoScript: string[] = [
  JSON.stringify({
    reflection: "",
    thought: "The snapshot says payments-api is healthy but notifications is down and fraud-check degraded. Snapshot is from 09:00; I should check the newer alerts and the runbooks before acting.",
    plan: ["read alerts and runbooks", "compare with snapshot", "act per runbook", "report"],
    actions: [
      { tool: "list_alerts", args: { min_severity: "medium" }, why: "see live signals newer than the snapshot" },
      { tool: "search_knowledge", args: { query: "runbook deploy error rate rollback restart crash config" }, why: "find the runbooks that apply" },
      { tool: "search_knowledge", args: { query: "policy approval conflicting snapshot freeze" }, why: "check policy on changes and conflicting data" },
    ],
  }),
  JSON.stringify({
    reflection: "ALR-101 (09:12) shows payments-api 5xx at 7.8% after v2.14.0, which conflicts with the 09:00 snapshot saying healthy. Policy says trust the newer timestamp. RB-1 says rollback + ticket. ALR-103: notifications crash from missing SMTP_HOST, RB-3 says ticket, no restart. ALR-102: fraud-check redis pool exhaustion, RB-2 says restart + notify risk. No change freeze this week.",
    thought: "Payments is customer-facing and high severity, so rollback is justified but critical and needs approval. I also need the on-call channels before notifying.",
    plan: ["get on-call for payments, growth, risk", "rollback payments-api", "restart fraud-check", "tickets + notifications", "report"],
    actions: [
      { tool: "get_oncall", args: { team: "payments" }, why: "notify owner of payments-api" },
      { tool: "get_oncall", args: { team: "growth" }, why: "owner of notifications" },
      { tool: "get_oncall", args: { team: "risk" }, why: "owner of fraud-check" },
      { tool: "rollback_deploy", args: { service: "payments-api", from_version: "v2.14.0" }, why: "ALR-101 5xx 7.8% > 2% right after v2.14.0; RB-1; newer than snapshot per incident policy" },
      { tool: "restart_service", args: { service: "fraud-check" }, why: "ALR-102 redis pool exhausted; RB-2 says restart to reset pool" },
    ],
  }),
  JSON.stringify({
    reflection: "Got on-call channels. The approval results above tell me which production changes went through; for anything denied I will not retry and will rely on tickets and escalation instead.",
    thought: "Open tickets for high-severity customer-facing issues within 15 minutes and notify each owning team, as the policy requires.",
    plan: ["tickets", "notify on-call", "write report"],
    actions: [
      { tool: "create_ticket", args: { team: "payments", severity: "high", title: "payments-api 5xx spike after v2.14.0", body: "ALR-101 at 09:12Z: 5xx 7.8% (threshold 2%) since v2.14.0. Snapshot at 09:00Z said healthy; it is older, so treated as stale. Rollback proposed per RB-1 (see approval result)." }, why: "incident policy: high sev on customer-facing service needs a ticket" },
      { tool: "create_ticket", args: { team: "growth", severity: "high", title: "notifications down: missing SMTP_HOST after v3.2.1", body: "ALR-103: CrashLoopBackOff, env SMTP_HOST missing after v3.2.1 deploy. Per RB-3 do not restart until config is fixed." }, why: "RB-3 and incident policy" },
      { tool: "notify_oncall", args: { channel: "#payments-oncall", message: "payments-api 5xx at 7.8% after v2.14.0 (ALR-101). Rollback proposed, ticket opened." }, why: "policy: notify on-call for high sev ticket" },
      { tool: "notify_oncall", args: { channel: "#growth-oncall", message: "notifications is crash-looping: SMTP_HOST missing in v3.2.1 (ALR-103). Ticket opened; not restarting per RB-3." }, why: "policy: notify on-call for high sev ticket" },
      { tool: "notify_oncall", args: { channel: "#risk-oncall", message: "fraud-check p95 1.9s, redis pool exhausted (ALR-102). Restart proposed per RB-2." }, why: "RB-2 says notify risk on-call" },
    ],
  }),
  JSON.stringify({
    reflection: "Tickets created and all three teams notified.",
    thought: "Write a short report for humans, then finish.",
    plan: ["report", "finish"],
    actions: [
      { tool: "write_report", args: { title: "Service health 2026-10-15", markdown: "## Findings\n- payments-api: 5xx 7.8% after v2.14.0 (ALR-101). Snapshot said healthy but is older (conflict noted).\n- notifications: down, missing SMTP_HOST (ALR-103).\n- fraud-check: degraded, redis pool exhausted (ALR-102).\n- postgres-main: disk 71%, below the 85% runbook threshold, no action.\n\n## Actions\nSee tickets, notifications and approval log in the audit trail." }, why: "leave a human-readable record" },
    ],
  }),
  JSON.stringify({
    reflection: "Report written.",
    thought: "All customer-facing issues are handled per runbooks and policy.",
    plan: [],
    actions: [],
    final: {
      answer: "Three services need attention. payments-api is failing 7.8% of requests since v2.14.0 even though the older snapshot says healthy; I proposed a rollback (RB-1) and opened a high-severity ticket. notifications is down because SMTP_HOST is missing in v3.2.1; ticket opened and no restart, per RB-3. fraud-check is slow from redis pool exhaustion; I proposed a restart (RB-2) and told risk on-call. postgres-main disk at 71% is below the action threshold.",
      actions_taken: [],
      open_questions: ["Was v2.14.0 the only change to payments-api this morning?", "Who owns adding SMTP_HOST to the notifications config?"],
    },
  }),
];
