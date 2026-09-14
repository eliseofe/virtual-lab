# Virtual Lab — Project Control

Updated: **15 September 2026**

This file is the authoritative roadmap / execution frontier for Virtual Lab. Read `AGENTS.md` first. `PROJECT_STATE.md` contains detailed technical evidence; when old frontier wording in historical sections conflicts with this file, **this file wins**. Execution-unit rules are in `docs/EXECUTION_GRANULARITY.md`.

## Strategic status

The #147 UI/UX redesign is complete, deployed and browser-verified. Final production workflow `34901925055` passed build, GitHub Pages deployment, functional simulator smoke and the real 390×844 responsive/focus smoke.

A full backlog audit on 15 September 2026 retired stale Round-1/integration umbrellas and reorganized remaining work into durable parent epics plus bounded children. Historical issues #1, #14–#18, #46, #52 and #58 are closed and must not be used as roadmap anchors.

There is no single monolithic "next issue". The owner has promoted several **near-term lanes**, but execution still follows one substantial bounded child at a time.

## Near-term lanes

### 1. Access / sharing / curation — parent #45

#45 is now the parent for production identity, sharing, submission, curator workflows and Showcase.

Current children:
- **#162 — production Virtual Lab OAuth/login surface + enrollment policy.** The legacy OAuth proof still displays `mock-sim` / diagnostic branding and exposes generic account creation. Current Supabase baseline has exactly two accounts, both owner/test identities; there are no unknown accounts as of this audit. The owner still needs to choose between controlled enrollment (invite/approval/allowlist; preferred initial direction) and open signup plus explicit monitoring before admission semantics change.
- **#149 / #45.2 — optional first-paper refinement + Showcase decision.** Paper-loop success does not require Showcase; the working Experiment may remain private.

The standalone mock-sim visual-twin idea (#52) is retired. Do not maintain a second visual product merely for styling.

### 2. Performance — parent #56

#56 is an active measurement-driven performance epic. Earlier optimization work produced major gains, but performance remains strongly dependent on neighbour density/state.

Current child:
- **#165 / #56.11 — profile neighbour-density dependence and spatial-index resolution strategy.** Measure bucket occupancy, candidate enumeration, exact neighbour count, observation/controller cost and total throughput; benchmark internal-only grid-resolution policies while preserving exact periodic neighbour semantics and deterministic ordering.

No scientific retuning and no student-visible hash/grid tuning parameter.

### 3. Studies / results / AI research workflow — parents #3, #6, #119

Research hierarchy:
- **#3 — Studies** parent.
  - **#127 / #3.1** — fresh/resume/checkpoint/teardown provenance.
  - **#4 / #3.2** — local result storage, portable bundles and provenance.
- **#6 — selected Study results → AI handoff** parent.
  - **#166 / #6.1** — define the first explicit result/plot/provenance handoff contract and its boundary with #3/#4.
- **#119 — Research Notes and Research Documents** parent.
  - **#120 / #119.1** — AI research synthesis from Studies, Notes and selected results.

Large raw trajectories remain local-first. AI receives only explicitly selected artifacts/data with provenance and never gains simulator execution through the result-handoff channel.

### 4. Owner acceptance — parents #115 and #118

Engineering is deployed; these parents remain open only for coherent post-redesign acceptance.

- **#163 / #115.A** — verify collection create/rename, assignment, moves, Save as new, No collection and dirty/conflict safety entirely from the Lab UI. Normal collection management must not require Grok/MCP.
- **#164 / #118.A** — verify artifact tabs/workbench, Apply changes & restart, invalid-edit recovery, persistence/conflict behavior, optional passive artifact handling and Technical details disclosure.

If an acceptance child passes, close the child and its parent. If it exposes a defect, create one focused engineering child under that parent.

## Living simulator architecture

These issues are intentionally open because they define durable extension domains, not because their entire scope should be implemented now:

- **#2 — scientific validation/reproducibility guardrails.** Living correctness umbrella; focused implementation issues carry concrete tests.
- **#57 — canonical deterministic domain-separated RNG.** Near-term candidate because a Grok RNG capability request exists, but that request is still unapproved and therefore does not authorize implementation.
- **#65 — world/environment capabilities.** Living epic. First generic scalar Environment capability #143/#144 is deployed, but the domain is intentionally broader.
- **#124 — artifact capability registry/lifecycle.** #125 completed; #126 remains blocked until a concrete owner-approved optional executable artifact exists.

Future lanes remain #8 native/HPC, #9 richer physics/heterogeneity and #102 numerical-integrator evaluation.

## Pending Professor/Grok requests — not engineering instructions

Two durable requests remain `requested` and unapproved:

- `7492c39d-fdd0-4f29-9661-63dbc6461bf5` — controller / `stochasticity.rng`;
- `49368c8e-dff7-4ce0-9072-bc3f4b37ada2` — initialization / `heterogeneous_agent_state`.

Standing capability flow:

`paper + research AI → draft → missing capability → durable request → Professor approve/decline → developer design discussion → explicit owner implementation approval → trusted developer handoff → implementation/deploy → live-contract verification → implemented → research AI resumes`

Professor approval alone never starts coding. Research AI never receives GitHub/repository/shell/deployment/admin/simulator-source privileges.

## Issue hierarchy convention

Use a small number of durable epics/parents and bounded executable children.

- `EPIC` / `LIVING EPIC`: durable product or architecture lane; never execute monolithically.
- numbered child (`#56.11`, `#45.1`, `#3.2`, etc.): one coherent design/implementation/measurement unit.
- `ACCEPTANCE PARENT`: engineering complete; stays open only until explicit owner acceptance child passes.
- historical/superseded umbrellas: close rather than leaving them as roadmap noise.
- #145 is intentionally permanent infrastructure for success-only completion reports.

Do not create a giant "epic of epics". This `PROJECT_CONTROL.md` is the portfolio-level view.

## Scientific / architecture guardrail

Developer-side ChatGPT must not independently invent or derive the scientific model being simulated. Scientific equivalence, paper-specific equations/parameters, controller logic, retuning and model analysis belong to the Professor/research-AI discussion unless the owner explicitly authorizes scientific reasoning.

For paper-driven capabilities apply `docs/CAPABILITY_GENERALIZATION_GATE.md`. Preserve simulator-owned RNG, controller information boundaries, environment-owned action application, scientific timing/integration semantics and rendering as an observer unless explicitly approved otherwise.

## Execution granularity

Default to one substantial independently testable/deployable child at a time:

1. implement or perform the bounded design/measurement;
2. test;
3. deploy when applicable;
4. verify actual behavior;
5. update durable state/issue;
6. report a clean checkpoint;
7. stop unless the owner explicitly requests a broader sequence.

## Success reporting

#145 is the permanent success-only completion stream for ChatGPT-managed `eliseofe/*` work. Discussion, failures, retries and partial work do not generate success reports; verified terminal success does.

## Source precedence

When sources disagree:
1. explicit current owner instruction;
2. `PROJECT_CONTROL.md`;
3. current design documents / closeout docs;
4. `PROJECT_STATE.md` technical evidence;
5. active child issue;
6. older issues/chats as history only.

## Current one-line status

**Backlog normalized. Near-term lanes are #162 access/enrollment, #165 neighbour-density performance profiling, #166 selected-result→AI contract, plus owner acceptance #163/#164 when convenient. #57 is relevant to the pending RNG request but no Grok request is approved or authorized for implementation.**
