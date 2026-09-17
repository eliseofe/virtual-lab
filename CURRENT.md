# Virtual Lab — Current Session Bootstrap

Updated: 17 September 2026

This is the first repository file to read in a new ChatGPT/Work session. It contains only current truth needed to resume safely. Deep technical evidence lives in `PROJECT_STATE.md`; strategy detail lives in `PROJECT_CONTROL.md`; history lives in Git/closed issues.

## What is active now

**Maintenance override:** #257 — Repository detoxification and execution fast-forward is temporarily ahead of feature work.

- #258 — CI minimization: complete. Historical automatic benchmark/performance workflows were removed. Product changes now use one normal CI/Pages workflow; terminal-success notification uses one explicit tiny notifier run rather than every comment.
- #259 — repository memory fast-forward: complete. New sessions start from this compact file rather than mandatory historical reconstruction.
- #260 — stale execution debris / branch hygiene: active.

After detox reaches a safe checkpoint, resume **#251 — Progressive frontend migration to Vite + React + TypeScript + Mantine before Studies**.

Current migration child: **#254 — application chrome migration**. PR #255 merged the visible React/Mantine chrome to `main`, but production responsive smoke exposed an Account-dialog focus-return regression, so #254 is reopened. PR #256 contains the intended hotfix path and remains unmerged while detox is active. Do not start the Results/Authoring/Simulation/Study migration children before #254 is repaired and production-verified.

## Production and architecture

- Production Lab: https://eliseofe.github.io/virtual-lab/
- Deployment: static GitHub Pages.
- Frontend direction: progressive Vite + React + TypeScript + Mantine migration; no Next.js/SSR and no flag-day rewrite.
- Scientific/runtime authority remains the Rust/WASM kernel, worker/runtime and existing compilers/modules. React owns presentation progressively; it must not reimplement scientific state/physics.
- Runnable Experiment artifacts: Configuration, Initialization, Controller, Metrics. Empty Metrics is valid.
- Results presentation state is separate from scientific Experiment revision state.
- Raw run results are local-first ordinary files; browser-private storage/Supabase are not the scientific bulk archive.

## Hard guardrails

- Do not invent/derive/retune new scientific models, equations, parameters, controller logic, metric formulas or scientific sampling semantics without explicit owner authorization.
- Already owner-authorized scientific definitions may be reused exactly; do not ask for them again and do not alter them.
- Controller input = local observation; output = action; controller internal state is private; RNG is simulator-owned; environment applies actions.
- Global position is not an allowed robotics-controller observation unless the owner explicitly reverses that decision.
- Physics, control, rendering, metrics and persistence remain separable scheduling concerns.
- Preserve Experiment, Results, persistence, Supabase/MCP and research-AI privilege contracts unless a separately approved task changes them.

## Execution rule

Work on one substantial independently testable/deployable ticket at a time. Close the loop: implement → test → deploy when applicable → verify actual artifact → update durable state/issue → report.

**Never wait for the repository-wide Actions queue to become empty.** The repo contains historical workflow debris, including a stale queued 2026-09-13 run. Track only the exact workflow run IDs/SHA/PR belonging to the current task.

For GitHub operations, prefer compact connector calls scoped to the current file/issue/PR/SHA. Avoid broad recursive trees, all-runs payloads and branch/history sweeps unless performing explicit maintenance.

## Source precedence

1. explicit current owner instruction;
2. this `CURRENT.md`;
3. active issue for the current task;
4. `PROJECT_CONTROL.md` for strategy detail;
5. `PROJECT_STATE.md` for stable technical contracts/evidence;
6. older issues/docs/Git history.

If lower-authority text is stale, repair it rather than asking the owner to repeat an already-recorded decision.
