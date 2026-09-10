# Controller Authoring and Compilation

## Purpose

Researchers must be able to see, understand, edit, and deliberately break the local controller rule without learning Rust or interacting with simulator internals. At the same time, execution must remain efficient enough that browser-local and future workstation/HPC runs do not pay an interpreter boundary on every agent/control step.

## Authoring model

The first controller language is a deliberately constrained Python-like language, working name `python-vlab`.

A controller is conceptually stateful:

```python
class Agent(Controller):
    def step(self, observation):
        ...
        return action
```

The actual Round 1 surface syntax should be chosen to make the Active Elastic Model readable and recognizable while keeping compilation semantics explicit.

## Scientific restrictions

Controller source has access only to its declared scientific interface. In particular it does not receive:

- global simulator/world object;
- list of all agents;
- RNG/seed/random stream;
- wall-clock/simulator clock unless time is explicitly part of the observation model;
- filesystem;
- network;
- arbitrary host-language reflection/imports;
- direct methods for mutating physical state.

Private controller state belongs to the controller instance. The simulator may initialize it according to declared semantics, but cannot modify it afterward except by creating/resetting a controller instance for a new run.

## Compilation model

Target pipeline:

```text
python-vlab source
    ↓
parser / AST
    ↓
syntax + allowed-subset checks
    ↓
scientific interface/type checks
    ↓
versioned controller IR
    ↓
WASM/browser executable target
```

A future native compiler target should consume the same IR/semantics.

Round 1 should implement the smallest compiler that faithfully expresses AEM and a useful class of similar local controllers. General Python compatibility is not a goal.

## Performance requirement

Compilation occurs on Apply/Run/revision creation. During execution there is no design in which a Python interpreter is called once per agent or once per control tick.

The runtime should favor compact contiguous state representations and efficient population-level execution while preserving the conceptual semantics of independent stateful agents.

## Error model

Invalid edits should fail before scientific execution with useful source-linked errors where possible. Errors should distinguish:

- syntax error;
- unsupported language feature;
- type/shape mismatch;
- forbidden scientific capability;
- invalid action/observation field;
- compilation/runtime-initialization failure.

## Revisions

Controller source is part of the immutable experiment revision that generated a run. Applying a changed controller to a previously executed experiment should eventually create a new experiment/controller revision rather than silently rewriting history.

## Dynamic replacement during a run

Silent hot-swapping is not part of Round 1 and should not be the default later. If scientific interventions require controller changes during a run, they should be modeled explicitly as time/event-stamped interventions included in run provenance.