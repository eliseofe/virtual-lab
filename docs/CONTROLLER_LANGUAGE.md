# Controller Authoring and Compilation

Status: **current deployed controller architecture**.

## Purpose

Researchers can inspect/edit constrained Python-like controller source without learning Rust or receiving simulator internals. Execution remains compiled/efficient: there is no Python interpreter crossing per agent/control step.

## Authoring model

Current controller language: `python-vlab/0.1`.

Conceptually a controller is a stateful local agent program:

```python
class MyAgent(Agent):
    def step(self, obs):
        ...
        return Motion(forward, turning)
```

The language deliberately supports only a constrained subset required by the advertised machine-readable capability contract. General Python compatibility is not a goal.

## Scientific information boundary

Controller source receives only declared local observations/capabilities. Current restrictions include no unrestricted access to:

- global simulator/world object;
- global list of agents;
- global position unless a future owner-approved observation capability explicitly changes that gatekeeper;
- raw RNG/seed/random-stream access outside the implemented simulator-owned stochastic primitives;
- filesystem/network;
- arbitrary imports/reflection/host APIs;
- direct physical-state mutation.

Private controller state belongs to each controller instance and is modified by its own controller execution. The simulator/environment constructs observations and applies returned actions.

Controller stochasticity is simulator-owned and versioned by `vlab.controller-stochasticity/1`. The implemented primitives are:

- `rng.uniform(a, b)` — scalar sample in `[a, b)` for finite `b >= a`; one stream draw;
- `rng.bernoulli(p)` — boolean event for finite `p` in `[0, 1]`; one stream draw;
- `rng.normal(mean, stddev)` — Gaussian scalar using the contract's Box-Muller transform for finite `mean` and finite non-negative `stddev`; exactly two stream draws.

Each agent owns an independent deterministic controller stream derived from the run `SEED`, the `controller` RNG domain, and that agent's stable index. Extra stochastic calls by one agent therefore do not alter any other agent's sequence. Resetting the run reconstructs every stream and replays the same draws. Controller code cannot inspect stream state, reseed it, select another agent's stream, or call host/global randomness.

## Bounded control flow

The Controller language provides ordinary typed control flow without becoming general Python:

- boolean literals `True` and `False`;
- scalar comparisons `< <= > >= == !=`;
- boolean composition with `and`, `or` and `not`;
- `if / elif / else`;
- branch-aware definite assignment for locals;
- bounded neighbour iteration over the implemented neighbour collection.

A local introduced inside branches is available afterward only when every continuing branch defines it with the same type. An exhaustive conditional may itself satisfy the action-return requirement when every branch returns a `Motion`.

The loop domain remains intentionally bounded: this work does not introduce arbitrary iterables, `while`, recursion or host-language execution.

## Standard scalar mathematics

The generic scalar mathematics substrate is paper-independent. Controller source supports ordinary exponentiation with `**` (lowered to the same native power operation as `pow`) and the following scalar functions:

`abs, sqrt, exp, log, sin, cos, tan, asin, acos, atan, atan2, floor, ceil, pow, min, max`.

These functions use the native Rust `f64` operations at execution. Existing vector primitives remain separate: `Vec2`, `dot`, `norm`, and `perpendicular`.

The same scalar vocabulary is aligned across Initialization, Metrics, and the optional scalar Environment expression where their artifact models make scalar mathematics meaningful. Dynamic domain errors that produce non-finite values fail at the relevant execution boundary instead of silently contaminating simulator state.

## Minimal syntax and mathematics baseline

The controller language intentionally provides a small ordinary programming/mathematical core so research papers do not need new language requests for routine expression mechanics.

The current baseline includes:
- scalar and 2-D vector locals;
- assignment and `+=`;
- unary negation and parenthesized `+ - * /` arithmetic;
- `Vec2`, `dot`, `perpendicular`, `norm` and `pow` (including ordinary exponentiation through `pow(base, exponent)`);
- neighbour iteration, including a normal local alias such as `neighbours = obs.neighbours; for n in neighbours:`;
- declared private scalar controller state;
- `Motion(forward, turning)`.

Source convenience does not widen runtime semantics. Collection aliases are lowered to the canonical Rust-executable IR vocabulary before persistence/execution, and the emitted IR is regression-tested against the Rust runtime boundary.

A Controller must also contain an unconditional top-level action return. A return that exists only inside a neighbour loop is not sufficient because the loop may be empty.

## Compilation model

```text
python-vlab source
    ↓
parser / AST
    ↓
allowed-subset + semantic/type/capability checks
    ↓
vlab.controller-ir/0.1
    ↓
Rust/WASM runtime execution
```

The controller IR is a stable semantic seam intended to support future native/HPC execution without changing researcher-facing scientific meaning.

## Performance

Compilation/validation occurs before execution. The hot control loop executes compiled/runtime structures rather than invoking a host Python interpreter.

Runtime implementations may use compact population/state representations internally while preserving the conceptual semantics of independent stateful agents.

## Errors

Invalid source should fail before scientific execution with source-linked diagnostics where supported. Categories include syntax, unsupported capability/feature, type mismatch, invalid observation/private-state access and runtime-initialization compatibility.

Unsupported scientific capability must not be silently approximated. Professor users may route genuine gaps through the capability-request workflow.

## Revisions and restart behavior

Controller source is part of the scientific Experiment revision. Applying a scientific controller edit creates/uses a changed Experiment definition and normally restarts/reinitializes the run.

Silent controller hot-swapping during an active run is not the baseline. Any future scientific intervention semantics must be explicit, versioned and traceable rather than mutating history invisibly.
