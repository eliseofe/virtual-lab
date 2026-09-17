# Virtual Lab — Project Control

Updated: 17 September 2026

Read `CURRENT.md` first. This file holds strategy detail; it is not mandatory startup context.

## Current priority

Repository detox is complete. The active product/architecture lane is **#251 — Progressive frontend migration to Vite + React + TypeScript + Mantine before Studies**.

Completed migration stages:
1. #252 — foundation/coexistence;
2. #254 — application chrome;
3. #261 — Results presentation.

Next stage: **Authoring shell**, followed by #202 editor ergonomics on the migrated foundation.

Frozen direction:
- Vite build;
- React presentation framework;
- TypeScript for migrated frontend;
- Mantine component/design system;
- static GitHub Pages;
- existing Rust/WASM scientific/runtime core remains authoritative;
- progressive coexistence/rollback, not a flag-day rewrite;
- no Next.js/SSR.

Remaining migration order after Authoring:
- Simulation-stage presentation boundary around the existing canvas/worker/runtime;
- legacy presentation removal + final regression/visual acceptance;
- #3 Studies only after the migration foundation is complete enough to receive it.

## Accepted product state

- #195 Metrics + live Results path complete/deployed.
- #199 local single-run result persistence complete/deployed.
- #200 MCP/Connector Metrics + Results authoring complete/deployed.
- #149 Professor promotion to Showcase complete/deployed.
- #208 unified Experiment identity/save/persistence/organization complete/deployed.
- #210 hierarchy/microcopy/responsive cleanup complete/deployed.
- #261 React/Mantine Results presentation complete.

## ZERO-TOLERANCE execution policy

One substantial independently testable unit at a time.

Local deterministic implementation/testing may iterate. **Asynchronous external systems never participate in the agent feedback loop.** The agent never waits for or polls GitHub Actions, deployment, long benchmarks, Work/browser jobs, authentication, or remote services. It never performs repeated status calls or capability discovery to keep an external process alive.

At terminal delivery the agent writes `.github/terminal-report.json` and stops. Autonomous CI performs build, deployment, manifest-driven production smoke, and owner notification. A failure may be diagnosed only in a later owner-requested turn using bounded evidence for that specific failure.

Work/browser/computer verification is optional diagnostic/UX tooling, not a synchronous completion loop. One bounded invocation may be used when explicitly required; no same-turn waiting, polling, or retry cycle is permitted.

This policy supersedes older text that told agents to track an exact workflow run, wait for Pages, rerun browser checklists until success, or use repository-wide idleness as completion.

## Scientific boundary

Implementation agents may reason about software architecture/performance but must not invent or alter scientific models/derivations/parameters/controllers/metric definitions/sampling semantics. Reuse owner-authorized definitions exactly. Preserve simulator-owned RNG, controller information boundaries, environment-owned action application, read-only metrics and rendering as observer.
