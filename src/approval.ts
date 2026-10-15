import { createInterface } from "node:readline/promises";

export type ApprovalMode = "ask" | "auto-approve" | "deny";

/**
 * Human-in-the-loop gate for critical actions.
 * - ask: prompt in the terminal (denies if there is no terminal)
 * - auto-approve: for demos/CI only
 * - deny: never allow critical actions
 */
export function makeApprover(mode: ApprovalMode): (summary: string) => Promise<boolean> {
  return async (summary) => {
    if (mode === "auto-approve") {
      console.log(`\n[approval] auto-approved: ${summary}`);
      return true;
    }
    if (mode === "deny" || !process.stdin.isTTY) {
      console.log(`\n[approval] denied (${mode === "deny" ? "deny mode" : "no terminal to ask"}): ${summary}`);
      return false;
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = await rl.question(`\n[approval needed] ${summary}\nApprove? (y/N) `);
      return /^y(es)?$/i.test(answer.trim());
    } finally {
      rl.close();
    }
  };
}
