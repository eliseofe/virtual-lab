# Virtual Lab — Agent Instructions

## ZERO-TOLERANCE EXECUTION SAFETY — READ BEFORE ANY TOOL CALL

**ABSOLUTE RULE: during ordinary Virtual Lab product work or maintenance, the agent must NEVER inspect, monitor, poll, wait on, or query GitHub Actions execution state.**

This prohibition includes workflow-run, job, step, log, queue, check-status, commit-status and Actions-history APIs. It is not limited to the same turn, an exact SHA, an exact run ID, or repeated polling. There is no permitted “one quick check.” GitHub Actions are fire-and-forget remote CI/deploy/smoke/report infrastructure only; they are never part of the agent execution loop.

The sole exception is a separate diagnostic turn explicitly requested by the owner for a specific failed run or failure notification. In that diagnostic turn, inspect only the supplied failed run/evidence as needed to diagnose it; do not poll or wait for state changes.

A normal task ends after the terminal-report write. CI independently performs build → deploy → manifest-driven production smoke → one success/failure notification. The agent returns control immediately and does not verify CI state itself.

## Start here

1. Read `CURRENT.md` completely.
2. Read the active issue for the task.
3. Read only the specific technical/design files needed for that issue.
4. Consult `PROJECT_CONTROL.md` or `PROJECT_STATE.md` only when deeper strategy/contracts/evidence are materially needed.

Do **not** reconstruct the roadmap from issue chronology, branch counts, the newest commit, or GitHub Actions history.

## Mandatory operating rules

- One substantial independently testable/deployable ticket at a time unless the owner's current instruction explicitly authorizes a broader bounded maintenance pass.
- GitHub Actions verification is autonomous and completely outside the agent loop. The absolute prohibition above governs all ordinary execution.
- A terminal task delivery updates `.github/terminal-report.json` exactly once with a high-level outcome, owner impact, remaining action/caveat, optional technical evidence, and optional issue number to close. CI itself performs build → deploy → manifest-driven production smoke, then sends the owner one bot-authored success or failure notification. The agent returns control immediately after the terminal-report write.
- Use compact targeted GitHub connector calls only. Do not fetch recursive whole-repository trees, GitHub Actions execution state/history, or broad branch/history inventories, including during maintenance; decompose maintenance into bounded targeted queries instead.
- Do not perform connector/tool capability discovery in the middle of execution. If the required operation is not already available through a known tool, stop and report the missing capability rather than searching for alternate tool schemas in the same run.
- Keep current truth in `CURRENT.md`; update it whenever active priority, blocker or next action changes materially.
- `web/product-surface.json` is the machine-readable source of truth for **what users can use in the Lab today** and therefore for production smoke coverage. Any user-facing capability addition, removal, replacement or migration must update that manifest in the same task when the current product surface changes. Every `active` surface must retain at least one bounded production smoke check. The Actions workflow must execute the manifest runner; never hardcode the current feature list back into workflow YAML.
- `CURRENT.md` remains the source of truth for **what work is being done now/next**. Keep the manifest's `work_tracking` reference aligned with `CURRENT.md` when delivery focus changes, so current work and the protected product surface cannot drift silently.
- Preserve the scientific guardrails in `CURRENT.md` and `PROJECT_STATE.md`. Software architecture reasoning is allowed; new scientific/model reasoning requires explicit owner authorization.
- When an old issue/document conflicts with later accepted/current state, repair the stale source instead of making the owner repeat a resolved decision.
- User-facing issue references must pair number + meaning, e.g. `#254 — application chrome migration`.

## Deep references

- `PROJECT_CONTROL.md`: current strategy, sequencing and major dependencies.
- `PROJECT_STATE.md`: stable deployed contracts and accepted technical state.
- `web/product-surface.json`: current user-facing Lab surface and required production smoke coverage.
- `docs/EXECUTION_GRANULARITY.md`: detailed execution-boundary rationale.
- `docs/CAPABILITY_GENERALIZATION_GATE.md`: required before new paper-driven simulator capabilities.

Git history and closed issues are historical evidence, not startup context.
