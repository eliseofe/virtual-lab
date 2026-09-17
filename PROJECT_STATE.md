# Virtual Lab — Stable Technical State

Updated: 17 September 2026

Read `CURRENT.md` first. This file records stable deployed contracts/evidence needed for implementation; historical implementation detail remains in Git and closed issues.

## Repository and production

- Repository: `eliseofe/virtual-lab`
- Production Lab: `https://eliseofe.github.io/virtual-lab/`
- Hosting: static GitHub Pages
- Registry/Auth/MCP backend: Supabase
- MCP server: `3.0.0`, interface `8`
- Registry schema: `vlab.registry-experiment/3`
- Experiment artifacts: `vlab.experiment-artifacts/3`
- Authoring contract: `vlab.authoring/0.6`
- Results presentation: `vlab.results-presentation/1`
- Runtime contract: `vlab.runtime/0.2`
- Artifact capabilities: `vlab.artifact-capabilities/0.3`
- Environment capabilities: `vlab.environment-capabilities/0.1`
- Metrics language: `python-vlab-metrics/0.1`
- Metrics IR: `vlab.metrics-ir/0.1`
- Production neighbour strategy: `adaptive-periodic-bvh/v1`

## Scientific/runtime architecture

A runnable Experiment has four compulsory authored artifacts:
1. Configuration
2. Initialization
3. Controller
4. Metrics

Empty Metrics is valid. Metrics are read-only scientific observers. Results panel/layout state is presentation state and does not create a scientific Experiment revision.

Controller boundary: local observation in, action out, private controller state, simulator-owned RNG, environment-owned action application. Global position is not an allowed robotics-controller observation unless explicitly owner-approved in the future.

Physics, control, rendering, metrics and persistence are separate scheduling concerns. Presentation/storage cadence must not change scientific dynamics or sampling semantics.

## Result persistence

Canonical raw scientific output is user-visible local files when writable-directory access is available. Browser-private storage is not the scientific archive.

```text
<VirtualLab root>/
  <Experiment>/
    runs/
      <metric-id>_000001.csv
      <other-metric-id>_000001.csv
      ...
    studies/
      <Study>/
        <metric-id>_000001.csv
        <other-metric-id>_000001.csv
        ...
```

No directory per simulation run. Future Studies use the same flat metric-file convention directly under `<Experiment>/studies/<Study>/` with **no extra `runs/` layer**.

## Accepted scientific fixture

The owner-authorized Active Elastic acceptance fixture includes:
- `polarization`: `psi = ||sum_i heading_i|| / N`;
- `angular_momentum`: separately owner-authorized normalized instantaneous milling/angular-momentum complement;
- acceptance/display sampling cadence `0.1 s`.

Reuse exactly as recorded. Do not retune/reinterpret without explicit owner authorization.

## Deployed capability state

- Metrics + live Results end-to-end path accepted.
- Local single-run result persistence accepted.
- Fine-grained MCP Metrics/Results authoring accepted.
- Professor Showcase promotion/removal/public discovery accepted with privilege hardening.
- Unified Experiment management accepted.
- Frontend migration foundation (#252) is deployed.
- React/Mantine application chrome (#254) is deployed and production-verified. PR #256 repaired Account-dialog focus return; exact run `35209915551` passed build, Pages deployment and all active-product smoke checks.
- Next #251 migration stage is Results presentation; the existing metric runtime/sample/persistence contracts remain authoritative during that migration.

## CI and execution state after detox

Ordinary product work uses one automatic CI/Pages workflow: PR build/typecheck/tests; `main` build/test → Pages deploy → one current-Lab smoke step.

Production smoke is **manifest-driven**, not a hand-maintained workflow list:
- `CURRENT.md` records what work is active/next;
- `web/product-surface.json` is the machine-readable source of truth for what user-facing Lab surfaces are active today and which bounded production checks protect them;
- `web/scripts/run-active-product-smoke.mjs` executes every smoke check attached to every surface marked `active`;
- `web/tests/product-surface-smoke.test.mjs` fails CI if an active surface has no check, a registered script is missing, a check lacks a hard timeout, the tracked next surface is unknown, or Actions reintroduces hardcoded feature smoke commands.

Any user-facing capability addition, removal, replacement or migration must update the product-surface manifest in the same task when the current Lab surface changes. This is mandatory in `AGENTS.md`, so feature delivery and production coverage cannot intentionally complete as separate bookkeeping tasks.

Current active surfaces are core Experiment/runtime, React/Mantine application shell, Metrics + live Results, local result persistence, responsive/Experiment-management/Account behavior, and Showcase. Their individual checks remain independently hard-bounded, with the overall smoke job also capped at 12 minutes.

The dedicated Results-layout browser smoke is not automatic because its active coverage overlaps the Metrics+Results and responsive checks. Historical performance and neighbour benchmark Actions were removed from automatic operation; their source/examples remain available for targeted performance work. The stale #111 contract requiring the deleted performance workflow was removed after the first clean post-detox build exposed it.

The manifest-driven architecture was production-verified on exact run `35210993471`: build, Pages deployment and `Verify deployed current Lab surface` all completed successfully.

Terminal-success reporting remains GitHub-only. Because the original connector comment is authored as `eliseofe`, reliable email requires a separate `github-actions[bot]` mention. The notifier therefore remains, but acts only after an explicit `notify-success` marker change. Success emails lead with outcome, owner impact and remaining action/caveat; concise technical evidence follows only when useful, in the same email.

Historical queued run `34748709587` and undeletable old branches are inert execution debris. Never wait for repository-wide Actions idleness and never infer current work from old branches. Track only the exact current SHA/PR/run.

## Scientific guardrail

Developer-side ChatGPT must not independently invent new scientific models, derivations, paper-specific equations/parameters, controller logic, metric formulas, scientific sampling choices, retuning or claims of scientific equivalence. Already owner-authorized definitions may be reused exactly. Software architecture/performance work is allowed while preserving the scientific boundaries above.
