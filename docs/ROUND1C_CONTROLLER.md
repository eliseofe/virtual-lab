# Round 1C controller compiler and executable runtime

## Execution pipeline

Round 1C makes the controller authoring/execution seam executable end to end:

```text
python-vlab/0.1 source
  -> browser parser
  -> allowed-subset + scientific-capability validation
  -> scalar/vector/action type checking
  -> vlab.controller-ir/0.1 JSON
  -> WASM worker
  -> Rust IR validation + one-time bytecode lowering
  -> executable controller runtime
  -> action = controller.step(observation)
```

The source language is Python-like, but no Python interpreter executes during a scientific run. The Rust runtime executes validated compact controller bytecode. This retains a stable IR seam that can later be lowered to a native/AOT target without changing the researcher-facing source semantics.

## python-vlab/0.1 surface

Round 1C intentionally implements the smallest language required for local vector controllers such as the Active Elastic Model family:

- `class Name(Agent):`;
- optional scalar private-state class attributes with finite numeric initial values;
- exactly `def step(self, obs):` as the entry point;
- local assignment and `+=`;
- `for neighbour in obs.neighbours:`;
- numeric constants and parameter names supplied by the experiment;
- `+`, `-`, `*`, `/`, unary `-` with checked scalar/vector shapes;
- `Vec2(x, y)`, `dot(a, b)`, `norm(v)`, `perpendicular(v)`, `Motion(forward, turning)`;
- `obs.heading`, `obs.neighbours`, and `neighbour.relative_position`;
- `return Motion(...)`.

Imports, arbitrary host-language calls, reflection, network/filesystem access, simulator/world handles, global agent lists, clocks, seeds and RNG objects are outside the language.

## Types and scientific interface

The compiler checks the small scientific type system before IR is accepted:

- `scalar`;
- `vec2`;
- `neighbours` / loop-local neighbour observation;
- `action`.

Experiment-supplied controller parameters are declared to the compiler separately from source. Round 1C parameters are scalar. Unknown identifiers, observation fields, neighbour fields, undeclared private state and shape-invalid operators fail before execution with categorized source-linked diagnostics.

## Private state

A Python-like class attribute provides an explicit initial value, for example:

```python
class StatefulAgent(Agent):
    counter = 0.0
    def step(self, obs):
        self.counter += 1.0
        return Motion(self.counter, 0.0)
```

The Rust runtime allocates an independent private-state vector per agent when a run initializes. Only that agent's controller bytecode can load/store its private slots. Reset recreates all private state from the declared initial values. The simulator never receives an API for mutating these slots.

## Versioned controller IR

The browser compiler emits `vlab.controller-ir/0.1`. It contains:

- controller/language/schema identity;
- declared parameter types;
- declared private-state initial values;
- explicit statement nodes (`assign`, `aug_assign`, `for_each`, `return`);
- expression nodes (`const`, `load`, `unary`, `binary`, `call`);
- source line metadata for diagnostics.

IR contains no GitHub, browser-renderer, filesystem or transport path. It is the stable input to executable-target lowering.

## Rust executable target

`IrControllerRuntime::from_json` defensively validates the versioned IR and supplied parameter values, then lowers it once to typed Rust bytecode. Runtime instructions include typed scalar/vector arithmetic, local/private slot access, observation loads, neighbour iteration, vector primitives and action construction.

The runtime therefore has no source parser, Python interpreter or host-language reflection in the control loop. Per control update it executes only the already-lowered controller instructions against the simulator-provided local observation.

## Apply/recovery semantics

The browser compiles source first. Valid IR is sent to the WASM worker and lowered into a fresh `IrControllerRuntime`. Only after that succeeds does the simulator replace the active controller and reset the run. If parsing, type checking, IR validation or runtime initialization fails, the previous valid controller remains installed and recoverable.

This implements the Round 1 default: controller edits apply through a clean restart, not a silent mid-run hot swap.

## Validation

Round 1C adds tests for:

- source → typed IR for a local spring/vector controller;
- forbidden simulator/RNG access;
- source-positioned indentation/tab errors;
- unknown observation fields;
- scalar/vector mismatches;
- declared and undeclared private state;
- Rust bytecode execution of vector math and neighbour iteration;
- independent private state across multiple agents and exact reset;
- defensive rejection of malformed/forbidden IR before execution;
- continued deterministic scientific-kernel tests and Rust→WASM compilation.

The exact AEM equations and parameter semantics remain the responsibility of #14. Round 1C supplies the generic language/runtime they execute through.
