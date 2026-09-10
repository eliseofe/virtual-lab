# Architecture Decision Register

This register records decisions that implementation agents should preserve unless new evidence justifies an explicit replacement.

## D-001 — Standalone project

Virtual Lab is a separate repository/application from the owner's academic website. Separation includes source, CI, deployment, runtime, storage, issue tracker, and future domain configuration.

## D-002 — Zero-cost baseline

The laboratory's required baseline operation has €0 incremental infrastructure cost. User hardware provides compute; large results remain local; static hosting serves application assets.

## D-003 — Violet is reference, not base

Violet provides useful design lessons and selectively reusable MIT-licensed ideas/code. The new simulator may be written from scratch and should not preserve Violet abstractions merely for compatibility.

## D-004 — Agent scientific boundary

Canonical contract is `action = agent.step(observation)`. Observation is local. Agent private state is encapsulated and mutable only by its controller. Simulator/environment constructs observations and applies actions.

## D-005 — Simulator owns randomness

Seeds, PRNG state, random initialization, sensing noise, actuation noise, and stochastic sampling are simulator responsibilities. RNG is absent from the agent API.

## D-006 — Physics, control, rendering, metrics are decoupled

They are separate abstractions/schedules. Rendering cannot affect dynamics. Headless mode changes rendering, not scientific evolution.

## D-007 — Python-like authoring, compiled execution

Researchers edit recognizable Python-like controller source. The initial design uses a constrained language compiled to a stable IR/executable target before a run. Per-step Python interpreter crossings are outside the intended architecture.

## D-008 — Rust/WASM is preferred kernel direction

A new Rust scientific kernel compiled to WebAssembly is the current preferred browser architecture because it offers efficient local execution and a credible native/HPC path. This is a preferred engineering direction, not an immutable scientific law; replacement requires documented evidence and must preserve stable contracts.

## D-009 — Active Elastic Model is first validation experiment

Round 1 uses the 2013 Ferrante/Turgut/Dorigo/Huepe Active Elastic Model as a scientific diagnostic. A cosmetic flocking demo does not satisfy Round 1.

## D-010 — Multiple experiments are fundamental

The lab is an experiment workspace. "Selected/active experiment" is per session, not a global singleton. Multiple users may later select/run different experiments concurrently.

## D-011 — Stable formats/API, replaceable transport

Versioned Experiment/Run formats and Lab domain operations are stable seams. GitHub is the initial transport/repository adapter. MCP, HTTP, filesystem, database, or other transports can be added/replaced later.

## D-012 — Local-first data

Large/raw results remain local by default. Git stores source/specification/provenance/small summaries. Shared/institutional storage is optional.

## D-013 — Independent AI identities

Future collaborators use their own AI accounts/providers. Lab/workspace identity is independent of ChatGPT/Claude/etc. AI actions are attributed to the human actor they represent where possible.

## D-014 — Closed-loop implementation

An implementing agent must inspect and exercise the deployed/browser-visible result itself, repair defects, and repeat before human handoff. Human review is the next scientific/design layer, not the first software smoke test.

## D-015 — Controller changes restart by default

Applying a controller edit normally creates/reinitializes a run. Silent live hot-swapping is not required. Any future mid-run controller change is modeled as an explicit provenance-recorded intervention.