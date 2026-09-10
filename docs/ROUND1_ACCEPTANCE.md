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

The complete Round 1 product must support this end-to-end scenario:

1. open the actual deployed GitHub Pages application;
2. confirm the simulation is computed locally rather than replaying a canned animation;
3. run the reference Active Elastic Model;
4. confirm controller source corresponds recognizably to the local scientific rule;
5. pause and restart successfully;
6. modify a scientifically meaningful controller expression/sign/term;
7. Apply/recompile the source and restart;
8. confirm the trajectory/collective behavior changes in a scientifically corresponding way;
9. restore the reference controller and reproduce the reference behavior for the same seed/configuration;
10. introduce invalid source and confirm a useful compile/validation error without corrupting the lab session;
11. restore valid source and run again.

## Two-agent acceptance loop

Round 1 deliberately separates implementation from browser/computer verification.

### ChatGPT responsibility

ChatGPT performs architecture, implementation, scientific/software tests, repository changes, build/CI/deployment configuration, deployment, and defect repair. Before browser handoff, ChatGPT verifies everything that can be established through code, tests, build artifacts, deployment state, and repository inspection.

### Work responsibility

Work performs only the microscopic deployed-browser checks defined in:

- #16 — desktop simulation controls;
- #17 — controller edit, compile error, and recovery;
- #18 — responsive UI, reload stability, console/network/runtime errors.

Each Work issue records PASS/FAIL and exact reproduction evidence. A Work failure returns to ChatGPT for repair and redeployment, after which that same Work checklist is rerun.

This loop continues until all three Work issues pass.

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

ChatGPT and Work should resolve ordinary software defects before owner handoff. The owner is the final scientific oracle for whether the reproduced Active Elastic dynamics and deliberately broken-controller failure modes are faithful to the model.