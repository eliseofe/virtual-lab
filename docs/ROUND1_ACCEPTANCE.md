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
6. modify an owner-authorized controller expression/sign/term;
7. Apply/recompile the source and restart;
8. observe the resulting behavior;
9. restore the reference controller and reproduce the reference behavior for the same seed/configuration;
10. introduce invalid source and confirm a useful compile/validation error without corrupting the lab session;
11. restore valid source and run again.

## Asynchronous acceptance boundary

The original Round 1 process used a synchronous implementation → deploy → browser verification → repair → repeat loop. That process is retired because asynchronous external work must never sit inside the agent execution loop.

### ChatGPT responsibility

ChatGPT performs bounded architecture/implementation work, finite repository operations, and local deterministic software tests. At the terminal delivery boundary it updates durable state and `.github/terminal-report.json`, commits, and stops.

ChatGPT does **not** wait for or poll CI, GitHub Pages, Work/browser jobs, remote benchmarks, authentication or any other asynchronous external system.

### Autonomous CI responsibility

GitHub CI independently performs the production build, Pages deployment, and manifest-driven current-Lab browser smoke checks. Each smoke check has a hard timeout. CI posts one terminal success/failure notification without the agent monitoring it.

### Optional Work/browser responsibility

Work/browser/computer inspection is not a mandatory synchronous acceptance loop. Use it only when the owner explicitly requests a visual/interaction audit or when a later failure diagnosis specifically requires it. One bounded invocation is allowed. If it does not return a terminal result, stop; never poll, wait, or rerun it in the same turn.

A failure notification becomes a new, later diagnostic turn. Repair work never waits inside the original delivery turn for a remote result.

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

The owner remains the final scientific oracle for scientific faithfulness. Engineering automation verifies software/runtime contracts independently and reports terminal status; it does not force the assistant into a waiting loop.
