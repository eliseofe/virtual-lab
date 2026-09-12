# Experiment Authoring Contract

## Status quo

Virtual Lab uses three student-editable source artifacts:

1. **configuration** — restricted Python-like `NAME = value` assignments, compiled by `web/src/config/compiler.js` to `vlab.config/0.2`;
2. **initializer** — restricted Python-like function syntax, compiled/evaluated by `web/src/initializer/compiler.js` to deterministic initial state `vlab.initializer-state/0.2`;
3. **controller** — `python-vlab/0.1`, compiled by `web/src/controller/compiler.js` to `vlab.controller-ir/0.1` and executed by the Rust/WASM kernel.

The controller source is not general Python. It is a deliberately constrained Python-compatible authoring language. The simulator owns the observation/action boundary and rejects unavailable host capabilities.

The current controller interface exposes only simulator capabilities: local heading, neighbouring agents' relative positions, the `Motion(forward, turning)` action, and the approved intrinsic set documented by the machine-readable contract.

## Science-free contract boundary

The MCP authoring contract contains **no scientific model, reference experiment, model equation, scientific parameter set, or model-specific controller source**. Its job is only to tell an AI how the Virtual Lab software interface works.

The contract may describe:

- artifact/compiler versions;
- grammar and accepted source structure;
- simulator-owned runtime requirements;
- observation/action/intrinsic capabilities;
- forbidden capabilities;
- diagnostic categories;
- execution/security boundaries.

Experiment-specific scientific parameter names and values are supplied by the student/AI conversation. The contract does not privilege the currently built-in experiment or any other scientific model.

## Authoritative validation path

Issue #55 established server-side **compile-without-simulation** validation for AI-authored registry writes using byte-identical vendored copies of the production configuration, initializer and controller compiler modules.

Issue #63 adds one further shared software boundary: `web/src/runtime/contract.js` (`vlab.runtime/0.1`). The MCP vendors that file byte-identically and CI asserts parity, just like the three compiler modules.

Validation therefore covers:

- configuration parsing;
- simulator-generic runtime requirements;
- initializer parsing/evaluation with a deterministic simulator-owned validation seed;
- initial-state compatibility with the declared runtime arena;
- controller parsing/type/capability validation using the numeric parameters present in that experiment's own configuration.

It does not inject model-specific scientific values and does not run the simulation.

Invalid source writes are rejected. The MCP returns structured diagnostics and the AI repairs the source conversationally before retrying.

## Machine-readable contract

`supabase/functions/experiment-mcp/authoring.js` exports `AUTHORING_CONTRACT` (`vlab.authoring/0.3`). `read_workspace(include_authoring_contract=true)` exposes it through the existing compact five-tool MCP.

The science-neutral runtime contract currently requires these simulator interface fields in `config_source`:

- `N` — positive integer agent count;
- `ARENA_SIZE` — positive finite scalar;
- `CONTROL_DT` — positive finite scalar compatible with the simulator integration step;
- `SENSOR_NOISE` — non-negative finite scalar;
- `EXPERIMENT_DURATION` — positive finite scalar;
- `INTERACTION_RADIUS` — positive finite scalar used by neighbour observations;
- `MAX_FORWARD_SPEED` — positive finite scalar actuator limit;
- `MAX_ANGULAR_SPEED` — positive finite scalar actuator limit.

The simulator-owned integration and metric steps are exposed as runtime contract constants. Additional configuration names remain experiment-defined. Finite numeric values are automatically available to `python-vlab` controllers as scalar parameters.

These names describe simulator/runtime interfaces, not any specific scientific model.

## Production browser alignment

The production browser now consumes the same generic runtime contract for experiment setup. This removes the old generic `compileSetup` dependency on Active-Elastic-specific parameter names.

The pre-#63 built-in Active Elastic source still uses its historical names. A temporary compatibility adapter exists **only in the production browser** so that the built-in experiment keeps its current behavior during this refactor. Those legacy model-specific aliases are deliberately absent from the MCP contract and runtime-contract vendor.

Registry-authored experiments use the generic runtime names directly.

The key invariant is:

> An experiment must not be accepted as runnable by MCP and then fail production setup merely because the browser has hidden model-specific required keys unknown to the authoring contract.

If a genuinely required generic runtime setting is missing, validation rejects the write first with a structured `runtime-parameter` diagnostic.

## Genuine owner acceptance fixture

The owner used Grok on the VU identity to create a new experiment named `Simple Random Walk` without copying Active Elastic. The science-free `vlab.authoring/0.2` contract originally accepted it.

That test exposed the hidden production mismatch: the experiment omitted generic runtime settings that the current kernel ultimately needs, while the browser still expected Active-Elastic-specific aliases.

Under `vlab.authoring/0.3`, the same old revision is intentionally rejected with a precise generic runtime diagnostic rather than being falsely accepted. Grok/Claude can then add the required simulator-runtime settings and retry conversationally.

## Extensibility

The contract presents observations, actions, and intrinsics as typed/versioned capability descriptors rather than treating today's vocabulary as permanent.

Adding a future capability still requires simulator implementation and compiler support. Student-side AI cannot add simulator capabilities. Unsupported needs are surfaced as structured capability diagnostics and are tracked separately by issue #58 for the feature-request/triage workflow.

The controller IR remains a versioned semantic boundary independent of the browser/WASM deployment target. Future native/HPC or export backends can consume the same experiment semantics without changing the student authoring model.

## Randomness

Issue #63 does not refactor RNG ownership. The planned canonical RNG/domain-separated-stream refactor remains #57.

## Issue boundaries

- **#55 complete:** science-free authoring contract + parser/compiler validation.
- **#63:** align authoring validity with the generic production runtime/setup boundary; eliminate false-positive valid experiments.
- **#46 after #63:** production registry authentication/list/load/save/synchronization, decomposed into focused implementation passes.

Scientific validation or retuning of Active Elastic is outside these software-contract issues.