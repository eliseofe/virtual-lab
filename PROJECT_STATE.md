# Virtual Lab — Stable Technical State

Updated: 17 September 2026

Read `CURRENT.md` first. This file records stable technical contracts and current implementation evidence; historical implementation detail remains in Git and closed issues.

## Repository and production

- Repository: `eliseofe/virtual-lab`
- Production Lab: `https://eliseofe.github.io/virtual-lab/`
- Hosting: static GitHub Pages
- Frontend: Vite + React + TypeScript + Mantine
- Registry/Auth/MCP backend: Supabase
- Production MCP endpoint: `https://izdmmudfrmqhvlgepwes.supabase.co/functions/v1/experiment-mcp`
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

## Product implementation state

The frontend architecture migration is complete. React/Mantine owns visible application presentation while the scientific/runtime/controller/compiler/renderer engines remain authoritative outside React.

The owner has accepted the current visual system as a clean, functional baseline. Ongoing visual/UX improvement is evidence-driven through the living UI/UX lane rather than a blocker on scientific work.

Student onboarding is implemented in source as one production-Lab journey:
- self-registration and sign-in using existing Supabase Auth/RLS;
- new profiles default to Student;
- Getting started guidance plus persistent Help;
- Grok and Claude setup against the production MCP endpoint;
- a read-only first connection check;
- no second student site or mock-lab onboarding flow.

The first post-onboarding presentation cleanup humanizes Results terminology to **Metrics**, clarifies live-data state, and removes non-actionable periodic-boundary metadata from the prominent Arena heading. These are presentation-only changes.

At least one real student has successfully registered, confirmed the account and signed in. Real-use feedback can therefore drive bounded fixes immediately.

## Current deployment evidence

The visual baseline preceding student onboarding was already observed by the owner in production and accepted as usable.

The first student-onboarding deployment attempt exposed stale regression assertions inherited from earlier migration/process states. The implementation itself was not rolled back; the obsolete assertions and stale roadmap manifest were repaired on `main`. CI/Pages remains an independent non-blocking signal and must not be polled from the agent execution loop.

Do not describe student onboarding as production-verified until a later completed Pages run confirms the current source has deployed.

## CI and execution contract

- one automatic CI/Pages workflow protects `main`;
- production smoke is manifest-driven through `web/product-surface.json`;
- every active surface has a hard-bounded smoke check;
- CI/build/deploy/smoke is a non-blocking regression signal, not an assistant waiting gate;
- later observed failures become small bounded repair tasks;
- no scheduled reminders/watchdogs/automations without explicit owner request;
- approval to continue applies only within the explicitly authorized lane and never implies permission to enter the next epic.

The machine-readable product manifest now records frontend migration complete, roadmap reconciliation complete, student onboarding complete, and the current phase as `real_use`. It no longer points to Studies as the next implementation stage.

## Studies gate

Studies remain explicitly owner-gated. Student onboarding completion and the start of real student use do not authorize Studies. Only a later explicit owner instruction activates that lane.

## Scientific guardrail

Developer-side ChatGPT must not independently invent new scientific models, derivations, paper-specific equations/parameters, controller logic, metric formulas, scientific sampling choices, retuning or claims of scientific equivalence. Already owner-authorized definitions may be reused exactly. Software architecture/performance work is allowed while preserving the scientific boundaries above.
