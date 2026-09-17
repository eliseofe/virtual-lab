# Virtual Lab — Execution Granularity

This is a mandatory project-process rule.

## Approval breadth and execution breadth

When the owner approves a sequence with language such as `go ahead`, `proceed`, `continue`, or equivalent, treat that as permission only for the explicitly named current lane/epic and its already-bounded tasks. Never infer permission to enter the next epic, roadmap phase or major feature lane.

## Default unit of execution

Default to **one substantial, independently testable ticket at a time**.

For each substantial user-facing/deployable ticket:

1. implement only that ticket;
2. run bounded deterministic local/static checks available in the current environment;
3. repair deterministic failures within the ticket;
4. create the exact candidate repository state;
5. verify that exact candidate through CI/build;
6. verify that exact candidate deploys;
7. run bounded production smoke/browser verification for the affected deployed behavior;
8. if any verification fails, diagnose and repair that exact failure, then repeat the bounded loop for the repaired candidate;
9. only after the exact deployed candidate is green, update durable completion state, close the ticket where appropriate, and report completion;
10. only then move to the next substantial ticket.

Local/static success is necessary but never sufficient for deployed-product completion.

## Chunk stopping rule

A conversational/approval chunk may stop only when the active deployable ticket is:

- **production green**, or
- blocked by a **specific external/authority/technical condition** that cannot be repaired in the currently available environment.

A red CI/smoke result, a queued/in-progress exact run, or another directly related completion-gate defect is not a valid chunk boundary by itself. Keep that failure inside the same approved ticket and repair it. Do not leave production red merely because the conversation has reached a convenient stopping point.

## Bounded liveness rule

The closed loop must be structurally terminating.

Verification may inspect only the exact current candidate SHA/run needed for the active ticket. Every local test, workflow job, deployment/status check, browser process and production smoke invocation must have a finite timeout or finite retry bound.

Do not perform repository-wide Actions monitoring, broad run-history scans, open-ended polling, `wait until successful` loops, or repeated same-purpose status calls without a fixed bound.

Repair/re-verification itself is finite: after the first candidate, a single approved chunk may create at most **three repaired exact candidates**. If the task would require another repair candidate, stop and record the exact unresolved blocker/evidence rather than continuing indefinitely. Do not start unrelated work. If the current candidate has materially degraded production and a previously verified green state can be restored safely, restoring that green state is the priority before ending the chunk.

A timeout, wedged external process or unavailable verification service is a **terminal verification failure**. Stop waiting, record the exact blocker and leave the ticket unverified. Do not convert failure to success and do not move substantial product work past an unresolved completion gate.

Work/browser/computer verification is valid completion evidence when appropriate to the affected deployed behavior, provided each invocation is bounded. Long-running scientific benchmarks that are not product-completion gates may remain autonomous outside the completion loop.

Never create a scheduled task, reminder, watchdog or automation unless the owner explicitly requests one.

## When batching is acceptable

Adjacent tickets may be batched only when each is genuinely small/trivial, low-risk, and the combined work still forms one clear independently verifiable deployed unit. Otherwise retain separate commits/issues even when the owner has authorized the whole sequence.

## Atomic compatibility exception

If two changes truly cannot be deployed safely except atomically, document why before combining them. Prefer bounded compatibility layers and staged deployment when that preserves a clean ticket boundary.

## Reporting rule

Owner-facing reports must answer three human questions directly:
- What just finished and was production-verified?
- Is there anything the owner needs to do now?
- What work happens next?

Never use `complete`, `fixed`, `deployed`, or `production-verified` for a deployable task before exact-candidate production verification is green.

Do not expect the owner to remember bare issue numbers; pair identifiers with semantic names when identifiers are useful.
