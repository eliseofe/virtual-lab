# Architecture Decision Register

This register records decisions implementation agents should preserve unless new evidence justifies an explicit replacement. Current project status is recorded in `CURRENT_STATUS.md`; strategic direction is in `ROADMAP.md`.

## D-001 — Standalone project

Virtual Lab is a separate repository/application from the owner's academic website. Separation includes source, CI, deployment, runtime, storage, issue tracker and future domain configuration.

## D-002 — Zero-cost baseline

The laboratory's required baseline operation has €0 incremental infrastructure cost. User hardware provides simulation compute; large results remain local. Current lightweight registry/Auth/MCP uses Supabase Free and must not silently become a mandatory paid dependency.

## D-003 — Violet is reference, not base

Violet provides useful design lessons and selectively reusable MIT-licensed ideas/code. Virtual Lab does not preserve Violet abstractions merely for compatibility.

## D-004 — Agent scientific boundary

Canonical controller contract is `action = agent.step(observation)`. Observation is local. Agent private state is encapsulated; its memory is mutable only by its controller, and its traits (D-023) are fixed by the experimenter at initialization. Simulator/environment constructs observations and applies actions.

## D-005 — Simulator owns randomness

Seeds, PRNG state, random initialization, sensing noise, actuation noise and stochastic sampling are simulator responsibilities. Arbitrary host RNG is absent from the controller API.

## D-006 — Physics, control, rendering and metrics are decoupled

They are separate abstractions/schedules. Rendering and storage cadence cannot change dynamics or scientific sampling semantics.

## D-007 — Python-like authoring, compiled execution

Researchers edit constrained recognizable Python-like source. Controllers/initializers/metrics compile to supported internal/runtime representations before execution; per-step host Python interpreter crossings are outside the architecture.

## D-008 — Rust/WASM kernel

The deployed browser scientific kernel is Rust compiled to WebAssembly, with architecture intended to preserve a credible native/HPC path through stable scientific contracts.

## D-009 — Active Elastic is the first validation/showcase Experiment

The Ferrante/Turgut/Dorigo/Huepe Active Elastic model remains the first scientific diagnostic. Plausible animation alone is not scientific validation.

## D-010 — Multiple Experiments are fundamental

Virtual Lab is an Experiment workspace. “Selected/active Experiment” is per session, not a global singleton. Future collaborators may select/run different Experiments independently.

## D-011 — Registry/MCP are current Experiment-domain adapters; GitHub is engineering infrastructure

The canonical remote Experiment Registry is currently Supabase-backed, and authenticated AI authoring is exposed through MCP. These are replaceable domain adapters, not scientific semantics.

GitHub is the simulator/developer repository and CI/deployment workflow. Ordinary Experiment-domain AI access does **not** include GitHub/deployment privileges. Old plans describing GitHub as the normal AI→Experiment transport are superseded.

## D-012 — Raw scientific results are user-visible local files

The canonical raw single-run metric archive is ordinary files under a user-selected Virtual Lab workspace root where writable-directory access is supported. Browser-private storage is not the scientific archive and Supabase/Git are not the bulk result warehouse.

Standalone files are flat under `<Experiment>/runs/`; there is no directory per run. Future Study runs reuse the same contract directly under `<Experiment>/studies/<Study>/`.

## D-013 — Independent AI identities

AI-provider identity is not laboratory identity. Human/registry identities authenticate independently; AI clients act through the human's authorized domain connection where applicable.

## D-014 — Closed-loop implementation

An implementing agent must test/deploy/verify actual artifacts as appropriate before reporting completion. Operational procedure is defined in `DEVELOPMENT_WORKFLOW.md`; this decision records only the durable closed-loop principle.

## D-015 — Controller/scientific edits restart by default

Applying a controller or other scientific artifact change normally creates/reinitializes a run. Silent live scientific hot-swapping is not the baseline. Future interventions must be explicit and traceable.

## D-016 — Four compulsory Experiment artifacts

The current runnable Experiment contract is exactly:

1. Configuration
2. Initialization
3. Controller
4. Metrics

Metrics is compulsory because measurement is part of the single-run Experiment definition, but it may contain zero metric definitions. Legacy three-source representations are compatibility only and must not erase Metrics.

## D-017 — Results presentation is not scientific Experiment state

Generic Results panels bind stable metric IDs and have their own presentation revision (`vlab.results-presentation/1`). Panel/layout changes do not increment the scientific Experiment revision.

The same metric may appear in several panels and several metrics may share one panel.

## D-018 — Scientific definitions require scientific authority; accepted definitions are reusable

Developer-side implementation agents must not independently invent new paper-specific equations, controller laws, metric formulas, retuning or scientific sampling semantics.

A definition explicitly supplied/authorized by the owner/research-AI scientific workflow may be implemented/tested/reused exactly as recorded without repeatedly asking for approval. Reuse does not authorize alteration.

For the current Active Elastic acceptance fixture, `polarization = ||sum_i heading_i|| / N` sampled every 0.1 s for acceptance/display is already owner-authorized and owner-accepted.

## D-019 — Experiment-first Study result hierarchy

Studies belong under the Experiment they investigate. The local hierarchy is conceptually:

```text
<VirtualLab root>/
  <Experiment>/
    runs/
    studies/
      <Study>/
        <metric-id>_000001.csv
        ...
```

This keeps Study origin explicit. Study metric files live directly in the Study directory; there is no extra Study `runs/` layer and no per-run subdirectory.

