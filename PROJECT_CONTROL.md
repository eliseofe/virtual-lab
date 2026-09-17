# Virtual Lab — Project Control

Updated: 17 September 2026

Read `CURRENT.md` first. This file holds strategy detail; it is not mandatory startup context.

## Current priority

A temporary maintenance epic, **#257 — Repository detoxification and execution fast-forward**, is active to remove CI/process debris that has made context-free ChatGPT sessions expensive and sometimes non-terminating.

Detox sequence:
1. #258 — automatic CI minimization: complete;
2. #259 — current-state/bootstrap fast-forward: active;
3. #260 — stale queued-run and branch hygiene: next.

Feature development resumes only after the detox reaches a safe checkpoint.

## Strategic product frontier after detox

**#251 — Progressive frontend migration to Vite + React + TypeScript + Mantine before Studies** is the current product/architecture epic.

Frozen direction:
- Vite build;
- React presentation framework;
- TypeScript for migrated frontend;
- Mantine component/design system;
- static GitHub Pages;
- existing Rust/WASM scientific/runtime core remains authoritative;
- progressive coexistence/rollback, not a flag-day rewrite;
- no Next.js/SSR.

Migration order:
1. foundation/coexistence — #252 complete;
2. application chrome — #254 active/reopened;
3. Results presentation, absorbing the existing series-selection and Follow-live requirements;
4. Authoring shell, followed by #202 editor ergonomics on the migrated foundation;
5. Simulation-stage presentation boundary around the existing canvas/worker/runtime;
6. legacy presentation removal + final regression/visual acceptance;
7. #3 Studies only after the migration foundation is complete enough to receive it.

## #254 — application chrome status

PR #255 merged the first visible React/Mantine application chrome to `main`. Production build/deploy succeeded, but responsive production smoke found a real Account-dialog focus-return/accessibility regression caused by delegating behavior through the now-hidden legacy Account control. #254 was correctly reopened.

PR #256 contains the intended hotfix path and passed its PR build/performance checks before the detox began. It remains unmerged while #257 maintenance is active. Do not advance to the next #251 child until #254 is repaired, merged and production-verified.

## Already accepted product state

- #195 Metrics + live Results path complete/deployed and externally accepted.
- #199 local single-run result persistence complete/deployed.
- #200 MCP/Connector Metrics + Results authoring complete/deployed.
- #149 Professor promotion to Showcase complete/deployed.
- #208 unified Experiment identity/save/persistence/organization complete/deployed.
- #210 hierarchy/microcopy/responsive cleanup complete/deployed.

Standalone vanilla implementation of Account/Professor reconciliation, Results series-selection affordance and Follow-live recovery remains superseded by implementing those requirements in the corresponding React/Mantine migration surfaces.

## Execution policy

One substantial independently deployable/testable unit at a time. Completion means test + deployment where applicable + actual behavior verification + durable state update.

Repository-wide Actions status is not a completion criterion. Track only current task SHA/PR/run IDs. Historical queued Actions may remain visible and must not block unrelated current work.

## Scientific boundary

Implementation agents may reason about software architecture/performance but must not invent or alter scientific models/derivations/parameters/controllers/metric definitions/sampling semantics. Reuse owner-authorized definitions exactly. Preserve simulator-owned RNG, controller information boundaries, environment-owned action application, read-only metrics and rendering as observer.
