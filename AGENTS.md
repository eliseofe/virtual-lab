# Virtual Lab — Agent Instructions

## ZERO-TOLERANCE LIVENESS — READ THIS BEFORE ANYTHING ELSE

Ordinary Virtual Lab execution must be **structurally terminating**. The agent must never put an asynchronous external process inside its own feedback loop.

**Forbidden during ordinary execution:**
- any GitHub Actions run/job/log/queue/check/status/history API;
- waiting, polling, monitoring or repeatedly checking CI, deployment, long benchmarks, Work/browser jobs, authentication, remote services, or any other asynchronous process;
- “wait until”, “monitor until”, “repeat until successful”, or equivalent self-directed external loops;
- repeated same-purpose status calls, even for an exact SHA/run/job;
- connector/tool capability discovery in the middle of a task;
- broad recursive repository/branch/history/Actions scans.

A GitHub write may trigger autonomous CI, but **CI is never part of the agent turn**. For terminal delivery, write `.github/terminal-report.json` once and return control immediately. GitHub independently builds, deploys, runs manifest-driven production smoke, and sends the owner one success/failure notification.

Work/browser/computer verification is not an ordinary synchronous completion dependency. Use it only when explicitly required by the current owner instruction or a separately scoped diagnostic/UX task. One bounded invocation is allowed; if it does not return a terminal result, stop and return control. Never poll, retry, or wait on it in the same turn.

A later owner turn may explicitly request diagnosis of a specific failure notification/run ID. In that diagnostic turn, fetch only the bounded evidence needed to explain the failure; do not monitor, poll, or wait for a retry.

Local deterministic work may iterate inside one ticket: code edits, finite repository reads, and local/test operations that return synchronously. Long-running experiments/benchmarks must run autonomously outside the agent feedback loop; the agent does not wait for them.

## Start here

1. Read `CURRENT.md` completely.
2. Read the active issue for the task.
3. Read only the specific technical/design files needed for that issue.
4. Consult `PROJECT_CONTROL.md` or `PROJECT_STATE.md` only when deeper strategy/contracts/evidence are materially needed.

Do **not** reconstruct the roadmap from issue chronology, branch counts, the newest commit, or GitHub Actions history.

## Mandatory operating rules

- One substantial independently testable/deployable ticket at a time unless the owner's current instruction explicitly authorizes a broader bounded maintenance pass.
- Keep current truth in `CURRENT.md`; update it whenever active priority, blocker or next action changes materially.
- `web/product-surface.json` is the machine-readable source of truth for **what users can use in the Lab today**, required production smoke coverage, and the zero-tolerance agent-execution boundary. Any user-facing capability addition, removal, replacement or migration must update that manifest in the same task when the current product surface changes. Every `active` surface must retain at least one bounded production smoke check. The Actions workflow must execute the manifest runner; never hardcode the current feature list back into workflow YAML.
- `CURRENT.md` remains the source of truth for **what work is being done now/next**. Keep the manifest's `work_tracking` reference aligned with `CURRENT.md` when delivery focus changes.
- Preserve the scientific guardrails in `CURRENT.md` and `PROJECT_STATE.md`. Software architecture reasoning is allowed; new scientific/model reasoning requires explicit owner authorization.
- When an old issue/document conflicts with later accepted/current state, repair the stale source instead of making the owner repeat a resolved decision.
- User-facing issue references must pair number and meaning, e.g. `#254 — application chrome migration`.

## Deep references

- `PROJECT_CONTROL.md`: current strategy, sequencing and major dependencies.
- `PROJECT_STATE.md`: stable deployed contracts and accepted technical state.
- `web/product-surface.json`: current user-facing Lab surface, production-smoke contract, and machine-readable liveness policy.
- `docs/EXECUTION_GRANULARITY.md`: execution-boundary rules.
- `docs/CAPABILITY_GENERALIZATION_GATE.md`: required before new paper-driven simulator capabilities.

Git history and closed issues are historical evidence, not startup context.
