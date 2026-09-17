# Virtual Lab — Agent Instructions

## CLOSED LOOP + BOUNDED LIVENESS — READ THIS BEFORE ANYTHING ELSE

The project contract is: **do not report work as complete until the actual deployed product has been verified where deployment applies.**

For every substantial user-facing/deployable task, the completion loop is:

1. implement the bounded task;
2. run deterministic local/static tests available in the current environment;
3. trigger the exact candidate commit's CI/build;
4. verify that exact candidate deploys successfully;
5. exercise the affected deployed Lab behavior with bounded production smoke/browser verification;
6. if any step fails, diagnose and repair that failure and repeat the bounded verification loop for the repaired candidate;
7. only after the deployed candidate is green, record durable completion state, close the task where appropriate, and report it as complete.

**Never call a task fixed, complete, deployed, or production-verified before step 5 is green.** Local/static success alone is not completion.

A conversational/approval chunk may end only in one of two states: **production green** for the task, or a **concrete blocker** that cannot be repaired with the currently available environment/authority. Do not end a chunk merely because CI or production smoke is red, queued, or has exposed another directly related completion-gate defect. A red result stays inside the same approved task until repaired or converted into a concrete blocker.

The closed loop must also be structurally terminating. Verification may inspect only the exact current candidate SHA/run needed for the active task. Every test, browser process, workflow job, deployment check, and status-resolution operation must have a finite bound or timeout. Never perform repository-wide Actions monitoring, broad run-history scans, indefinite polling, “wait until successful” loops, or repeated same-purpose status calls without a fixed bound.

Repair/re-verification is also bounded: an approved work chunk may advance through at most **three repaired exact-candidate cycles** after the first candidate. If a fourth candidate would be required, stop the repair chain, record the concrete unresolved blocker/evidence, and do not start unrelated work. If a failed candidate has made production materially worse and a previously verified green state can be safely restored, restoring that last green state takes priority before ending the chunk.

A timeout, wedged verification process, or unavailable verification service is a **terminal verification failure**, not permission to declare success and not permission to wait forever. Record the exact blocker and leave the task unverified. When a concrete verification failure is available in the current execution, repair it before moving to another substantial product task.

Work/browser/computer verification is valid completion evidence when it is the appropriate way to verify the affected deployed behavior, but each invocation must be bounded. Long-running scientific benchmarks that are not product-completion gates may remain autonomous outside the agent loop.

Do not create scheduled tasks, reminders, watchdogs or automations unless the owner explicitly requests them.

## Start here

1. Read `CURRENT.md` completely.
2. Read the active issue for the task.
3. Read only the specific technical/design files needed for that issue.
4. Consult `PROJECT_CONTROL.md` or `PROJECT_STATE.md` only when deeper strategy/contracts/evidence are materially needed.

Do **not** reconstruct the roadmap from issue chronology, branch counts, the newest commit, or broad GitHub Actions history.

## Mandatory operating rules

- One substantial independently testable/deployable ticket at a time unless the owner's current instruction explicitly authorizes a broader bounded pass.
- Close the loop before reporting completion: implementation → tests → exact-candidate CI/build → deployment → affected deployed behavior verification → durable issue/state update.
- A work chunk ends production-green or at a concrete blocker; never end merely because verification is red/in progress or because the conversational chunk feels large.
- Track only the exact current candidate SHA/PR/run needed for the active task; never infer completion from unrelated repository activity.
- Keep current truth in `CURRENT.md`; update it whenever active priority, blocker or next action changes materially.
- `web/product-surface.json` is the machine-readable source of truth for what users can use in the Lab today and required production smoke coverage. Every active user-facing surface must retain bounded deployed smoke coverage.
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
