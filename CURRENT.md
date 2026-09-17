# Virtual Lab — Current Session Bootstrap

Updated: 17 September 2026

This is the first repository file to read in a new ChatGPT/Work session. It contains only current truth needed to resume safely. Deep technical evidence lives in `PROJECT_STATE.md`; strategy detail lives in `PROJECT_CONTROL.md`; history lives in Git/closed issues.

## ZERO-TOLERANCE AGENT/ACTIONS BOUNDARY

**Ordinary Virtual Lab execution must NEVER include agent-side GitHub Actions inspection or waiting.** GitHub Actions are autonomous fire-and-forget infrastructure only.

The agent must not call workflow-run, job, step, log, queue, check-status, commit-status or Actions-history APIs during normal product work or maintenance. This is absolute: not for an exact SHA, not for an exact run ID, not once, and not “just to see whether it finished.”

The only exception is a separate owner-requested diagnostic turn for a specific failure notification/run. Even then: inspect the supplied failed run/evidence only; never poll or wait for a state transition.

Normal task boundary: implement → update durable state → write `.github/terminal-report.json` → STOP. CI independently builds, deploys, runs manifest-driven production smoke and sends one success/failure notification.

## What is active now

**Repository detox is complete.** Historical branch/run debris remains physically visible only where the available connector cannot safely delete/cancel it; it is inert and must not affect execution.

Completed detox:
- #258 — CI minimization: complete. Historical automatic benchmark/performance workflows were removed.
- #259 — repository memory fast-forward: complete. New sessions start from this compact file rather than historical reconstruction.
- #260 — execution debris / branch hygiene: complete at the available-control boundary. Stale run `34748709587` and undeletable historical branches are inert; never use them for completion/idleness.
- #257 — repository detoxification epic: complete.

Active product lane: **#251 — Progressive frontend migration to Vite + React + TypeScript + Mantine before Studies**.

Completed migration children:
- #252 — foundation/coexistence: complete.
- #254 — application chrome migration: complete and production-verified.
- #261 — Results presentation migration: implementation and production behavior were verified on exact run `35212246064`; React/Mantine now owns visible Results controls while the existing metric/sample/canvas/persistence engine remains authoritative.

**Next planned stage: Authoring shell migration** under #251. Do not begin it inside maintenance or reporting work.

## Production and architecture

- Production Lab: https://eliseofe.github.io/virtual-lab/
- Deployment: static GitHub Pages.
- Frontend direction: progressive Vite + React + TypeScript + Mantine migration; no Next.js/SSR and no flag-day rewrite.
- Scientific/runtime authority remains the Rust/WASM kernel, worker/runtime and existing compilers/modules. React owns presentation progressively; it must not reimplement scientific state/physics.
- Runnable Experiment artifacts: Configuration, Initialization, Controller, Metrics. Empty Metrics is valid.
- Results presentation state is separate from scientific Experiment revision state.
- Raw run results are local-first ordinary files; browser-private storage/Supabase are not the scientific bulk archive.

## Current Lab surface and production smoke

`web/product-surface.json` is the machine-readable source of truth for **what users can use in the Lab today**. It records the current user-facing surfaces and the bounded production smoke checks required for every surface marked `active`.

`CURRENT.md` remains the source of truth for **what work is being done now/next**. The manifest's `work_tracking` section points back here and identifies the product surface affected by the next delivery stage. Any user-facing capability addition, removal, replacement or migration must update the manifest in the same task if the current Lab surface changes.

Ordinary product work uses one automatic CI/Pages workflow. `main` builds/tests, deploys Pages, then calls `web/scripts/run-active-product-smoke.mjs`, which derives the deployed smoke suite from `web/product-surface.json`. The workflow YAML must not contain a hand-maintained list of current feature smoke scripts.

The product-surface contract test fails if an active surface has no smoke coverage, if a registered smoke script is missing, if a check has no hard timeout, if the next tracked product surface is unknown, or if Actions reverts to hardcoded feature smoke commands.

Historical benchmark/performance workflows remain removed. Profiling scripts/evidence remain available for targeted performance work without automatic Actions fan-out.

## Autonomous verification and reporting

For final delivery, the agent updates `.github/terminal-report.json` exactly once. The single CI workflow independently performs build → deploy → manifest-driven production smoke and then posts one bot-authored high-level success or failure notification. If configured, successful terminal verification also closes the task issue.

The agent never waits for, polls, checks or monitors that workflow during ordinary execution. Failure diagnosis happens only after the owner explicitly brings back a failure notification/run or asks for diagnosis.

## Hard guardrails

- Do not invent/derive/retune new scientific models, equations, parameters, controller logic, metric formulas or scientific sampling semantics without explicit owner authorization.
- Already owner-authorized scientific definitions may be reused exactly; do not ask for them again and do not alter them.
- Controller input = local observation; output = action; controller internal state is private; RNG is simulator-owned; environment applies actions.
- Global position is not an allowed robotics-controller observation unless the owner explicitly reverses that decision.
- Physics, control, rendering, metrics and persistence remain separable scheduling concerns.
- Preserve Experiment, Results, persistence, Supabase/MCP and research-AI privilege contracts unless a separately approved task changes them.

## Execution rule

Work on one substantial independently testable/deployable ticket at a time. Implement the task, update durable state/issue metadata, prepare the terminal report, write `.github/terminal-report.json`, and stop. CI performs terminal verification and owner notification autonomously.

For GitHub operations before that terminal boundary, use compact calls scoped to the current file/issue/PR. Do not use recursive whole-repository trees, Actions execution/history APIs, broad branch/history sweeps, or connector capability discovery. If a required operation is unavailable through a known connector action, stop and report it instead of searching for alternate tool schemas.

## Source precedence

1. explicit current owner instruction;
2. this `CURRENT.md`;
3. active issue for the current task;
4. `web/product-surface.json` for the current user-facing Lab surface / production-smoke contract;
5. `PROJECT_CONTROL.md` for strategy detail;
6. `PROJECT_STATE.md` for stable technical contracts/evidence;
7. older issues/docs/Git history.

If lower-authority text is stale, repair it rather than asking the owner to repeat an already-recorded decision.
