# Round 1 Acceptance Protocol

Round 1 is a scientific-kernel validation milestone, not a generic frontend demo.

## Required user-visible state

The deployed standalone Virtual Lab must present:

- experiment collection/selector;
- Active Elastic Model experiment selected by default;
- scientific metadata/reference;
- live simulation viewport;
- visible editable Python-like controller source;
- Run, Pause, Restart;
- Apply controller changes followed by clean restart/reinitialization;
- useful compile/validation/runtime error display;
- coherent responsive presentation.

## Scientific acceptance scenario

1. Open the actual deployed GitHub Pages application.
2. Confirm the simulation is computed locally rather than replaying a canned animation.
3. Run the reference Active Elastic Model.
4. Confirm controller source corresponds recognizably to the local scientific rule.
5. Pause and restart successfully.
6. Modify a scientifically meaningful controller expression/sign/term.
7. Apply/recompile the source and restart.
8. Confirm the trajectory/collective behavior changes in a scientifically corresponding way.
9. Restore the reference controller and reproduce the reference behavior for the same seed/configuration.
10. Introduce invalid source and confirm a useful compile/validation error without corrupting the lab session.
11. Restore valid source and run again.

## Engineering self-verification loop

The implementation agent repeats:

```text
implement
  -> automated tests
  -> production/static build
  -> deploy GitHub Pages
  -> open deployed URL in browser
  -> interact with all required controls
  -> inspect visual state + console/network/runtime errors
  -> compare behavior with requirements
  -> repair
  -> repeat
```

The first successful build is not a completion condition.

## Automated invariant checks expected in Round 1

- deterministic same-seed execution;
- render-rate/visualization independence;
- physics/control scheduling separation;
- controller-private-state isolation;
- simulator-owned randomness;
- controller cannot directly mutate physical state;
- source→IR→executable correctness for supported constructs;
- useful rejection of unsupported/invalid controller constructs;
- brute-force neighbourhood correctness oracle;
- worker/WASM initialization and message protocol;
- experiment schema validation.

## Owner-review boundary

The implementation agent should resolve ordinary software defects before handoff. The owner is the final scientific oracle for whether the reproduced Active Elastic dynamics and deliberately broken-controller failure modes are faithful to the model.