# Virtual Lab — Development Workflow

This is the sole repository authority for development execution procedure; no other repository source may add to, modify, or override it.

## Approval breadth and execution breadth

When the owner approves a sequence with language such as `go ahead`, `proceed`, `continue`, or equivalent, treat that as permission only for the explicitly named current lane/epic and its already-bounded tasks. Never infer permission to enter the next epic, roadmap phase or major feature lane.

## Default unit of execution

All development work is governed by the execution-granularity rules in this section. No interpretation of scope, intent, urgency, discovered work, or continuation may bypass those rules.

Every issue must state exactly one `Execution owner`: a development agent (currently **ChatGPT** or **Claude**), **Eliseo Ferrante**, or **Work**. No issue may be left without an owner.

Ownership is assigned in this order:
1. **The development agent that planned the ticket** (ChatGPT or Claude) by default.
2. **Eliseo Ferrante** only when strictly necessary owner testing is a blocker to completing the ticket. Before handing over, the owning agent must prepare everything and tell Eliseo exactly what to do, including any exact prompts, copy-paste text, URLs, or steps required.
3. **Work** only when neither of the above applies and the required work can only be performed in Work.

Do not hand work to the owner or to Work while a development agent can do it.

Default to **one substantial, independently testable ticket at a time**.

A single owner turn may authorize planning or creation of multiple tickets, but execution may proceed through only **one substantial ticket**. Complete that ticket through the full closed loop and then stop. Do not begin the next substantial ticket until a later owner turn explicitly continues the work.

When splitting work into tickets, choose substantial, coherent, independently testable units that are small enough to be completed through the full closed loop in one execution chunk. Avoid both oversized tickets that combine multiple separable capabilities and trivial tickets that fragment one natural change.

When an approved epic/scope is split into tickets, record for each ticket which of these is true:
- **a known successor exists** — name the exact next ticket and explain its purpose in plain language;
- **this ticket finishes the currently approved epic scope**.

Keep that relationship current if the plan changes. It is project-state metadata, not a reason to start the successor in the same owner turn.

For each substantial user-facing/deployable ticket:

1. implement and test. CI then checks the exact built version in a real browser before publishing it (pre-publish smoke). If that check fails, the version is not published (the live Lab stays on the last green version), the run counts as **red**, and step 6 applies. A pre-publish failure never completes the ticket;
2. deploy the exact candidate;
3. follow only that exact candidate using bounded exact-run status checks. An agent that can run commands uses `node web/scripts/wait-for-run.mjs <sha>`; an agent without a shell follows the same run through its GitHub connector. Either way the result is one of the *Exact-run outcomes* below;
4. while it is pending, keep the chat visibly alive; pending checks must not inspect jobs/logs repeatedly;
5. if the exact candidate is green, stop immediately; one green is terminal and no further Actions query is made;
6. if it is red, diagnose, repair, and repeat with the repaired candidate;
7. continue until green unless there is a real blocker or the owner tells you to stop.

Local/static success is necessary but never sufficient for deployed-product completion.

## Chunk stopping rule

A conversational/approval chunk may stop only when the active deployable ticket is:

- **production green**, or
- blocked by a **specific real condition** that prevents continuation with the currently available environment or authority.

A red CI/smoke result, a queued/in-progress exact run, elapsed time, repeated failed attempts, task complexity, or conversation size is not a blocker by itself. Keep that failure inside the same approved ticket and repair it. Do not leave production red merely because the conversation has reached a convenient stopping point.

If a failed candidate has materially degraded production and the last verified green state can be restored safely, restore that state before stopping at a real blocker.

## Visible liveness rule

Verification follows only the exact current candidate SHA/run needed for the active ticket. Never wait for repository-wide Actions state or unrelated activity.

Pending verification is bounded. Repeated job/step/log polling is not a liveness mechanism; job/log inspection is used only after a terminal red result for diagnosis.

While external work is pending and control is available, provide meaningful owner-visible progress roughly every 30 seconds and never deliberately remain silent for more than about 50 seconds.

Do not run a second green candidate merely for reassurance. The first verified green candidate completes the loop.

### Exact-run outcomes

Following an exact candidate ends in exactly one of these outcomes (the exit codes of `web/scripts/wait-for-run.mjs`). **Only green completes a ticket.** Every other outcome requires the stated action and never counts as completion:

- **green** — the candidate is built, pre-publish verified, deployed and live-verified. This completes the loop.
- **red** — diagnose the named failing job/step, repair, and follow the repaired candidate.
- **superseded** — a newer push replaced this run. Follow the newer candidate; the ticket completes only when a green candidate contains its change. A running release on `main` is never cancelled halfway; when several pushes queue, GitHub keeps only the newest pending one.
- **not-a-candidate** — every changed file is documentation excluded from CI; nothing was deployed. This is not completion of a deployable ticket.
- **no-run** — a run was expected but did not start; start it with `workflow_dispatch`. This is not a blocker.
- **timeout** — the run is still going after the time limit. Report it as still pending with its link, never assume a result, and keep following the same run; a pending run is not a blocker.

