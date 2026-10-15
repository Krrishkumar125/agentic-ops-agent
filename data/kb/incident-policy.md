# Incident policy

- Severity high alerts on customer-facing services (payments-api, notifications) need a ticket within 15 minutes.
- Rollbacks and restarts are production changes. They require human approval.
- If the service snapshot and live alerts disagree, trust the newer timestamp and say so in the ticket.
- Always notify the owning team's on-call when you open a high severity ticket.
