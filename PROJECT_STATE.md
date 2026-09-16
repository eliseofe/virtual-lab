# Virtual Lab — Current Project State

Updated: **16 September 2026**

This is the durable current technical state/evidence for future ChatGPT/Work/human sessions. Read `AGENTS.md`, then `PROJECT_CONTROL.md`, before this file. Older implementation history remains available in Git history, closed issues and date-stamped/archive documents.

## Repository and production

- Repository: `eliseofe/virtual-lab`
- Production Lab: `https://eliseofe.github.io/virtual-lab/`
- Supabase project: `izdmmudfrmqhvlgepwes`
- Experiment MCP endpoint: `https://izdmmudfrmqhvlgepwes.supabase.co/functions/v1/experiment-mcp`
- Experiment MCP Edge Function: version **16**, ACTIVE
- MCP server version: **3.0.0**
- MCP interface: **8**
- Capability request interface: `vlab.capability-request/1`
- Registry schema: `vlab.registry-experiment/3`
- Experiment artifact interface: `vlab.experiment-artifacts/3`
- Authoring contract: `vlab.authoring/0.6`
- Results presentation schema: `vlab.results-presentation/1`
- Runtime contract: `vlab.runtime/0.2`
- Artifact capability contract: `vlab.artifact-capabilities/0.3`
- Environment capability contract: `vlab.environment-capabilities/0.1`
- Metrics language: `python-vlab-metrics/0.1`
- Metrics IR: `vlab.metrics-ir/0.1`
- Metrics measurement phase: `post-physics-wrapped-state/1`
- Production neighbour strategy: `adaptive-periodic-bvh/v1`

## Current product checkpoint

**#149 — Professor promotion of an accepted Experiment revision to Showcase is complete and deployed.** There is no automatically activated next implementation ticket. The next intended checkpoint is a short owner/design discussion for **#207 — UI/UX refinement round 2**; implementation of that lane remains intentionally unstarted until the owner activates it.

## #195 — Metrics + live Results epic — complete and externally accepted

The canonical runnable Experiment has four compulsory authored artifacts:

1. `configuration`
2. `initialization`
3. `controller`
4. `metrics`

Metrics is a read-only scientific observer. An empty Metrics artifact is valid. Stable metric IDs, exact scientific sampling, worker/UI transport, live Results, local persistence and fine-grained research-AI authoring are all deployed.

On 16 September 2026 the owner completed a real black-box research-AI acceptance outside the implementation harness. The external research AI read the relevant paper material, extracted candidate metrics, authored the intended metrics through the deployed MCP/Connector, and the resulting Experiment ran correctly in the Lab. The owner then asked the research AI to explain an observed plateau and received the expected formula-based scientific explanation. The owner declared the paper/scientific-context → AI authoring → Virtual Lab execution/results → AI interpretation loop a complete end-to-end success.

### Accepted Active Elastic fixture

The owner-authorized acceptance fixture remains authoritative:

- `polarization`: `psi = ||sum_i heading_i|| / N`, sampled every `0.1 s` for Virtual Lab acceptance/display. The cadence is a product/integration choice and is not claimed as the source paper's analysis/output cadence.
- `angular_momentum`: separately owner-authorized normalized instantaneous milling/angular-momentum complement.

Do not ask for these definitions again and do not alter them without explicit owner authorization.

### #199 — local single-run result persistence — complete/deployed

The canonical scientific result is ordinary user-visible files under a user-selected Virtual Lab workspace root where writable-directory access is supported. Browser-private storage is not the scientific archive.

Standalone run output is flat:

```text
<VirtualLab root>/
  <Experiment>/
    runs/
      polarization_000001.csv
      angular_momentum_000001.csv
      polarization_000002.csv
      angular_momentum_000002.csv
      ...
```