Work/browser/computer verification is valid completion evidence when appropriate to the affected deployed behavior. Long-running scientific benchmarks that are not product-completion gates may remain autonomous outside the completion loop.

Never create a scheduled task, reminder, watchdog or automation unless the owner explicitly requests one.

## Production smoke browser structure

Manifest-driven production browser smoke uses one shared Chrome host from `web/scripts/smoke-browser-harness.mjs`. Each surface check receives its own isolated browser context/target through that harness, so cookies, local storage, auth state and test mutations remain isolated without launching another Chrome process.

New product surfaces and regression checks must reuse this shared harness. Do not add a production smoke script that imports `node:child_process`, launches `google-chrome`, or configures its own remote-debugging port. Add assertions to an existing smoke scope when they naturally belong there, or add a new manifest smoke script that obtains its isolated session from `createSmokeSession`.

The browser/compiler contract test enforces this structure for every active smoke entry in `web/product-surface.json`.

The same active smoke checks also run before publishing, against the exact built package served locally by `web/scripts/pre-publish-smoke.mjs` (also on pull requests). They must therefore stay read-only and must not require signing in.

## When batching is acceptable

Batch related implementation steps inside the **one active ticket** when that preserves one coherent independently verifiable unit. Once work has been split into separate tickets, do not execute a second ticket in the same owner turn, even when the owner authorized or created the whole sequence.

## Epic completion state

When the final ticket of the currently approved epic scope completes, **close the epic by default**.

Keep the epic open but dormant only when the conversation and nature of the work show that it is intentionally a recurring domain under which future work naturally belongs. The agent should proactively make and state that judgment; the owner may correct it. Dormant means there is no current executable child. For recurring/living epics, consult `ROADMAP.md` under `## Roadmap state classification`, including any domain-specific authority referenced there, before deciding that the epic is dormant, complete, or has no remaining backlog. If the case is unclear, close the epic; reopening it later is cheap.

## Atomic compatibility exception

If two changes truly cannot be deployed safely except atomically, document why before combining them. Prefer bounded compatibility layers and staged deployment when that preserves a clean ticket boundary.

## Reporting rule

Owner-facing communication must be **human-readable first**. Repository authorities may use technical names, issue numbers, taxonomy labels and compact implementation language, but status, recovery, roadmap and completion answers must translate that material into ordinary language before presenting it to the owner.

Assume the owner may not remember decisions or terminology from earlier days. Give enough context to recognize what each item actually means, what has already been done, what remains, and why its current state matters. Do not answer by dumping or lightly reformatting `ROADMAP.md`, `CURRENT_STATUS.md`, issue titles, taxonomy categories, commit text or other repository metadata.

Issue numbers, epic names and formal roadmap categories are supporting references only. When useful, pair them with a short human explanation rather than expecting the owner to decode them.

Owner-facing reports must answer three human questions directly:
- What just finished and was production-verified?
- Is there anything the owner needs to do now?
- What work happens next?

Never use `complete`, `fixed`, `deployed`, or `production-verified` for a deployable task before exact-candidate production verification is green.

Owner-facing deployment notifications are success-only; failures remain inside the repair loop.

Do not expect the owner to remember bare issue numbers; pair identifiers with semantic names when identifiers are useful.

Production success reports must separate product meaning from verification evidence:
- **What changed for you** states the owner-facing effect of the deployed change, not CI status.
- **Next** states the concrete owner action when one exists; otherwise it says plainly that no owner action is required.
- **Technical evidence** contains the commit/run links and build/deploy/exact-candidate/smoke verification facts.

Every deployable candidate must update `.github/terminal-report.json` in that same candidate. The success report has exactly **two** legal `Next` states:

1. **Epic continues** — a known successor ticket exists. Name it, explain in ordinary language what it will add, and make clear that it has not started yet. Do not start it in the same owner turn.
2. **Approved epic scope is complete** — summarize in ordinary language what the epic/scope achieved, state whether the epic is being closed or left dormant under the rule above, and point the owner to the live Lab where the completed capability is available to use/test.

There is no generic or inferred fallback. `.github/terminal-report.json` uses `vlab.terminal-report/2` and must encode one of those two states. Missing, stale or invalid report data makes the success-report step fail rather than inventing a `Next` message.

Do not use generic continuation text such as `continue with the next approved development task` or `Nothing. This change is complete.`.
