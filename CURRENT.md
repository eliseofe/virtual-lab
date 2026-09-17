# Virtual Lab — Current Session Bootstrap

Updated: 17 September 2026

This is the first repository file to read in a new ChatGPT/Work session. It contains only current truth needed to resume safely. Deep technical evidence lives in `PROJECT_STATE.md`; strategy detail lives in `PROJECT_CONTROL.md`; history lives in Git/closed issues.

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
- #254 — application chrome migration: complete and production-verified. PR #256 repaired Account-dialog focus return and merged to `main`; exact verification run `35209915551` passed build, Pages deploy, and all active-product smoke checks.

**Next planned stage: Results presentation.** #251 defines this as migrating Results controls/panels and absorbing the existing series-selection and Follow-live requirements while preserving metric runtime/sample/persistence contracts. No dedicated #251.3 child issue exists yet; do not infer one from history or create one unless the current task explicitly calls for decomposition/execution.

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

Ordinary product work uses one automatic CI/Pages workflow. PRs build/typecheck/test without deployment. `main` builds/tests, deploys Pages, then calls `web/scripts/run-active-product-smoke.mjs`, which derives the deployed smoke suite from `web/product-surface.json`. The workflow YAML must not contain a hand-maintained list of current feature smoke scripts.

The product-surface contract test fails if an active surface has no smoke coverage, if a registered smoke script is missing, if a check has no hard timeout, if the next tracked product surface is unknown, or if Actions reverts to hardcoded feature smoke commands.

Historical benchmark/performance workflows remain removed. Profiling scripts/evidence remain available for targeted performance work without automatic Actions fan-out.

Success reporting remains one GitHub-only terminal-success email. Reports are **high-level first** (outcome, owner impact, remaining action/caveat), with short technical evidence underneath only when useful. The notifier acts only after an explicit `notify-success` marker change; ordinary protocol edits do not resend old reports.

## Hard guardrails

- Do not invent/derive/retune new scientific models, equations, parameters, controller logic, metric formulas or scientific sampling semantics without explicit owner authorization.
- Already owner-authorized scientific definitions may be reused exactly; do not ask for them again and do not alter them.
- Controller input = local observation; output = action; controller internal state is private; RNG is simulator-owned; environment applies actions.
- Global position is not an allowed robotics-controller observation unless the owner explicitly reverses that decision.
- Physics, control, rendering, metrics and persistence remain separable scheduling concerns.
- Preserve Experiment, Results, persistence, Supabase/MCP and research-AI privilege contracts unless a separately approved task changes them.

## Execution rule

Work on one substantial independently testable/deployable ticket at a time. Close the loop: implement → test → deploy when applicable → verify actual artifact → update durable state/issue → report.

**Never wait for the repository-wide Actions queue to become empty.** Track only the exact workflow run IDs/SHA/PR belonging to the current task.

For GitHub operations, use compact calls scoped to the current file/issue/PR/SHA. Do not use recursive whole-repository trees, all-runs payloads, broad branch/history sweeps, or connector capability discovery. If a required operation is unavailable through a known connector action, stop and report it instead of searching for alternate tool schemas.

## Source precedence

1. explicit current owner instruction;
2. this `CURRENT.md`;
3. active issue for the current task;
4. `web/product-surface.json` for the current user-facing Lab surface / production-smoke contract;
5. `PROJECT_CONTROL.md` for strategy detail;
6. `PROJECT_STATE.md` for stable technical contracts/evidence;
7. older issues/docs/Git history.

If lower-authority text is stale, repair it rather than asking the owner to repeat an already-recorded decision.