There is no per-run directory. Metric files use stable metric ID + increasing six-digit run number. Existing runs are never overwritten. Compact Lab bookkeeping stays under `<Experiment>/.vlab/`. `Download experiment package` is a secondary whole-Experiment export using the same hierarchy. Future Studies use flat metric files directly under `<Experiment>/studies/<Study>/`, with no additional `runs/` layer.

Primary persistence PRs: #225 and #227. Production acceptance included two consecutive durable runs without overwrite or per-run directories.

### #200 — MCP/Connector Metrics + Results authoring — complete/deployed

The deployed connector exposes fine-grained read/create/update/remove metric operations plus upsert/remove time-series Results panel bindings. Metric identity remains stable across updates. Results presentation state is separate from scientific Experiment revision state.

Current production contract:

- MCP server `3.0.0`;
- interface `8`;
- authoring `vlab.authoring/0.6`;
- Experiment artifacts `vlab.experiment-artifacts/3`;
- Results presentation `vlab.results-presentation/1`;
- Edge Function version `16`.

Research AI still has no GitHub/repository/shell/deployment/admin/simulator-development privilege.

## #149 — Professor promotion to Showcase — complete/deployed

### Product/data model

Showcase is public curation/publication, not an `experiment_collections` row. The deployed model is:

`owned saved Experiment revision → immutable curated snapshot → reversible Showcase publication state`

Implementation uses the existing `preserved_experiment_snapshots` foundation with `snapshot_kind = 'curated'`, extended to preserve description and the current generic artifact representation. `public.showcase_entries` stores publication state separately from the immutable snapshot.

Promotion semantics:

- Professor must own an active saved Experiment and provide the expected exact revision;
- promotion freezes title, description, schema/interface metadata and complete generic authored artifacts into an immutable curated snapshot;
- promotion does not change the source Experiment revision;
- later source edits do not change the published snapshot;
- if a newer revision is promoted, the old active publication is marked removed and the newer exact snapshot becomes active;
- removing from Showcase marks publication removed without deleting the source Experiment or historical curated snapshot;
- public discovery returns only active curated snapshots;
- signed-in users may copy a Showcase Experiment into private work rather than overwrite the canonical publication.

### Authorization/security boundary

- `promote_experiment_to_showcase(uuid,bigint)` and `remove_experiment_from_showcase(uuid)` are `SECURITY DEFINER` RPCs that explicitly require `auth.uid()` and `profiles.role = 'professor'` in their bodies.
- `list_showcase_experiments()` is intentionally public/read-only and may be called anonymously.
- `showcase_entries` has RLS enabled and direct table privileges are revoked from `anon` and `authenticated`; public discovery happens only through the read-only listing RPC.
- research AI receives no Showcase curator/admin privilege.

During terminal verification on 16 September 2026, Supabase inspection found that default function grants had left explicit anonymous `EXECUTE` privileges on the promote/remove RPCs despite the internal authentication/Professor guard. There was no operational authorization bypass because the functions rejected null/non-Professor callers, but the privilege surface was broader than intended. A terminal hardening migration explicitly revoked `anon` and `PUBLIC` execute on promote/remove. Verification after the migration returned:

- anonymous promote: `false`;
- authenticated promote: `true`;
- anonymous remove: `false`;
- authenticated remove: `true`.

The Supabase security advisor now reports only intentional architecture warnings for the public listing `SECURITY DEFINER` RPC and authenticated Professor-gated curation RPCs, plus unrelated pre-existing Auth password-protection advice. RLS-without-policy notices for snapshot/showcase tables are intentional because direct table access is revoked and access is through explicitly guarded RPCs.

### Implementation/deployment evidence

