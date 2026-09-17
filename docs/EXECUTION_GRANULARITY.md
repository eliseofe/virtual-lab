# Virtual Lab — Execution Granularity

This is a mandatory project-process rule.

## Approval breadth and execution breadth

When the owner approves a sequence with language such as `go ahead`, `proceed`, `continue`, or equivalent, treat that as permission only for the explicitly named current lane/epic and its already-bounded tasks. Never infer permission to enter the next epic, roadmap phase or major feature lane.

## Default unit of execution

Default to **one substantial, independently testable ticket at a time**.

For each substantial ticket:

1. implement only that ticket;
2. run bounded deterministic local/static checks available in the current environment;
3. repair deterministic failures within the ticket;
4. update durable repository state and issue metadata;
5. write the single terminal report and repository commit;
6. let CI/build/deploy/smoke run independently as a non-blocking regression signal;
7. if the owner already authorized a subsequent bounded ticket within the same named lane, continue to it without polling/waiting for CI.

CI can fail. A later observed failure becomes a bounded repair task for the exact failing commit/run; it is not a reason to place the ordinary workflow into a pending state.

## Liveness rule

Never wait for, poll, monitor, or repeatedly query an asynchronous external process from the assistant execution loop. This includes GitHub Actions, Pages deployment, remote benchmarks, Work/browser/computer jobs, authentication/device flows, and remote service state.

Deployment and production verification are not agent-side waiting steps. They run independently and may be checked once when the owner asks for current status or when a deployment result is needed for an immediate user-facing handoff.

Never create a scheduled task, reminder, watchdog or automation unless the owner explicitly requests one.

Local deterministic edit/test/repair iterations are allowed when each invocation has a finite synchronous boundary. Long-running benchmarks belong outside the assistant feedback loop.

## When batching is acceptable

Adjacent tickets may be batched only when each is genuinely small/trivial, low-risk, and the combined work still forms one clear testable unit. Otherwise retain separate commits/issues even when the owner has authorized the whole sequence.

## Atomic compatibility exception

If two changes truly cannot be deployed safely except atomically, document why before combining them. Prefer bounded compatibility layers and staged deployment when that preserves a clean ticket boundary.

## Reporting rule

Owner-facing reports must answer three human questions directly:
- What just finished?
- Is there anything the owner needs to do now?
- What work happens next?

Do not expect the owner to remember bare issue numbers; pair identifiers with semantic names when identifiers are useful.
