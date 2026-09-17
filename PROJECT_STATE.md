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
- Current frontend migration foundation (#252) is deployed; visible application chrome from #255 is on production but #254 remains reopened because of the Account focus-return regression.

## CI state after detox #258

Ordinary product work uses one automatic workflow: PR build/typecheck/tests; `main` build/test → Pages deploy → bounded production smoke. Historical performance and neighbour benchmark Actions were removed from automatic operation. Their benchmark source/examples remain available if targeted performance work needs them later.

The success-report notifier is separate and explicit: one tiny run only when the central success issue is deliberately edited after a terminal `[SUCCESS REPORT]`. Ordinary issue comments no longer trigger Actions.

Never wait for the repository-wide Actions queue to be empty. Use exact current SHA/PR/run IDs.

## Scientific guardrail

Developer-side ChatGPT must not independently invent new scientific models, derivations, paper-specific equations/parameters, controller logic, metric formulas, scientific sampling choices, retuning or claims of scientific equivalence. Already owner-authorized definitions may be reused exactly. Software architecture/performance work is allowed while preserving the scientific boundaries above.