- PR **#234 — Add reversible Professor promotion to Showcase** merged as `7fdc6685ab2351081487e7a2d7904b5354466e70`.
- Main Pages run `35121772061` completed successfully after PR #234.
- PR **#235 — Place Showcase curation in Professor mode** merged as `192669d1fc1999064467a8fd4e0883855b38f613`.
- Main Pages run `35122267503` completed successfully after the final placement repair.
- Production Supabase verification confirms `showcase_entries` plus promote/remove/list RPCs are present.
- At terminal verification there are zero active Showcase entries. This is valid: #149 implements the Professor curation capability; it does not auto-publish eligible Experiments. The accepted AI-authored paper Experiment is now eligible for explicit normal Professor promotion.

## UI/UX refinement state — #207 — UI/UX refinement round 2

#207 is the likely next product lane but is not implementation-activated. The owner wants a short design discussion first.

Preserved observations:

- #208 — unify Experiment identity and Save/Persistence/organization;
- #209 — reconcile Account and Professor entry surfaces;
- #210 — remove unnecessary microcopy and strengthen responsive hierarchy;
- Results series selection works but lacks sufficient affordance;
- plot interaction can detach from the live edge without an obvious follow-live control;
- richer Results panel arrangement/resizing should remain presentation state rather than scientific definition.

The round must not freeze the UI around the current feature set. It must establish stable compositional regions, reusable interaction patterns and progressive disclosure so Studies, richer Results, research memory and future Professor workflows can be added without repeated whole-page redesigns.

## Editor lane — #202 — code authoring ergonomics

Separate authoring-ergonomics epic:

- #203 — highlighting/editor foundation;
- #204 — outline/navigation/folding/search;
- #205 — diagnostics/completion.

Large Metrics source remains one scientific artifact; editor ergonomics must not fragment it merely for presentation.

## Studies boundary — #3

Experiment Results answer: **what happened during this run?**

Studies answer: **what happened across runs/conditions?**

Future Study work composes existing stable metric identities, run identities and flat-file persistence instead of creating an incompatible result architecture.

## Professor capability-request loop

Durable flow:

`research AI request → Professor review → developer design discussion → explicit owner implementation approval → trusted GitHub handoff → deploy/verify → implemented → research AI resumes`

Professor approval alone is not coding approval.

Currently Professor-approved but not implementation-authorized:

- `7492c39d-fdd0-4f29-9661-63dbc6461bf5` — simulator-owned deterministic/reproducible controller RNG capability;
- `49368c8e-dff7-4ce0-9072-bc3f4b37ada2` — heterogeneous agent initialization/state capability.

Durable record: `docs/CAPABILITY_APPROVALS_2026-09-15.md`.

## Neighbour-search / performance state

Production Simulation uses `adaptive-periodic-bvh/v1` with exact receiver-radius membership, arbitrary simultaneous query radii, periodic minimum-image geometry and deterministic sorted neighbour indices.

`PeriodicGridNeighbourIndex` remains the exact reference/fallback and `BruteForceNeighbourIndex` the hidden correctness oracle. #56 — Simulator performance profiling and optimization remains a living umbrella; #179 — encode the benchmark as a persistent Study is deferred until Study infrastructure exists.

## Scientific guardrail

Developer-side ChatGPT must not independently invent new scientific models, derivations, paper-specific equations/parameters, controller logic, metric formulas, scientific sampling choices, retuning or claims of scientific equivalence.

Already owner-authorized scientific definitions may be reused exactly as recorded for implementation and acceptance. Reusing them does not require renewed owner approval and does not authorize changing them.

Generic simulator/software architecture, persistence, buffering, compilers, file formats, UI transport and editor tooling are software work. Preserve simulator-owned RNG, controller information boundaries, environment-owned action application, read-only metric boundaries, scientific timing/integration semantics and rendering as an observer.

Standing observation gatekeeper: global position is disallowed as a robotics controller observation capability unless the owner explicitly reverses that decision.

## Success reporting

GitHub issue #145 — success-only completion reports is the global success-only completion stream. Never post partial/failing/retrying work there. Append one `[SUCCESS REPORT]` comment only after the full ticket lifecycle reaches verified terminal success.
