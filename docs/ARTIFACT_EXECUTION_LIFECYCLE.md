# Artifact execution lifecycle and capability registry

Status: **approved architecture direction, 14 September 2026**.

This document is the canonical architecture for required vs optional Experiment artifacts, passive vs executable artifacts, lifecycle hooks, and the boundary between one Experiment run and Study-level reset/resume orchestration.

Read `AGENTS.md`, `PROJECT_CONTROL.md`, `PROJECT_STATE.md`, and `docs/RESEARCH_MODEL.md` first for current sequencing and surrounding research concepts.

## 1. Why this exists

#117 and #118 generalized Experiment persistence and the browser from three fixed source fields to an extensible ordered `artifacts[]` model. That solves representation, but representation and execution are different questions.

A future AI client may add a fourth or fifth artifact. Virtual Lab must know whether that artifact is merely preserved/displayed context or actual executable behavior. It must never guess execution semantics from an artifact name, label, file extension, or code-looking content.

The core invariant is:

> An artifact is executable only when the active versioned simulator capability contract explicitly registers its artifact type, syntax/compiler, lifecycle hook, and execution scope.

Everything else is passive/inert with respect to simulation execution.

## 2. Artifact classes

### Required core artifacts

A runnable Experiment currently requires exactly these stable core artifact IDs/types:

1. `configuration`
2. `initialization`
3. `controller`

The Lab and AI authoring contract both treat these as compulsory. They cannot be silently renamed, omitted, or replaced by an invented decomposition while claiming compatibility with the current executable contract.

Current meanings:

- `configuration` — required declarative Experiment/runtime inputs and parameters;
- `initialization` — required fresh-run initialization program;
- `controller` — required repeated per-agent control-step program.

A future contract version may deliberately restructure the core model, but that is an explicit compatibility/version event, not an AI-authored workaround.

### Optional passive artifacts

Additional artifacts may carry scientific/technical context without affecting execution. Examples could include rationale, assumptions, notes, descriptions, documentation, or future definitions not yet understood by the active simulator.

A passive artifact is persisted, versioned, displayed through a supported adapter, and round-tripped through the registry/MCP. Its contents are never executed merely because they contain source code.

### Optional executable artifacts

An optional artifact becomes executable only after Virtual Lab registers a concrete artifact capability. Registration must describe at least:

- stable artifact type/capability ID;
- supported format/language/version;
- compiler/validator;
- lifecycle hook;
- execution scope and cadence where relevant;
- ordering/dependency semantics;
- capability/contract version.

No optional executable artifact capability is registered in production yet.

## 3. Lifecycle vocabulary

Keep the initial lifecycle intentionally small:

```text
setup -> initialize -> control -> finalize
```

### `setup`

Runs once while constructing a fresh run, before initialized state is finalized. This is the natural future place for explicit global/world/setup capabilities that must occur before normal simulation execution.

### `initialize`

Establishes the fresh initial run state. The current required `initialization` artifact already provides this role for agent placement/state initialization.

### `control`

Runs repeatedly during the simulation according to an explicitly declared simulator-owned scope/cadence. The current required `controller` artifact is per-agent and executes at the established control cadence.

A future host/global control-phase artifact must not mean unrestricted simulator access. It requires a deliberately typed capability boundary, similar in spirit to the useful parts of ARGoS loop functions without exposing arbitrary host internals.

### `finalize`

Runs once when a run is intentionally completed/terminated/disposed, where a registered capability requires teardown/finalization behavior. This is analogous in purpose to destroy/teardown hooks in other simulators.

Finalization must not be invented for existing Experiments that do not need it.

## 4. No implicit execution

The following are forbidden architectural shortcuts:

- execute every artifact whose `format` resembles Python;
- infer a hook from an artifact label such as `world`, `loop`, or `control_parameters`;
- let an AI create a new executable artifact type by choosing a new string;
- silently move required semantics out of a core artifact and expect the current simulator to discover them elsewhere;
- give a global/control artifact unrestricted simulator, filesystem, network, RNG, or development access.

If an AI asks for executable behavior not present in the capability registry, the correct state is **unsupported capability**. Once #58 is active, a professor workflow may preserve that intent and create a capability request.

## 5. Representation vs execution

The generic artifact model deliberately allows the representation layer to be ahead of the execution layer.

For example, an Experiment may contain:

