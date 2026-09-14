# Capability Generalization / Refactor Gate

This gate applies before implementing every new paper-driven simulator capability.

The objective is to prevent a sequence of individually reasonable capability requests from accumulating paper-specific simulator branches, duplicate representations, or parallel execution paths that later become difficult for the owner to diagnose from the UI.

## Before implementation

For the requested capability, explicitly check:

1. **Paper-specific simulator semantics** — would the simulator itself contain names, equations, parameter meanings, or behavior belonging to one paper/experiment rather than a generic capability?
2. **Duplicate execution path** — would this add a second way to perform an operation already represented by an existing abstraction?
3. **Duplicate representation** — would the same concept need to be stored or authored independently in multiple places that could drift?
4. **Growing special-case conditionals** — would implementation require branching by experiment/paper/capability identity instead of dispatching through a stable interface?
5. **Wrong abstraction boundary** — is the request being placed in controller, initialization, environment, physics, visualization, Study orchestration, or another layer merely because that is convenient rather than because that layer owns the concept?
6. **Second pressure on the same provisional abstraction** — has a previous capability already stretched this same abstraction in a different direction?

If any check is materially true, **stop before implementation** and bring the owner a concise refactor/generalization proposal. Do not hide the structural decision inside the capability ticket.

A refactor proposal should state:

- what accumulated structure is becoming problematic;
- which generic abstraction/interface should replace it;
- which existing behavior would migrate without scientific change;
- what remains capability-specific afterward;
- whether the refactor should precede the requested capability or can safely follow it.

## Periodic architecture audit

Even if no individual request trips the gate, perform a focused capability-extension audit at the earlier of:

- every **three implemented paper-driven simulator capabilities**, or
- the **second new capability that materially extends the same subsystem/abstraction**.

The audit is engineering-only: look for duplication, coupling, versioning pressure, inconsistent ownership, and interface drift. Do not independently revise scientific models, derive new science, retune parameters, or generalize scientific semantics.

## Relationship to the scientific guardrail

Generalizing software structure is allowed. Generalizing a scientific model is not automatic. If a proposed refactor requires deciding that two scientific concepts are equivalent, deriving a common model, changing equations, or interpreting paper-specific science, stop and discuss that scientific question with the owner.

## Current example: scalar Environment

Issue #143 passes this gate for its first version because:

- the simulator implements a generic deterministic scalar field, not a Karagüzel et al. field;
- the existing Initialization artifact owns setup of agents and static Environment state;
- one simulator-owned Environment evaluator supplies both local sensing and visualization samples;
- the controller receives only the typed local scalar observation;
- no paper identifier or paper-specific equation is added to simulator code.

The first-version scalar-field syntax is deliberately narrow. If later papers require piecewise fields, multiple fields, dynamic fields, resources, obstacles, or other environment behavior, treat that as new pressure on the Environment abstraction and run this gate again before extending it.
