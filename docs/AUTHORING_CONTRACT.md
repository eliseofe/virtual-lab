# Experiment Authoring Contract

## Status quo

Virtual Lab uses three student-editable source artifacts:

1. **configuration** — restricted Python-like `NAME = value` assignments, compiled by `web/src/config/compiler.js` to `vlab.config/0.2`;
2. **initializer** — restricted Python-like function syntax, compiled/evaluated by `web/src/initializer/compiler.js` to deterministic initial state `vlab.initializer-state/0.2`;
3. **controller** — `python-vlab/0.1`, compiled by `web/src/controller/compiler.js` to `vlab.controller-ir/0.1` and executed by the Rust/WASM kernel.

The controller source is not general Python. It is a deliberately constrained Python-compatible authoring language. The simulator owns the observation/action boundary and rejects unavailable host capabilities.

The current controller interface exposes only simulator capabilities: local heading, neighbouring agents' relative positions, the `Motion(forward, turning)` action, and the approved intrinsic set documented by the machine-readable contract.

## Science-free contract boundary

The MCP authoring contract contains **no scientific model, experiment, parameter set, controller example, or reference experiment**. Its job is only to tell an AI how the Virtual Lab software interface works.

The contract may describe:

- artifact/compiler versions;
- grammar and accepted source structure;
- simulator-owned structural requirements;
- observation/action/intrinsic capabilities;
- forbidden capabilities;
- diagnostic categories;
- execution/security boundaries.

Experiment-specific parameter names and values are supplied by the student/AI conversation. The contract does not privilege the currently built-in experiment or any other scientific model.

## Authoritative validation path

Issue #55 adds a server-side **compile-without-simulation** validation path for AI-authored registry writes. It uses byte-identical vendored copies of the production configuration, initializer and controller compiler modules. CI asserts those copies remain byte-identical to production so parser/compiler changes cannot silently drift from MCP validation.

Validation performs only software-authoring checks:

- configuration parsing;
- initializer parsing/evaluation with a deterministic simulator-owned validation seed;
- controller parsing/type/capability validation using the numeric parameters present in that experiment's own configuration.

It does not require the parameter names of the currently built-in experiment, does not inject scientific values, and does not run the simulation.

Invalid source writes are rejected. The MCP returns structured diagnostics and the AI repairs the source conversationally before retrying.

## Machine-readable contract

`supabase/functions/experiment-mcp/authoring.js` exports `AUTHORING_CONTRACT` (`vlab.authoring/0.2`). `read_workspace(include_authoring_contract=true)` exposes it through the existing compact five-tool MCP.

The only current configuration field that is structurally required by the initializer implementation is `N`, a positive integer used to allocate the agent state. Additional configuration names are experiment-defined. Finite numeric values are automatically available to `python-vlab` controllers as scalar parameters.

## Extensibility

The contract presents observations, actions, and intrinsics as typed/versioned capability descriptors rather than treating today's vocabulary as permanent.

Adding a future capability still requires simulator implementation and compiler support. Student-side AI cannot add simulator capabilities. Unsupported needs are surfaced as structured capability diagnostics and are tracked separately by issue #58 for the feature-request/triage workflow.

The controller IR remains a versioned semantic boundary independent of the browser/WASM deployment target. Future native/HPC or export backends can consume the same experiment semantics without changing the student authoring model.

## Production integration boundary

The current production browser still contains setup wiring inherited from its first built-in experiment. Removing those experiment-specific runtime assumptions from the production loading path belongs to #46, when registry experiments are connected to the real Lab.

#55 must not reproduce those assumptions inside the MCP validator. Otherwise the authoring channel would accept the built-in experiment while incorrectly rejecting other valid experiments.

## Randomness

Issue #55 does not refactor RNG ownership. Today initialization and runtime stochasticity use separate deterministic implementations/streams. The planned canonical RNG/domain-separated-stream refactor is tracked by issue #57 and is intentionally not a blocker for the authoring contract.

## Acceptance boundary

#55 proves that a normal AI client can retrieve a science-free software contract, author genuinely new source artifacts, receive authoritative parser/compiler diagnostics, and save an experiment whose three source artifacts are valid for the supported language/capability surface.

#46 remains responsible for generalizing the production runtime-loading seam and connecting registry experiments to the browser simulator for manual execution.