```text
configuration      required / understood
initialization     required / understood
controller         required / understood
rationale          optional passive / understood as text
world              optional passive / stored, but not executable today
```

The `world` artifact can become executable later only when a versioned world artifact capability is implemented and advertised. No database/UI redesign should then be required merely because representation was already generic.

## 6. World/environment relationship

#65 remains the world/environment architecture epic, but its old assumption that future world construction should stay inside the three-artifact initializer forever is superseded by #117/#118 and this lifecycle model.

Both of these future designs remain possible:

- extend the existing initialization/setup program with explicit world-builder capabilities;
- introduce a dedicated optional executable world/setup artifact.

The choice should be made when a real world/environment implementation is active. A dedicated artifact is valid only if its type/format/setup hook is registered in the capability contract.

Regardless of source decomposition, the canonical world remains simulator-owned and controller perception remains through declared observation/sensor capabilities.

## 7. Fresh reset/restart

Do not initially create a free-form `reset` code hook.

A **fresh restart/reset** means conceptually:

1. stop/dispose the existing run;
2. execute registered finalization/teardown where applicable;
3. construct a fresh run from the exact Experiment revision;
4. execute setup and initialization with the intended configuration/seed;
5. begin normal control/physics execution.

The existing Restart behavior remains the baseline single-run UX. The lifecycle architecture should eventually make its semantics explicit rather than turning reset into an arbitrary mutation of existing state.

## 8. Resume/checkpoint belongs to Study orchestration

A future Study may intentionally continue from a saved state/checkpoint. This is **resume**, not fresh initialization.

Study protocol/provenance must record at least:

- fresh vs resumed run start;
- source run/checkpoint identity;
- exact Experiment revision;
- relevant capability/compiler/runtime versions;
- checkpoint format/version;
- deterministic RNG state/semantics where needed.

Whether setup/initialization hooks are skipped or re-entered during resume must be an explicit versioned rule. Never silently pass a resumed state through fresh initialization and call it equivalent.

Issue #127 owns this Study-facing seam.

## 9. Experiment lifecycle vs Study protocol

Keep the responsibilities separate:

```text
Experiment capability/lifecycle
    what one run can execute
    setup / initialize / control / finalize

Study protocol
    which runs to perform
    parameter combinations
    repetitions/seeds
    fresh vs resume/checkpoint choice
    metrics/results/plots
```

This prevents Study orchestration from becoming arbitrary simulator source and prevents Experiment artifacts from becoming hidden batch-control scripts.

## 10. AI-visible contract

The machine-readable authoring contract should let Grok/Claude answer without guessing:

- Which artifacts are compulsory?
- Which extra artifact forms can be represented?
- Which registered types are executable?
- At which lifecycle hook do they execute?
- What syntax/format is accepted?
- What scope/cadence/information boundary applies?
- What is currently unsupported?

Issue #125 is the first bounded implementation: expose this metadata while adding **no new runtime executable hook**.

Issue #126 is the later runtime-dispatch child, activated only when a concrete first executable optional capability is owner-approved.

## 11. Compatibility/versioning

The current core executable contract remains stable through this architecture pass. Existing Experiments must preserve identical configuration, initialization and controller semantics.

A future decomposition that changes where executable responsibilities live must increment the relevant artifact/capability interface and provide explicit migration/compatibility semantics. It must not be achieved by teaching an AI a private convention unknown to the Lab.

## 12. Security and scientific guardrail

Artifact execution does not change the existing structural boundary:

- research AI has no GitHub/deployment/shell/admin access;
- controller information remains local-observation/action constrained;
- simulator owns RNG and action application;
- rendering remains observational;
- global/world hooks receive only their declared typed capabilities;
- adding an artifact cannot grant unrestricted host access.

Implementation agents may design lifecycle plumbing, validation, dispatch, and software interfaces. They must not independently invent scientific world dynamics, model transformations, parameter meanings, metrics, or substitutions for unsupported requested science.

## 13. Roadmap ownership

- #124 — epic: artifact capability registry + lifecycle hooks;
- #125 — bounded contract metadata, no new execution;
- #126 — future runtime dispatcher for registered optional executable artifacts;
- #127 / #3 — Study fresh/reset/resume/checkpoint provenance;
- #65 — world/environment capabilities and future setup/world artifact decisions;
- #58 — professor request lifecycle for unsupported artifact/capability needs.
