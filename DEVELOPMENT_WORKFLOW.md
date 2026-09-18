# Virtual Lab — Development Workflow

This is the single repository authority for development execution procedure.

## Approval breadth and execution breadth

When the owner approves a sequence with language such as `go ahead`, `proceed`, `continue`, or equivalent, treat that as permission only for the explicitly named current lane/epic and its already-bounded tasks. Never infer permission to enter the next epic, roadmap phase or major feature lane.

## Default unit of execution

Default to **one substantial, independently testable ticket at a time**.

For each substantial user-facing/deployable ticket:

1. implement and test;
2. deploy the exact candidate;
3. follow only that exact candidate;
4. while external work is pending, keep the chat visibly alive with meaningful updates roughly every 30 seconds; never deliberately stay silent for more than about 50 seconds while control is available;
5. if the exact candidate is green, stop; one green is enough;
6. if it is red, diagnose, repair, and repeat with the repaired candidate;
7. continue until green unless there is a real blocker or the owner tells you to stop.

Local/static success is necessary but never sufficient for deployed-product completion.

## Chunk stopping rule

A conversational/approval chunk may stop only when the active deployable ticket is:

- **production green**, or
- blocked by a **specific real condition** that prevents continuation with the currently available environment or authority.

A red CI/smoke result, a queued/in-progress exact run, elapsed time, repeated failed attempts, task complexity, or conversation size is not a blocker by itself. Keep that failure inside the same approved ticket and repair it. Do not leave production red merely because the conversation has reached a convenient stopping point.

## Visible liveness rule

Verification follows only the exact current candidate SHA/run needed for the active ticket. Never wait for repository-wide Actions state or unrelated activity.

While external work is pending and control is available, provide meaningful owner-visible progress roughly every 30 seconds and never deliberately remain silent for more than about 50 seconds.

Do not run a second green candidate merely for reassurance. The first verified green candidate completes the loop.

Work/browser/computer verification is valid completion evidence when appropriate to the affected deployed behavior. Long-running scientific benchmarks that are not product-completion gates may remain autonomous outside the completion loop.

Never create a scheduled task, reminder, watchdog or automation unless the owner explicitly requests one.

## Production smoke browser structure

Manifest-driven production browser smoke uses one shared Chrome host from `web/scripts/smoke-browser-harness.mjs`. Each surface check receives its own isolated browser context/target through that harness, so cookies, local storage, auth state and test mutations remain isolated without launching another Chrome process.

New product surfaces and regression checks must reuse this shared harness. Do not add a production smoke script that imports `node:child_process`, launches `google-chrome`, or configures its own remote-debugging port. Add assertions to an existing smoke scope when they naturally belong there, or add a new manifest smoke script that obtains its isolated session from `createSmokeSession`.

The browser/compiler contract test enforces this structure for every active smoke entry in `web/product-surface.json`.

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

Production success reports must separate product meaning from verification evidence:
- **What changed for you** states the owner-facing effect of the deployed change, not CI status.
- **Next** states the concrete owner action when one exists; otherwise it says plainly that no owner action is required.
- **Technical evidence** contains the commit/run links and build/deploy/exact-candidate/smoke verification facts.

The default report derives its change summary from the deployed commit message. Every deployable candidate must update `.github/terminal-report.json` in that same candidate so **Next** is specific to the completed work:
- if the owner must do something, state that concrete action;
- if development has a known semantic next task but no owner action is needed, name that task;
- if there is genuinely nothing to do, write exactly `Nothing. This change is complete.`.

Do not use generic continuation text such as `continue with the next approved development task`. The reporting payload enriches the notification only; it is not a new build/deploy/smoke completion gate.
