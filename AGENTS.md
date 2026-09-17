# Virtual Lab — Agent Instructions

## ZERO-TOLERANCE LIVENESS — READ THIS BEFORE ANYTHING ELSE

Ordinary Virtual Lab execution must be **structurally terminating**. The agent must never put an asynchronous external process inside its own feedback loop.

**Forbidden during ordinary execution:**
- waiting, polling, monitoring or repeatedly checking CI, deployment, long benchmarks, Work/browser jobs, authentication, remote services, or any other asynchronous process;
- “wait until”, “monitor until”, “repeat until successful”, or equivalent self-directed external loops;
- repeated same-purpose status calls;
- connector/tool capability discovery in the middle of a task;
- broad recursive repository/branch/history/Actions scans;
- creating scheduled tasks, reminders, watchdogs or automations unless the owner explicitly requests them.

A GitHub write may trigger autonomous CI, but CI is **not a blocking state in the agent workflow**. Complete the bounded deterministic implementation/testing available in the current turn, write `.github/terminal-report.json`, make the terminal repository write, and return/continue according to the owner's instruction. Do not invent a “pending forever” state.

Autonomous CI/build/deploy/smoke is an independent regression signal. When the owner explicitly asks for status, or when a later turn resumes after a reported failure, perform one bounded lookup of the exact relevant run/commit. If it failed, diagnose that exact failure. If it succeeded, record the success. Never convert status resolution into a polling loop.

Work/browser/computer verification is optional diagnostic/UX tooling. Use it only when explicitly required by the current owner instruction or a separately scoped diagnostic/UX task. One bounded invocation is allowed; no polling/retry loop.

Local deterministic work may iterate inside one ticket: code edits, finite repository reads, and local/test operations that return synchronously. Long-running experiments/benchmarks must run autonomously outside the agent feedback loop.

## Start here

1. Read `CURRENT.md` completely.
2. Read the active issue for the task.
3. Read only the specific technical/design files needed for that issue.
4. Consult `PROJECT_CONTROL.md` or `PROJECT_STATE.md` only when deeper strategy/contracts/evidence are materially needed.

Do **not** reconstruct the roadmap from issue chronology, branch counts, the newest commit, or GitHub Actions history.

## Mandatory operating rules

- One substantial independently testable/deployable ticket at a time unless the owner's current instruction explicitly authorizes a broader bounded pass.
- Keep current truth in `CURRENT.md`; update it whenever active priority, blocker or next action changes materially.
- `web/product-surface.json` is the machine-readable source of truth for what users can use in the Lab today and required production smoke coverage.
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
