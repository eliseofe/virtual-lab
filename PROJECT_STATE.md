# Virtual Lab — Current Project State

Updated: **12 September 2026**

This file is the durable, context-free starting point for future ChatGPT/Work/human sessions. Read it before inferring roadmap order from old issue numbering or historical issue bodies.

## Immediate execution order

1. **#46 — production registry integration EPIC** — **NEXT ACTIVE ARCHITECTURAL STAGE**.
   - #46 is an epic, not one implementation pass.
   - Inspect the current production/registry boundary and decompose only the next concrete private-student integration pass(es) that are justified by the code.
   - Keep each child issue to one coherent reasoning/implementation pass with a bounded failure surface.
2. **Further simulator/scientific work chosen by the owner.** Performance work (#56) is likely important, but the owner chooses after functional integration.

**#55 is complete and closed.** It delivered the science-free AI authoring contract and authoritative parser/compiler validation.

**#63 is complete and closed.** It aligned AI validation with the production runtime/setup boundary and removed the false-positive validity gap exposed by the genuine Grok `Simple Random Walk` acceptance fixture.

**#45 professor/sharing/submission/curation is deferred and separate.** It does not block the private-student production integration path.

**#52 mock-sim visual/UI work is explicitly deprioritized.** It is not the automatic next step after #46.

## Project-management rule for issues

Prefer one issue per coherent implementation/reasoning pass with a narrow acceptance outcome and a reasonably bounded failure surface.

- Close an issue when its core contract/outcome is genuinely complete.
- If later acceptance reveals a different architectural layer is broken, create a focused follow-up issue rather than accreting unrelated scope indefinitely.
- Reopen only when the supposedly completed outcome itself regressed or was never actually achieved.
- Use epics for multi-pass goals such as #46; create focused implementation issues underneath only when the next concrete pass is understood.

This is why the post-#55 runtime mismatch became #63 rather than more #55 scope.

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
- #55 — science-free AI authoring contract + authoritative parser/compiler validation;
- #63 — science-neutral shared runtime contract + authoring/runtime validity alignment.

PR #50 merged the #44 mock/registry work. PR #61 implemented the original #55 authoring contract. PR #62 removed the invalid Active Elastic scientific reference from the student-facing contract. PR #64 implemented #63 and aligned production setup with the generic runtime contract.

### Live MCP

Supabase project ref: `izdmmudfrmqhvlgepwes`

Endpoint:

`https://izdmmudfrmqhvlgepwes.supabase.co/functions/v1/experiment-mcp`

Current deployed Edge Function: **version 8**.

Current authoring contract: **`vlab.authoring/0.3`**.

Current shared runtime contract: **`vlab.runtime/0.1`**.

The student-facing MCP remains five tools:

1. `read_workspace`
2. `manage_collection`
3. `create_experiment`
4. `edit_experiment`
5. `delete_experiment`

Security boundary remains unchanged: no simulator run/results capability, no simulator source/deployment mutation, no GitHub, shell, arbitrary SQL/filesystem, secrets, or admin path.

### Genuine authoring/runtime acceptance

The first Active Elastic acceptance attempt was invalid as a meaningful authoring test because Grok copied the exact reference experiment that had been embedded in the MCP contract. That scientific reference was removed in PR #62.

The meaningful owner test is the later Grok/VU experiment:

- title: **Simple Random Walk**
- experiment ID: `75a313d5-150a-4831-b4f7-b02255a1482e`
- initially created by Grok through MCP v7 from the science-free `vlab.authoring/0.2` contract;
- the first revision exposed the real #63 gap: parser/compiler validation passed while generic production runtime requirements were not yet part of the authoring validity boundary;
- after PR #64 and MCP v8, Grok re-read `vlab.authoring/0.3`, repaired the same experiment conversationally, and saved revision **2**;
- registry inspection confirms revision 2 was written by the AI channel and includes the complete generic `vlab.runtime/0.1` configuration requirements;
- the v8 write path rejects source changes unless the authoritative shared validator accepts all three artifacts and runtime requirements;
- PR #64 CI plus post-merge main build, Pages deployment, and browser smoke passed.

This is the accepted #63 outcome: the previously false-positive experiment is now either rejected precisely or repairable by the student AI against the same science-neutral validity boundary used by production setup.

## #46 — next stage

#46 is an **epic** for production registry integration. Its older body is historically useful but too broad for one implementation pass and may contain stale dependency wording.

The architectural target remains:

student AI authors validated experiment → registry → production Virtual Lab loads the same sources → student manually runs/observes → local Lab edits can be saved back safely → AI can read the updated experiment later.

The student AI still must not run the simulator or observe simulation results automatically; the future explicit results channel remains #6.

Before implementing #46 directly, inspect the current production UI/worker/registry seams and extract only the smallest justified child issue(s). Likely areas include:

- authenticate/list/load private registry experiments in production;
- make loaded validated sources enter the existing local compile/run path;
- save Lab edits back with optimistic revision semantics;
- remote refresh/update handling and conflict safety;
- final AI ↔ registry ↔ production Lab round-trip acceptance.

Do not assume these are the final issue boundaries until the current code is inspected.

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
2. Read **#46** and its latest comments before treating its historical body as authoritative.
3. Inspect the current production UI/worker path and registry/MCP boundary.
4. Keep MCP science-free and preserve the current five-tool student-facing surface unless a focused issue proves a change is necessary.
5. Preserve Active Elastic behavior mechanically; do not scientifically retune it.
6. Decompose #46 into the next smallest justified private-student integration issue(s) before implementation.
7. Keep student AI unable to run simulations or observe results automatically.
8. After functional production integration, ask the owner what simulator/scientific work is next; do not automatically start #52.