## D-020 — Missing scientific/software capability is explicit

An authorized research AI must not fabricate unsupported simulator behavior. Missing Experiment capability is surfaced through validation; Professor users may create a durable capability request. Professor approval still does not authorize developer implementation until the owner explicitly approves the implementation design/work.

## D-021 — Two authoring grammars: Configuration data and one code grammar

Decided by the owner on 25 September 2026 (details and rationale: `docs/REFACTORING_AUDIT_2026-09-24.md` §9).

- Configuration is data: named values only.
- Initialization, the environment field function, Controller and Metrics share **one** code grammar: the same statements, expressions, operators and types. `while` is forbidden everywhere, so every program terminates.
- Artifacts differ only in their **view**, meaning the names in scope and the effects allowed, and the compiler enforces this by scope:
  - **Initialization** is the experimenter building the world, and the most powerful view.
  - **The environment field** is a pure function of position and configuration.
  - **Metrics** is a global, read-only observer.
  - **Controller** is the robot. It reads only its own sensors, its own private state, its program's constants and parameters, and its own random stream, and it changes only itself. Other agents are reachable only through sensed collections (neighbours), never by index, and never `N`.
- Loop restrictions protect information, not computation: `for k in range(K)` with a compile-time constant `K` is allowed in every code artifact; collection loops range only over collections in the artifact's view.
- Every code artifact is statically typed.

## D-022 — Robots are anonymous; heterogeneity is an exact composition declared by the experimenter

Decided by the owner on 25 September 2026, following swarm-robotics practice.

- **No identity.** A robot cannot read its index, a unique identifier, the swarm size or other robots' state. It may sample random values with its own random stream and adopt them, for example a random tag or its own random decisions. That is ordinary Controller behaviour, not a way to assign roles.
- **No one sets state on an individual robot.** `set_agent_state(i, name, value)` is retired by #577.
- **Roles.** Heterogeneity is declared by the experimenter (Initialization) as roles:
  - Each role has a name, a size and the private-state values its members start with.
  - A size is either a `fraction` of N or a `count`. Exactly one role takes `rest`, so authors never have to balance sums.
  - A fraction resolves to `round(fraction × N)` under one documented rounding rule.
  - Resolved counts are exact in every run (no fluctuation) and are reported back by the compiler and the MCP.
- **Binding roles to bodies.**
  - **Random** (the default): a random permutation from the initialization stream decides which placed bodies take the role. The count is exact; only which bodies get the role varies with the seed.
  - **Explicit:** the experimenter places the role's members, looping over the role's resolved count, which only Initialization can read.
  - The compiler checks the executed Initialization exactly: each explicit role received exactly its count, and the bodies placed without a role equal the sum of the random roles' counts. A mismatch is a compile error stating the numbers.
- **What a robot sees:** only its role's starting values. Role counts, fractions and `N` stay with the experimenter.
- **Syntax:** as simple as possible, suitable for humans writing by hand as well as for AI agents. Every role case must compile on the first attempt from the contract text alone, for AI and human authors.

## D-023 — One heterogeneity mechanism: groups say who, properties say what

Decided by the owner on 26 September 2026, refining D-022. The per-robot sensor assignment (`set_agent_reference_sensor(i, …)`) was a second, index-based way to make robots differ: it addressed individual robots, its proportions were implicit and unchecked, and it had its own data path. Putting sensors inside roles was rejected, because it couples unrelated robot properties into one declaration.

- **Who differs** is one mechanism: the experimenter partitions the swarm into **groups** of exact size, with the D-022 sizes (`fraction`, `count`, `rest`) and bindings (random deal or explicit placement). A group carries no values.
- **What differs** is attached to a group, one statement per kind of robot property: `set_state(group, name=value)` for starting memory, and `equip(group, reference, range=…)` for reference sensors. Future per-robot properties (for example motion limits, or a different Controller) follow the same pattern instead of adding a new heterogeneity mechanism. `"all"` names every robot.
- **Partitions.** Groups of one partition are exclusive and account for all N robots. Separate partitions are independent, like crossed factors in an experimental design (e.g. 20 % informed and, independently, 50 % equipped), each dealt from its own initialization stream.
- **No conflicts.** A robot receiving the same state or the same sensor from two groups is a compile error.
- **Hardware limits stay physical.** A sensor's range is enforced by the simulator, not by the Controller restricting itself. That is the reason sensors are per-group equipment and not only a memory flag.
- `role(...)`, `role_count(...)` and `set_agent_reference_sensor(...)` are retired, with errors naming the replacement. No current Experiment used per-robot sensors.

**Refinement (26 September 2026, with the owner).** The syntax was made uniform and explicit:
- `rest_of_group(name, dimension=...)` replaces `rest=True`, because "the rest" is a size, not a yes/no switch.
- Every group names its `dimension=`; there are no unnamed dimensions. `within=` nests a split inside one group, for papers that fix joint counts (e.g. 3 malicious among 20 informed), while separate dimensions stay independent.
- Values given by groups are **traits**: the Controller declares them as `NAME = trait(default)` (a number or True/False) and may only read them; the experimenter sets them with `set_trait(group, trait, value)`. What the experimenter imposes stays true for the whole run, as sensors already do; a robot's own memory is declared separately and may change.
- Names chosen by the experimenter are always quoted; `word=` is always a fixed option of the language.
- The authoring guide is `docs/HETEROGENEITY_GUIDE.md`.
