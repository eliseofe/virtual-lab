# Virtual Lab — Execution Granularity

This is a mandatory project-process rule.

## Approval breadth is not execution breadth

When the owner approves several tickets with language such as `go ahead`, `proceed`, or equivalent, treat that as permission to start the approved sequence. It does **not** require completing every approved ticket in one uninterrupted implementation pass.

## Default unit of execution

Default to **one substantial, independently testable ticket at a time**.

A ticket is substantial when it contains a non-trivial migration, contract/API change, deployment, cross-layer change, architectural change, or enough implementation/testing work that completing it cleanly is itself a meaningful checkpoint.

For a substantial ticket:

1. implement only that ticket;
2. run bounded local/static tests that return synchronously;
3. update durable repository state and issue metadata;
4. prepare the single terminal report;
5. write `.github/terminal-report.json` and stop;
6. autonomous CI performs build/deploy/production smoke and sends the owner success/failure;
7. begin no next substantial ticket until a later owner turn authorizes continuation, unless the owner's current instruction explicitly authorized an already-bounded sequence that contains no asynchronous wait between tickets.

**Deployment and production verification are not agent-side waiting steps.** If an asynchronous external result is needed before further work, that requirement ends the current agent turn.

## ZERO-TOLERANCE liveness rule

Never wait for, poll, monitor, or repeatedly query an asynchronous external process from the assistant execution loop. This includes GitHub Actions, Pages deployment, remote benchmarks, Work/browser/computer jobs, authentication/device flows, and remote service state.

Never transform “verify it” into “keep checking until it succeeds.” Verification that depends on asynchronous infrastructure must be autonomous and report back independently. A later owner turn may open a bounded diagnostic task for a specific failure.

Local deterministic edit/test/repair iterations are allowed only when each invocation returns synchronously and has a finite boundary. Long-running benchmarks belong outside the agent feedback loop.

## When batching is acceptable

Adjacent tickets may be batched only when each is genuinely small/trivial, low-risk, and the combined work still forms one clear testable unit without introducing an asynchronous wait between them. If scope turns out larger than expected, split immediately at the next safe boundary.

Do not combine substantial tickets merely because they are both approved, closely related, or share code.

## Atomic compatibility exception

If two changes truly cannot be deployed safely except atomically, document why before combining them. Prefer bounded compatibility layers and staged deployment when that can preserve a clean ticket boundary. Keep issue acceptance/status reporting separate.

## Reporting rule

Never hand back a mixed status when a cleaner ticket boundary was available. If bounded local work encounters a failure, repair or roll back within the current ticket. If the blocker is asynchronous/external, stop and report the exact external boundary rather than waiting.

When referring to GitHub work in owner-facing reports, pair every issue number with its semantic description.
