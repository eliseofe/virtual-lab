# Virtual Lab — Agent Instructions

## CLOSED LOOP + VISIBLE LIVENESS — READ THIS BEFORE ANYTHING ELSE

The project contract is: **do not report work as complete until the actual deployed product has been verified where deployment applies.**

For every substantial user-facing/deployable task, the completion loop is:

1. implement and test;
2. deploy the exact candidate;
3. follow only that exact candidate;
4. while external work is pending, keep the chat visibly alive with meaningful updates roughly every 30 seconds; never deliberately stay silent for more than about 50 seconds while control is available;
5. if the exact candidate is green, stop; one green is enough;
6. if it is red, diagnose, repair, and repeat with the repaired candidate;
7. continue until green unless there is a real blocker or the owner tells you to stop.

**Never call a task fixed, complete, deployed, or production-verified before the deployed candidate is green.** Local/static success alone is not completion.

A real blocker is a concrete condition that prevents continuation with the currently available environment or authority. Failed attempts, elapsed time, task complexity, conversation size, red CI/smoke, or a queued/in-progress exact run are not blockers by themselves. Keep the failure inside the same approved task and continue the repair loop.

Track only the exact current candidate SHA/run needed for the active task. Never infer completion from repository-wide Actions state or unrelated activity. Do not run a second green candidate merely for reassurance: the first verified green candidate completes the loop.

Work/browser/computer verification is valid completion evidence when it is the appropriate way to verify the affected deployed behavior. Long-running scientific benchmarks that are not product-completion gates may remain autonomous outside the agent loop.

Do not create scheduled tasks, reminders, watchdogs or automations unless the owner explicitly requests them.

## Start here

1. Read `CURRENT.md` completely.
2. Read the active issue for the task.
3. Read only the specific technical/design files needed for that issue.
4. Consult `PROJECT_CONTROL.md` or `PROJECT_STATE.md` only when deeper strategy/contracts/evidence are materially needed.

Do **not** reconstruct the roadmap from issue chronology, branch counts, the newest commit, or broad GitHub Actions history.

## Mandatory operating rules

- One substantial independently testable/deployable ticket at a time unless the owner's current instruction explicitly authorizes a broader bounded pass.
- Close the loop before reporting completion: implementation/testing → exact-candidate deployment → affected deployed behavior verification → durable issue/state update.
- While external work is pending and control is available, keep the chat visibly alive with meaningful updates roughly every 30 seconds and never deliberately stay silent for more than about 50 seconds.
- A work chunk ends production-green or at a real blocker; never end merely because verification is red/in progress or because the conversational chunk feels large.
- Track only the exact current candidate SHA/PR/run needed for the active task; never infer completion from unrelated repository activity.
- Keep current truth in `CURRENT.md`; update it whenever active priority, blocker or next action changes materially.
- `web/product-surface.json` is the machine-readable source of truth for what users can use in the Lab today and required production smoke coverage. Every active user-facing surface must retain deployed smoke coverage.
- `CURRENT.md` remains the source of truth for what work is being done now/next. Keep the manifest's `work_tracking` aligned with it.
- Preserve the scientific guardrails in `CURRENT.md` and `PROJECT_STATE.md`. Software architecture reasoning is allowed; new scientific/model reasoning requires explicit owner authorization.
- When an old issue/document conflicts with later accepted/current state, repair the stale source instead of making the owner repeat a resolved decision.
- User-facing issue references must pair number and meaning; do not expect humans to remember bare issue numbers.

## Deep references

- `PROJECT_CONTROL.md`: current strategy, sequencing and major dependencies.
- `PROJECT_STATE.md`: stable deployed contracts and accepted technical state.
- `web/product-surface.json`: current user-facing Lab surface and production-smoke contract.
- `docs/EXECUTION_GRANULARITY.md`: execution-boundary rules.
- `docs/CAPABILITY_GENERALIZATION_GATE.md`: required before new paper-driven simulator capabilities.

Git history and closed issues are historical evidence, not startup context.
