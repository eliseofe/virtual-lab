# Scientific Contract

This document contains requirements whose violation can invalidate scientific results even if the software appears to work.

Current project status is recorded in `CURRENT_STATUS.md`; development procedure is defined in `DEVELOPMENT_WORKFLOW.md`.

## Agent contract

An agent is stateful and encapsulated.

```text
action = agent.step(observation)
```

- `observation` is local and produced by the simulator according to the Experiment's observation model.
- The agent owns private internal state.
- Only the agent/controller may mutate its private state.
- The simulator/environment may not write into private controller state.
- The controller returns an action; it does not directly update world/physical state.
- The controller has no direct reference to global world state, the global agent collection, host RNG/seed, arbitrary clock, network, filesystem or simulator object.
- Global position is not a robotics controller observation capability unless the owner explicitly changes that gatekeeper decision.

## Randomness contract

Randomness belongs to the simulator.

- Seeds/PRNG streams are simulator/run configuration.
- Random initialization, sensing noise, actuation noise and stochastic sampling remain simulator-owned.
- A future controller stochasticity API must expose simulator-owned deterministic/reproducible sampling rather than a private host RNG.
- Re-running the same exact scientific definition/seed/execution semantics should reproduce the same scientific trajectory within the documented backend guarantees.

## Physics and action contract

Physics is independent from control. The initial engine may use simple kinematics, but the controller boundary does not depend on one physical model.

At a control event:

1. simulator constructs each agent's permitted local observation;
2. controller executes against that observation and private state;
3. controller returns an action;
4. environment/simulator interprets and applies the action under the active physics/actuation model.

The controller never applies actions directly to world state.

## Visualization contract

Visualization is a pure observer.

- Turning visualization on/off cannot change scientific results.
- Rendering frequency cannot affect physics/control/metric scheduling.
- Display decimation cannot delete or mutate retained scientific samples.
- Headless execution, when used, must preserve the same scientific semantics for the same run definition.

## Experiment artifact contract

A runnable Experiment currently has four compulsory scientific/authoring artifacts:

1. Configuration
2. Initialization
3. Controller
4. Metrics

Metrics is compulsory because measurement belongs to the single-run Experiment definition. Its content may validly contain zero metric definitions.

Results panel layout is separate presentation/workspace state and does not create a new scientific Experiment revision.

## Metrics contract

Metrics are measurement apparatus, not controller perception.

They observe a versioned read-only global scientific snapshot and cannot mutate agents/world/actions, consume arbitrary host state, use arbitrary RNG, access controller-private state, filesystem or network, or grant new simulator capability.

Current Metrics language: `python-vlab-metrics/0.1`.

Current measurement point: `post-physics-wrapped-state/1`.

Current supported metric sampling declarations include exact periodic `every(seconds)` and `final()`. Runtime rejects a periodic cadence that cannot be scheduled exactly on the simulation timestep rather than silently rounding it.

Metric evaluation cadence, worker/UI transfer cadence, plot redraw cadence and persistence flush cadence are independent.

## Owner/research-AI scientific authority

Developer-side ChatGPT/implementation agents may reason about software architecture, compilers, persistence, buffering, UI transport and correctness tests. They must **not independently invent or derive new paper-specific scientific definitions**, including:

- model equations or transformations;
- controller laws;
- metric formulas;
- scientific parameter values/retuning;
- paper-specific sampling semantics;
- claims that one scientific formulation is equivalent to another.

When a requested Experiment requires scientific content, that content must come from the owner/research-AI scientific workflow or a previously explicit owner authorization.

Once a scientific definition is explicitly owner-authorized and durably recorded, implementation/acceptance work may reuse it exactly. Do **not** ask the owner to repeat it merely because an older issue still says “owner input required.” Do not modify the accepted definition without new authorization.

## Active Elastic accepted fixture

The owner-authorized Active Elastic acceptance fixture includes:

```text
metric id: polarization
psi = ||sum_i heading_i|| / N
```

It observes the read-only agent headings and agent count through the Metrics snapshot contract.

For Virtual Lab product/integration acceptance it is sampled every `0.1 s`. This cadence is explicitly an acceptance/display choice and is **not** asserted to reproduce the paper's analysis/output sampling cadence.

The canonical Active Elastic Showcase/catalog fixture also contains an owner-authorized `angular_momentum` normalized instantaneous milling complement. It may be used as the already-approved second series for generic Results acceptance; it is not claimed as a verbatim second order-parameter equation printed in Ferrante et al. PRL.

The deployed two-metric Results behavior using this fixture was owner-accepted on phone on 16 September 2026. This is durable accepted scientific input, not an active implementation issue.

## Observation and neighbourhood contract

Agent perception is part of the scientific model. The Experiment must define what is observable, in what coordinate frame/range/topology and with what sensing semantics.

Optimized neighbour lookup is an implementation detail. Production uses `adaptive-periodic-bvh/v1`; exact reference/oracle paths remain available for correctness testing. Optimization must preserve the same scientifically defined neighbour membership/order semantics required by the controller runtime.

## Controller authoring contract

Researcher-facing controller source is a constrained Python-compatible authoring language compiled before execution. Python is not interpreted across the simulator boundary per agent/control step.

Compiler convenience must never grant hidden access to simulator state, randomness or action application.

## Validation philosophy

Every optimization or adapter should have a correctness oracle/test where feasible. Examples include:

- optimized neighbour sets against exact reference/brute force;
- render-on/off trajectory identity for identical seed/configuration;
- metric-on/off trajectory identity when Metrics is observational;
- persistence flush cadence changes not altering scientific samples/trajectory;
- controller/initializer/metrics compiler validation from source to runtime representation;
- environment unable to mutate controller-private state;
- controller unable to mutate world state directly;
- stale scientific revisions rejected rather than overwritten.

Scientific correctness and software correctness are distinct: the implementation agent can prove that the Lab executes an accepted formula correctly, but it must not silently decide what the formula should have been.
