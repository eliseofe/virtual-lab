# Virtual Lab — Agent Instructions

## Start here

1. Read `CURRENT.md` completely.
2. Read the active issue for the task.
3. Read only the specific technical/design files needed for that issue.
4. Consult `PROJECT_CONTROL.md` or `PROJECT_STATE.md` only when deeper strategy/contracts/evidence are materially needed.

Do **not** reconstruct the roadmap from issue chronology, branch counts, the newest commit, or all GitHub Actions runs.

## Mandatory operating rules

- One substantial independently testable/deployable ticket at a time unless the owner's current instruction explicitly authorizes a broader bounded maintenance pass.
- Close the loop before reporting completion: implementation → tests → deployment where applicable → actual behavior verification → durable issue/state update.
- Never infer idleness/completion from repository-wide queued/in-progress Actions. Track only the exact current SHA/PR/run IDs.
- Use compact targeted GitHub connector calls only. Do not fetch recursive whole-repository trees, repository-wide Actions collections, or broad branch/history inventories, including during maintenance; decompose maintenance into bounded targeted queries instead.
- Do not perform connector/tool capability discovery in the middle of execution. If the required operation is not already available through a known tool, stop and report the missing capability rather than searching for alternate tool schemas in the same run.
- Do not create open-ended polling loops. Verification must target a specific current SHA/PR/run and each check must terminate independently.
- Keep current truth in `CURRENT.md`; update it whenever active priority, blocker or next action changes materially.
- `web/product-surface.json` is the machine-readable source of truth for **what users can use in the Lab today** and therefore for production smoke coverage. Any user-facing capability addition, removal, replacement or migration must update that manifest in the same task when the current product surface changes. Every `active` surface must retain at least one bounded production smoke check. The Actions workflow must execute the manifest runner; never hardcode the current feature list back into workflow YAML.
- `CURRENT.md` remains the source of truth for **what work is being done now/next**. Keep the manifest's `work_tracking` reference aligned with `CURRENT.md` when delivery focus changes, so current work and the protected product surface cannot drift silently.
- Preserve the scientific guardrails in `CURRENT.md` and `PROJECT_STATE.md`. Software architecture reasoning is allowed; new scientific/model reasoning requires explicit owner authorization.
- When an old issue/document conflicts with later accepted/current state, repair the stale source instead of making the owner repeat a resolved decision.
- User-facing issue references must pair number and meaning, e.g. `#254 — application chrome migration`.

## Deep references

- `PROJECT_CONTROL.md`: current strategy, sequencing and major dependencies.
- `PROJECT_STATE.md`: stable deployed contracts and accepted technical state.
- `web/product-surface.json`: current user-facing Lab surface and required production smoke coverage.
- `docs/EXECUTION_GRANULARITY.md`: detailed execution-boundary rationale.
- `docs/CAPABILITY_GENERALIZATION_GATE.md`: required before new paper-driven simulator capabilities.

Git history and closed issues are historical evidence, not startup context.
