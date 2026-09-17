# Virtual Lab — Current Session Bootstrap

Updated: 17 September 2026

This is the first repository file to read in a new ChatGPT/Work session. It contains only current truth needed to resume safely. Deep technical evidence lives in `PROJECT_STATE.md`; strategy detail lives in `PROJECT_CONTROL.md`; history lives in Git/closed issues.

## ZERO-TOLERANCE LIVENESS

**No asynchronous external process may ever sit inside the agent's execution loop.** This is an absolute project rule.

During ordinary work the agent never waits for, polls, monitors, or repeatedly checks GitHub Actions, deployment, remote benchmarks, Work/browser jobs, authentication, or any other asynchronous service. There is no exception for one quick check, an exact SHA, an exact run ID, or “just until it finishes.” A terminal GitHub write is fire-and-forget from the agent's perspective; autonomous CI owns build/deploy/smoke/reporting and the agent returns control immediately.

The same rule applies beyond GitHub Actions: no repeated external-status calls, no mid-task connector capability hunting, no broad recursive scans, and no open-ended self-directed external verification loops. Work/browser verification may be used only as one bounded invocation when explicitly required; if it does not return a terminal result, stop and return control.

**Fire-and-forget is not allowed to mean fire-and-forget-forever.** Every terminal handoff has a finite verification decision deadline: by default 20 minutes after the terminal GitHub write unless the active ticket records another bounded deadline. An independent one-shot deadline check must classify the handoff as `SUCCESS`, `FAILURE`, or `VERIFICATION TIMEOUT`. `VERIFICATION TIMEOUT` is terminal and returns the task to the agent for a later bounded diagnostic turn; it is never treated as “still pending,” and the agent never extends it through polling.

A later owner turn may explicitly request diagnosis of a specific failure or verification-timeout result. That permits bounded evidence retrieval for that failure only, never monitoring or waiting for a retry.

## What is active now

Repository detox is complete. Historical branch/run debris remains physically visible only where the available connector cannot safely delete/cancel it; it is inert and must not affect execution.

Active product lane: **frontend migration to Vite + React + TypeScript + Mantine before Studies**.

Completed migration children:
- foundation/coexistence: complete;
- application chrome migration: complete and production-verified;
- Results presentation migration: complete; React/Mantine owns visible Results controls while the existing metric/sample/canvas/persistence engine remains authoritative.

Current delivery checkpoint:
- **Authoring-shell migration**: bounded implementation delivered to `main`. React/Mantine owns the visible Authoring heading, artifact-switching controls and Apply/restart presentation through a narrow adapter; existing source buffers, compiler/validator actions, dirty/conflict behavior, persistence and single-active-editor semantics remain authoritative underneath.
- The latest repair removed two stale regression-contract failures without changing product logic.
- Autonomous CI/Pages/smoke owns terminal verification. This verification is subject to the finite deadline rule above; unresolved verification becomes `VERIFICATION TIMEOUT`, not an indefinite pending state.

**Next after Authoring reaches terminal success:** migrate the Simulation/Arena presentation around the existing canvas/worker/runtime. Separate editor-ergonomics work remains behind completion of the frontend-migration epic.

## Production and architecture

- Production Lab: https://eliseofe.github.io/virtual-lab/
- Deployment: static GitHub Pages.
- Frontend direction: progressive Vite + React + TypeScript + Mantine migration; no Next.js/SSR and no flag-day rewrite.
- Scientific/runtime authority remains the Rust/WASM kernel, worker/runtime and existing compilers/modules. React owns presentation progressively; it must not reimplement scientific state/physics.
- Runnable Experiment artifacts: Configuration, Initialization, Controller, Metrics. Empty Metrics is valid.
- Results presentation state is separate from scientific Experiment revision state.
- Raw run results are local-first ordinary files; browser-private storage/Supabase are not the scientific bulk archive.

## Current Lab surface and production smoke

`web/product-surface.json` is the machine-readable source of truth for **what users can use in the Lab today**, bounded production-smoke coverage, and the zero-tolerance execution policy.

`CURRENT.md` remains the source of truth for **what work is being done now/next**. The manifest's `work_tracking` section points back here and identifies the product surface affected by the next delivery stage.

Ordinary product work uses one autonomous CI/Pages workflow. Relevant code reaching `main` builds/tests, deploys Pages, then runs `web/scripts/run-active-product-smoke.mjs`, which derives deployed smoke coverage from `web/product-surface.json`. The agent does not inspect or wait for that workflow.

The smoke runner gives every active surface a hard bounded timeout and kills non-terminating smoke processes. The product-surface contract fails if an active surface has no smoke coverage, a registered smoke script is missing, a check lacks a hard timeout, or Actions reverts to a hand-maintained feature list.

## Hard guardrails

- Do not invent/derive/retune new scientific models, equations, parameters, controller logic, metric formulas or scientific sampling semantics without explicit owner authorization.
- Already owner-authorized scientific definitions may be reused exactly; do not ask for them again and do not alter them.
- Controller input = local observation; output = action; controller internal state is private; RNG is simulator-owned; environment applies actions.
- Global position is not an allowed robotics-controller observation unless the owner explicitly reverses that decision.
- Physics, control, rendering, metrics and persistence remain separable scheduling concerns.
- Preserve Experiment, Results, persistence, Supabase/MCP and research-AI privilege contracts unless a separately approved task changes them.

## Execution rule

Work on one substantial independently testable ticket at a time. Perform bounded local implementation/testing, update durable state/issue metadata, write `.github/terminal-report.json` at the terminal boundary, and stop. Autonomous CI performs deployment/production verification and sends the owner the result.

At that handoff, establish the finite verification deadline and one-shot independent deadline check. If success/failure cannot be established by the deadline, report `VERIFICATION TIMEOUT` and return the task to a later bounded diagnostic turn. Never convert the deadline into a polling loop.

For GitHub operations before the terminal boundary, use compact calls scoped to the current file/issue/PR. Do not use recursive whole-repository trees, Actions history, broad branch/history sweeps, or connector capability discovery.

## Source precedence

1. explicit current owner instruction;
2. this `CURRENT.md`;
3. active issue for the task;
4. `web/product-surface.json` for current Lab surface / smoke / liveness contract;
5. `PROJECT_CONTROL.md` for strategy detail;
6. `PROJECT_STATE.md` for stable technical contracts/evidence;
7. older issues/docs/Git history.

If lower-authority text is stale, repair it rather than asking the owner to repeat an already-recorded decision.
