# Virtual Lab — Current Project State

Updated: **12 September 2026**

This file is the durable, context-free starting point for future ChatGPT/Work/human sessions. Read it before inferring roadmap order from older issue numbering or historical planning text.

## Immediate execution state

The current active implementation sequence is:

1. **#55 — AI authoring contract / simulator-native parser-compiler validation** — NEXT ACTIVE ISSUE.
2. **#46 — connect the validated experiment registry to production Virtual Lab** — starts after #55.
3. **Further simulator/scientific work chosen by the owner** — expected to take priority over cosmetic/UI work.

**#45 professor/sharing/submission/curation is deferred and separate. It no longer blocks the core private-student integration path.**

**#52 mock-sim visual-twin/UI work is explicitly deprioritized. It is not the automatic next step after #46. Resume it only when the owner explicitly reprioritizes UI/graphics work after higher-value simulator work.**

The old AI–Lab sequence numbering (#41–#46) is historical; use the dependency statements above as the current roadmap.

## What is already proven

### Experiment contract / registry / MCP

The following issues are complete:

- #41 — experiment contract and synchronization semantics;
- #42 — canonical Supabase registry, authentication, RLS, ownership, lifecycle and revisions;
- #43 — restricted experiment-only MCP;
- #44 — real student workflow through AI ↔ MCP ↔ registry ↔ mock-sim;
- #51 — isolated mock-sim GitHub Pages host;
- #53 — Supabase OAuth configuration;
- #54 — real Claude compact-MCP handshake.

PR **#50** is merged into `main` at merge commit `a82252d849f6a66e6a8b77fa392bd5c22fd3171e`.

### Live experiment MCP

Supabase project ref: `izdmmudfrmqhvlgepwes`

Endpoint:

`https://izdmmudfrmqhvlgepwes.supabase.co/functions/v1/experiment-mcp`

Current deployed Edge Function: **version 5**.

The final #44 auth interoperability change replaced per-request `auth.getUser()` validation with Supabase protected-resource/JWKS middleware while preserving RLS-scoped database access. This was required because Grok repeatedly reported the connector as connected but then re-requested authorization / failed MCP initialization. After the version-5 change, the existing Grok connector successfully created an experiment without requiring connector deletion/recreation.

The compact student-facing MCP intentionally has only five tools:

1. `read_workspace`
2. `manage_collection`
3. `create_experiment`
4. `edit_experiment`
5. `delete_experiment`

This interface exposes experiment-domain operations only. It does not expose simulator execution, simulator results, simulator source/deployment modification, GitHub, arbitrary SQL, shell, arbitrary filesystem, or secrets/admin operations.

### Mock-sim

Hosted at:

`https://eliseofe.github.io/virtual-lab-mock-sim/`

Its purpose in #44 was deliberately non-scientific: real authentication, experiment organization, three source editors, revision-aware synchronization, lifecycle and conflict behavior, with **zero simulation execution**.

#44 owner acceptance proved:

- real OAuth from Claude and Grok;
- two genuinely distinct authenticated registry identities;
- symmetric private-user isolation, including guessed/exact foreign experiment IDs;
- AI → registry → mock-sim synchronization;
- mock-sim → registry → AI synchronization;
- create-from-zero from both AI and mock-sim paths;
- project/collection organization;
- archive/restore;
- permanent delete;
- stale-write rejection;
- browser refresh/newer-canonical-state protection;
- no simulator-development capability through the student connector.

#44 is closed. Do not reopen it because later production syntax validation is incomplete; that is #55.

### Residual #44 risk / testing policy

#44 was an architectural acceptance gate, not an exhaustive certification suite. During owner testing, Grok exposed a real recurring OAuth/initialization defect; that defect was fixed in MCP version 5 and the same Grok connector then successfully created a real three-artifact experiment.

A few low-value repetitions were intentionally not pursued after the architecture was proven. In particular, there is no reason to keep repeating every source-field round-trip in mock-sim merely because metadata round-trips already passed: the MCP edit path applies description, configuration, initializer, and controller fields through the same revision-protected experiment update operation, and create-from-zero already persisted all three non-empty source fields successfully.

Policy going forward: **move to #55 and #46; treat any newly observed authentication, synchronization, or source-field failure as a real regression and fix it when encountered. Do not manufacture additional owner chores solely to exhaustively retest #44.**

## Meaningful student experiment created during #44

The owner discussed a real experiment conversationally with Grok and asked Grok to create it through the connector.

Canonical registry record:

- title: **Encounter-Driven Information Diffusion (EDID) in a Robot Swarm**
- experiment ID: `212854b2-ce08-452e-8cab-b27841d86cf9`
- revision: `1`
- lifecycle: active
- created by AI through the Grok OAuth client
- all three source artifacts are non-empty
- the exact experiment is visible in mock-sim under the same user identity

This is important evidence: the ordinary student discussion → AI creation → registry → browser workflow works.

However, **this does not yet prove the EDID sources are runnable in production Virtual Lab.** Grok was never given the simulator's authoritative syntax/language contract and no production parser/compiler validated the three strings. That newly discovered distinction is the reason #55 exists.

## #55 — next active implementation issue

#55 is the immediate next task.

Problem discovered during owner acceptance:

- transport/storage works;
- the three experiment artifacts currently reach the registry as arbitrary strings;
- a generic AI does not inherently know the exact Virtual Lab configuration, initializer and controller syntax;
- therefore successful creation cannot be equated with production loadability/runnability.

Required direction:

- the production Virtual Lab implementation remains the source of truth for syntax;
- expose a versioned machine-readable **experiment authoring contract** to connected student AIs;
- reuse the real production parsers/compiler for validation;
- provide structured/source-positioned diagnostics to the AI;
- do not create a separate duplicate language definition that can drift;
- do not run the simulator as part of validation;
- do not give the AI simulator-run/results capability.

Existing controller parser/compiler work from completed **#13** must be reused. #13 implemented the controller source → AST → allowed-subset validation → semantic/type validation → versioned IR → executable runtime pipeline and diagnostics. #55 must first inventory the actual production validation path for **all three artifacts** (configuration, initializer, controller) and add only the missing software seams.

Scientific reasoning is not required for #55. It is a software contract/parser/compiler task.

## #46 — production registry integration after #55

#46 now explicitly follows #55.

Target production loop:

AI/student discusses and authors experiment → real parser/compiler validates the three artifacts → canonical registry synchronizes → production Virtual Lab loads the experiment → **student manually runs/observes it** → student edits/saves in Virtual Lab → AI reads the saved state.

The AI must still not automatically run the simulator or observe results.

#46 should preserve current local Rust/WASM execution, restart/seed behavior, controller compilation and browser performance. It should wire the registry into the production Lab, not redesign the registry.

The existing Active Elastic experiment should be represented through the registry without changing its scientific semantics as part of transport/integration work.

## #45 — deferred professor/sharing/curation track

#45 remains valid but is not on the immediate path.

Its scope is student sharing/submission, professor/curator visibility, preserved submission snapshots and curated/public examples. It remains an experiment-domain permission workflow and must not confer simulator-development capability.

Current decision: implement it later unless the owner explicitly reprioritizes it.

## #52 — deprioritized visual/UI sandbox

Keep #52 as a useful future idea, but **do not schedule it automatically after #46**.

Potential future role of mock-sim:

- real registry/auth/synchronization;
- production-like Virtual Lab shell and graphics/layout;
- inert simulation area;
- no scientific execution.

Current decision: higher-priority simulator/scientific work comes first. Resume #52 only after the owner explicitly chooses to work on graphics/UI.

## Results channel remains separate

Issue #6 is future work for explicit Lab → AI plots/results/provenance after production experiment integration and quantitative result capabilities exist.

Do not silently turn the student AI into an autonomous closed-loop simulator agent while implementing #55 or #46.

## Production simulator state

The production Virtual Lab and Active Elastic simulator are already functional enough for owner use/testing. Further scientific fidelity/validation remains separately tracked in #14 and cross-cutting validation in #2.

Do not use #55/#46 as an excuse to independently derive or retune Active Elastic science.

## Controller parser/compiler

#13 is completed and closed as an implementation component.

Implemented pipeline:

`source -> parser/AST -> allowed-subset validation -> semantic/type validation -> versioned controller IR -> executable runtime`

It provides categorized diagnostics and must be reused by #55.

Browser-level edit/error/recovery and robustness acceptance debt remains separately visible in #17/#18.

## Other open work / backlog

Open issues are intentionally not all immediate work. Important groups:

### Scientific / simulator correctness

- #2 — scientific validation and reproducibility infrastructure;
- #14 — Active Elastic scientific validation/fidelity;
- #29 — runtime speed should saturate cleanly above compute capacity;
- #31 — large-swarm neighbour-index benchmark.

### Older browser/UI acceptance debt

- #15 — Round-1 UI/deployment umbrella;
- #16 — deployed desktop simulation controls;
- #17 — controller edit / compile error / recovery;
- #18 — responsive/reload/browser robustness.

These are not prerequisites for starting #55 unless an implementation dependency is discovered.

### Future quantitative / compute work

- #3 — multi-run sweeps, metrics, plots, statistics and replay;
- #4 — local result storage/provenance;
- #6 — explicit Lab → AI results channel;
- #8 — native/HPC execution;
- #9 — future richer physics/heterogeneous swarms.

## Scientific reasoning guardrail

Implementation agents may reason about software architecture, parser/compiler design, data flow, UI, synchronization, performance, tests and deployment.

They must **not independently perform scientific reasoning, derivations, equilibrium calculations, model analysis, parameter inference, or retuning of the simulated scientific system**.

If a software task appears to require a new scientific choice, stop and ask the owner that specific scientific question first.

Existing accepted scientific values/behavior may be preserved mechanically while refactoring or integrating transport.

## Cost invariant

This remains a **zero-euro incremental-cost project**.

Current baseline uses:

- GitHub repository / GitHub Pages;
- Supabase free-tier project for registry/auth/MCP;
- client-side browser simulation compute;
- already-owned AI subscriptions/accounts used by the owner for acceptance.

Do not introduce a new paid mandatory service without explicit owner approval.

## Resume instructions for a context-free agent

If resuming the project now:

1. read this file;
2. read **issue #55** in full;
3. inspect the current production configuration/initializer/controller parsing/validation code before designing anything;
4. reuse #13 controller compiler/parser rather than reimplementing it;
5. keep scientific reasoning outside scope unless explicitly approved;
6. implement and verify #55 first;
7. only then proceed to #46;
8. after #46, ask the owner what simulator/scientific work is next — **do not automatically start #52**.

Do not repeat the #44 OAuth/isolation/stale-write acceptance matrix unless a regression directly requires it. Those gates are already complete and recorded in #44.