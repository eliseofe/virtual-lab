# Scientific Contract

This document contains requirements whose violation can invalidate scientific results even if the software appears to work.

## Agent contract

An agent is stateful and encapsulated.

```text
action = agent.step(observation)
```

- `observation` is local and produced by the simulator according to the experiment's observation model.
- The agent owns private internal state.
- Only the agent/controller may mutate its private state.
- The simulator/environment may not write into private controller state.
- The controller returns an action. It does not directly update position, velocity, heading, or other world state.
- The controller has no direct reference to the environment, simulator, global agent collection, RNG, seed, clock, network, or filesystem.

A read-only instrumentation interface may later expose selected private state for debugging/metrics only when explicitly declared by the experiment; observation/control semantics remain unchanged.

## Randomness contract

Randomness belongs to the simulator.

- Seeds and PRNG streams are simulator/run configuration.
- Sensing noise is applied while the simulator constructs observations.
- Actuation noise is applied by the simulator when actions are applied.
- Random initial conditions are created by the simulator.
- Probabilistic controller rules must preserve simulator ownership of sampling/reproducibility.
- Re-running the same immutable experiment revision with the same run seed and execution semantics should reproduce the same scientific trajectory within the reproducibility guarantees documented for that backend.

## Physics contract

Physics is independent from control.

The initial engine may implement simple kinematics. The architecture must support later replacement/addition of dynamic physics without redefining the fundamental controller API.

Physics owns physical variables. Whether heading, velocity, angular velocity, acceleration, motor commands, etc. are exposed through observations/actions depends on the chosen model.

## Control contract

Control has its own update period. At a control event:

1. simulator constructs each agent's permitted observation;
2. controller executes against that observation and private state;
3. controller returns an action;
4. simulator stores/applies the action according to the active physics/actuation model.

The action may remain active between control updates.

## Visualization contract

Visualization is a pure observer of simulation state.

- Turning visualization on/off cannot change results.
- Rendering frequency cannot affect physics/control scheduling.
- Headless mode is scientifically equivalent to visual mode for the same run configuration.
- Replay may render recorded state after execution; it need not rerun the scientific simulation.

## Metrics contract

Collective metrics are separate from controllers.

Metrics observe read-only scientific state. They may use global state because they are measurement apparatus, not agent perception. Metric access must never leak back into the controller.

Conceptually:

```text
metric.observe(read_only_snapshot)
metric.finalize() -> result
```

Metrics may sample at their own configured interval.

## Observation and neighbourhood contract

Agent perception is part of the scientific model. The experiment must define what is observable, in what coordinate frame, with what range/topology, and with what sensing noise. Optimized neighbourhood lookup is an implementation detail.

A brute-force neighbour-query implementation should serve as a correctness oracle. Any optimized spatial hash/grid/index must return scientifically equivalent observations for the same state and observation model.

## Action contract

The agent proposes an action; the simulator interprets and applies it under the selected physics/actuation model. This boundary allows the same controller concept to coexist with different physical models where scientifically meaningful.

## Controller authoring contract

Researcher-facing controller source must remain readable and recognizable. Initial direction: a constrained Python subset compiled before a run.

The intended pipeline is:

```text
Python-like source
 -> parser / AST
 -> allowed-subset validation
 -> scientific/type validation
 -> controller IR
 -> executable target
```

During a run, the scientific kernel must not rely on a Python interpreter call per agent or per control tick. Python is an authoring language; efficient compiled controller logic is the execution representation.

The controller language/IR must preserve the scientific boundaries above. Compiler convenience must never grant controllers hidden access to simulator state, randomness, or action application.

## Active Elastic Model as Round 1 validation

The first reference experiment should implement the Active Elastic Model described in:

- Ferrante et al., PRL 111, 268302 (2013), DOI 10.1103/PhysRevLett.111.268302
- Ferrante et al., NJP 15, 095011 (2013), DOI 10.1088/1367-2630/15/9/095011

AEM is chosen because coherent translating/rotating behavior emerges from elastic interactions without explicit heading alignment. A plausible flock-like animation is not sufficient validation.

Implementation must derive and document equations, initial topology, parameter conventions, noise semantics, and integration assumptions from the papers. Where PRL/NJP differ in purpose or presentation, record which formulation Round 1 reproduces.

The displayed Python controller should be recognizable as the scientific local rule. Environment/physics responsibilities remain outside the controller.

## Validation philosophy

Every optimization must have a correctness oracle where feasible.

Examples:

- spatial hash neighbor sets compared with brute force;
- headless trajectory compared with visual trajectory for identical seed;
- render-rate changes tested independently from control/physics scheduling;
- deterministic seed tests;
- controller compilation tests from source → IR → executable behavior;
- environment unable to mutate controller-private state;
- controller unable to mutate world state directly;
- deliberately broken AEM controller produces changed/failing behavior rather than being masked by renderer or hard-coded dynamics.