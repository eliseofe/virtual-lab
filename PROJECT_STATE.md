# Virtual Lab — Current Project State

Updated: **12 September 2026**

This file is the durable, context-free starting point for future ChatGPT/Work/human sessions. Read it before inferring roadmap order from old issue numbering or historical issue bodies.

## Immediate execution order

1. **#63 — AUTHORING/RUNTIME ALIGNMENT** — **NEXT ACTIVE IMPLEMENTATION ISSUE**.
   - Eliminate the current false-positive state where MCP can say an experiment is valid while the production browser still has hidden Active-Elastic-specific setup requirements.
   - Establish one science-neutral runtime/setup boundary shared by production and authoring validation.
   - Use the real Grok-created `Simple Random Walk` experiment as the regression fixture.
2. **#46 — production registry integration EPIC** — starts only after #63.
   - #46 is now an epic, not one implementation pass.
   - Decompose it after #63 into focused private-student production integration passes based on the then-current code.
3. **Further simulator/scientific work chosen by the owner.** Performance work (#56) is likely important, but the owner chooses after functional integration.

**#55 is complete and closed.** It delivered the science-free AI authoring contract and production-parser/compiler validation. Do not keep reopening #55 for every downstream runtime/integration defect; extract focused follow-up issues when the failure surface is different.

**#45 professor/sharing/submission/curation is deferred and separate.** It does not block the private-student production integration path.

**#52 mock-sim visual/UI work is explicitly deprioritized.** It is not the automatic next step after #46.

## Project-management rule for issues

Prefer one issue per coherent implementation/reasoning pass with a narrow acceptance outcome and a reasonably bounded failure surface.

- Close an issue when its core contract/outcome is genuinely complete.
- If later acceptance reveals a different architectural layer is broken, create a focused follow-up issue rather than accreting unrelated scope indefinitely.
- Reopen only when the supposedly completed outcome itself regressed or was never actually achieved.
- Use epics for multi-pass goals such as #46; create focused implementation issues underneath only when the next concrete pass is understood.

This rule is why the post-#55 runtime mismatch is #63 rather than more #55 scope.

## What is already proven

### Experiment registry / MCP / mock workflow

Completed and accepted:

- #41 — experiment contract and synchronization semantics;
- #42 — Supabase registry, authentication, RLS, ownership, lifecycle, revisions;
- #43 — restricted experiment-only MCP;
- #44 — real student workflow through AI ↔ MCP ↔ registry ↔ mock-sim;
- #51 — isolated mock-sim GitHub Pages host;
- #53 — Supabase OAuth configuration;
- #54 — real Claude compact-MCP handshake;
- #55 — science-free AI authoring contract + authoritative parser/compiler validation.

PR #50 merged the #44 mock/registry work. PR #61 implemented the original #55 authoring contract. PR #62 corrected #55 so the MCP contract contains **no Active Elastic scientific reference experiment or model-specific parameter requirements**.

### Live MCP

Supabase project ref: `izdmmudfrmqhvlgepwes`

Endpoint:

`https://izdmmudfrmqhvlgepwes.supabase.co/functions/v1/experiment-mcp`

Current deployed Edge Function: **version 7**.

Current authoring contract: **`vlab.authoring/0.2`**.

The student-facing MCP remains five tools:

1. `read_workspace`
2. `manage_collection`
3. `create_experiment`
4. `edit_experiment`
5. `delete_experiment`

Security boundary remains unchanged: no simulator run/results capability, no simulator source/deployment mutation, no GitHub, shell, arbitrary SQL/filesystem, secrets, or admin path.

### Meaningful genuine authoring acceptance

The first Active Elastic acceptance attempt was invalid as a meaningful authoring test because Grok copied the exact reference experiment that had been embedded in the MCP contract. That scientific reference was removed from the MCP in PR #62.

The meaningful owner test is the later Grok/VU experiment:

- title: **Simple Random Walk**
- experiment ID: `75a313d5-150a-4831-b4f7-b02255a1482e`
- created by Grok on the VU identity through MCP v7;
- config, initializer and controller are genuinely new and non-empty;
- `vlab.authoring/0.2` accepted the three artifacts using the science-free contract.

This demonstrates that the authoring contract is useful enough for a real AI to create a new valid parser/compiler-level experiment without copying Active Elastic.

## Why #63 exists

Mechanical inspection of current production `web/src/main.js::compileSetup` revealed hidden first-experiment assumptions. Production setup still requires Active-Elastic-specific keys such as `U`, `OMEGA_MAX`, `K1`, `K2`, `POTENTIAL_ALPHA`, `POTENTIAL_EPSILON`, `DESIRED_DISTANCE`, `PROXIMAL_RANGE`, and `INITIAL_POSITION_NOISE`.

Therefore `Simple Random Walk` can currently be accepted by MCP while the current browser setup would reject it before run. This is a real architectural mismatch.

The fix is **not** to put Active Elastic science back into MCP. #63 must separate simulator/runtime-owned requirements from experiment-defined scientific parameters and keep the production browser and validator mechanically aligned.

Important acceptance invariant for #63:

> There must be no state where MCP reports `valid: true` but the same three sources fail production setup solely because the browser has hidden model-specific requirements unknown to the authoring contract.

A genuinely required **generic simulator setting** may still cause rejection, but then the validator must reject it first with a precise science-free diagnostic that Grok/Claude can repair conversationally.

## #46 after #63

#46 is now an **epic** for production registry integration. Its older body is historically useful but too broad for one implementation pass and still contains stale text saying #45 is a hard prerequisite.

After #63, decompose #46 into the smallest justified private-student integration passes, likely covering some sequence of:

- authenticate/list/load registry experiments in production;
- make loaded validated sources enter the normal local compile/run path;
- save lab edits back through optimistic revision semantics;
- remote refresh/update handling and conflict safety;
- end-to-end AI ↔ registry ↔ production Lab round-trip.

Do not pre-commit to exact subissue boundaries before #63 exposes the final runtime interface.

Professor/shared/curated workflows remain #45 and are not bundled into the first private-student integration pass.

## Scientific guardrail

Implementation work may reason about software architecture, parser/compiler design, runtime interfaces, synchronization, security, performance, tests and deployment.

Do **not** independently perform scientific reasoning, derivations, equilibrium calculations, model analysis, parameter inference, or scientific retuning of the simulated system.

If a software decision appears to require a new scientific choice, stop and ask the owner that specific question. Existing accepted scientific values/behavior may be preserved mechanically during refactoring.

## Other important backlog

- #56 — performance epic; profile before optimizing.
- #57 — canonical deterministic RNG with domain-separated streams.
- #58 — extensible capability registry and student feature-request path.
- #29 — runtime speed saturation.
- #31 — large-swarm neighbour benchmark.
- #6 — future explicit Lab → AI results/plots channel.
- #8 — future native/HPC backend.
- #52 — future/deprioritized mock-sim visual twin.
- #14 and #2 — older scientific validation issues; owner suspects they may be partly obsolete. Audit later against actual current simulator before scheduling them.

## Cost invariant

This remains a **zero-euro incremental-cost project**. Baseline uses GitHub/GitHub Pages, the existing Supabase free-tier project, client-side browser compute, and already-owned AI subscriptions/accounts.

## Resume instructions for a context-free agent

1. Read this file.
2. Read **#63** in full.
3. Inspect the current production setup path, kernel setup requirements, and `vlab.authoring/0.2` validator before changing architecture.
4. Keep MCP science-free.
5. Preserve Active Elastic behavior mechanically; do not scientifically retune it.
6. Complete and accept #63 before decomposing/starting #46 implementation.
7. When #63 is complete, return to #46 and create only the next focused integration pass(es) justified by the code.
8. After functional production integration, ask the owner what simulator/scientific work is next; do not automatically start #52.
