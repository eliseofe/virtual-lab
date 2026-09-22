# Virtual Lab — Roadmap

This file answers **where the project is going**. Current deployed/project state lives in `CURRENT_STATUS.md`; execution procedure lives in `DEVELOPMENT_WORKFLOW.md`.

## Strategic posture

The production baseline already includes scientific browser execution, four-artifact constrained authoring, authenticated Experiment storage/MCP access, revisions and Working copies, collaboration/supervision/Showcase, a scalable Experiment Library, responsive React/Mantine UI, local-first Results, and scientific-code editor ergonomics.

Do not treat completed baseline capabilities as roadmap work merely because their historical epic or child numbers appear in old discussions.

## Roadmap state classification

### Completed baseline

- **#45 Access / sharing / curation / Showcase** — Professor oversight, copy-to-own-workspace, explicit read-only sharing/revocation and Showcase curation are established product behavior.
- **#202 Code authoring ergonomics** — completed through #203–#205: highlighting, line numbers, parser-derived navigation/folding/search, source-linked diagnostics and constrained completion are deployed.
- The current **Experiment Library** activation under living UI/UX #273 is complete through #480: Showcase, Mine, Shared and Supervised are one scalable discovery surface; Active Elastic is not a privileged Built-in execution identity.

### Living / ongoing domains

- **#2 Scientific validation and reproducibility guardrails**
- **#56 Simulator performance**
- **#58 Professor capability-request queue/lifecycle**
- **#65 World/environment capabilities**
- **#273 UI/UX refinement**
- **#301 Security / identity / authorization**
- **#425 Refactoring / technical-debt reduction**

A living domain may be dormant. Its open state is not authorization to execute arbitrary work.

### Foundation built, waiting for a concrete use case

- **#124 Artifact capability registry / lifecycle hooks** — optional executable dispatch waits for an approved executable-artifact use case.
- **#285 Research submission snapshots** — preservation foundation exists; do not invent a submission workflow without a distinct research use case.

### Owner-gated / dependency-gated lanes

- **#3 Studies** — the historical frontend/onboarding/real-student prerequisites are satisfied; the remaining gate is explicit owner activation.
- **#6 Selected Study results → AI handoff** — depends on stable Study/result identities.
- **#119 Research Notes / Research Documents** — intended after or alongside a stable Study/result model.
- **#179 persistent neighbour-search benchmark Study** — hard-depends on mature Studies/results.

### Future / on-demand

- **#8 native workstation and HPC/Slurm execution**
- **#9 richer physics, heterogeneous swarms and observation/action models**
- **#102 numerical-integrator evaluation**
- other concrete performance/environment/science children created from evidence or accepted capability requests.

## Capability-request queue invariant

For living epic #58, the authoritative operational backlog is Supabase `capability_requests`.

Every project recovery, roadmap review or “what remains?” assessment must surface all rows in `requested`, `approved` or `in_progress`. GitHub issue closure is not evidence that this queue is empty.

Professor approval/acceptance does not itself authorize implementation.

### Current queue snapshot — 22 September 2026

- **Approved / accepted:** `observation.target_relative_position` — reusable experiment-defined target-relative position for Controller and Metrics. Available for owner implementation selection, but not automatically authorized.
- **Requested / revise:** typed populations / role-aware sensing — must be decomposed into reusable population identity and optional sensing semantics.
- **Requested / revise:** per-agent lifecycle/participation state — must be generic rather than capture/attacker/defender specific.
- **Requested / revise:** Metrics population/outcome request — reduce to genuinely missing primitive observables/state.
- **Requested / future:** bounded multirotor rigid-body 3-D backend — intentionally outside the current implementation horizon.

This snapshot is descriptive only; query production before making a later backlog decision.

## Near-term selectable lanes

There is deliberately no global automatic ordering. The owner can select one bounded lane at a time.

1. **Security audit #302** — inspect enrollment, roles, OAuth/MCP, RLS, client/session and privileged boundaries. Audit only; policy/remediation comes back for owner decision.
2. **Accepted target-observation capability** — if explicitly owner-authorized, design and implement the reusable `observation.target_relative_position` capability through the normal capability-generalization/deployment path.
3. **Capability-request refinement** — revisit the three Professor-`revise` Swarm-vs-Swarm requests and split them into minimal reusable primitives before any implementation.
4. **Black-box capability-flow acceptance #371** — owner-driven fresh research-AI acceptance when useful; #325/#326 stay paused until the scientific-neutrality/candidate acceptance chain is green.
5. **Studies #3** — may be activated only by an explicit owner decision.

The 3-D multirotor request is future work, not a near-term implementation candidate.

## Major-lane relationships

1. **Studies → Study results → AI handoff (#6): hard dependency.**
2. **Studies → Research Notes/Documents (#119): preferred order, not a hard block.**
3. **Studies → persistent performance benchmark (#179): hard dependency.**
4. **Studies → native/HPC (#8): preferred order, not a hard block.**
5. Security, UI/UX, capability implementation and code-authoring ergonomics are independent lanes unless a concrete ticket introduces a dependency.

## Capability-flow acceptance

The long-running #313 / #330 acceptance history is not current feature backlog.

- Repair infrastructure and canonical capability architecture are deployed.
- #336/#371 remain the unresolved owner-driven black-box acceptance closeout.
- #325 and #326 remain paused behind that closeout.
- Do not reopen completed repair tickets from historical chronology.
- The existence of this unfinished acceptance does not erase or replace the current Supabase capability queue.

## Backlog hygiene rule

An open issue should represent one of:

- a living domain;
- parked/gated/future work with an explicit gate;
- a bounded selected task/acceptance.

Obsolete handoffs, superseded implementation residue and historical verification leftovers should be closed with a note preserving what was and was not verified. They should not remain open merely as historical documentation.

## Standing product direction

- preserve the €0 incremental-cost baseline unless the owner explicitly approves otherwise;
- keep simulation compute and raw scientific data local-first by default;
- keep research-AI Experiment access separate from trusted simulator/repository development;
- preserve provider independence and replaceable infrastructure adapters;
- preserve stable versioned scientific/domain contracts as implementation technology evolves.
