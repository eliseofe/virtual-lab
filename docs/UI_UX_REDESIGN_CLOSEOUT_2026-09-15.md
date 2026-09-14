# Virtual Lab UI/UX redesign — closeout

Date: **15 September 2026**

This document is the durable closeout record for **#147 — Full Virtual Lab UI/UX audit and interaction redesign**. It supersedes older UI-frontier wording in `PROJECT_STATE.md` that still describes child E as pending. `PROJECT_CONTROL.md` remains authoritative for current priority/sequencing.

## Outcome

The redesign is complete as the A–E sequence defined by #148:

1. **#150 / PR #151 + fix #152 — simulation-first workspace shell**
   - arena and Run/Pause/Restart/seed/speed are one primary stage;
   - legacy sidebar no longer governs the page;
   - Account/Professor are secondary utilities;
   - desktop/mobile preserve simulation-first order.

2. **#153 / PR #154 — workspace continuity + unified Experiment switching**
   - authenticated users resume the last accessible owned Experiment;
   - built-in and owned runnable Experiments share one direct switch/search flow;
   - collections are not required to find/open an Experiment.

3. **#155 / PR #156 — authoring + persistence workspace**
   - Configuration / Initialization / Controller use one single-active tabbed workbench;
   - supported additional text artifacts join the same workbench;
   - one visible **Apply changes & restart** action delegates to existing validation/runtime paths;
   - Save / Save as new / dirty / conflict state is colocated with authoring;
   - compiled IR/implementation material is under **Technical details**.

4. **#157 / PR #158 — collections / organization redesign**
   - primary Experiment navigation has no collection filters or collection prerequisite;
   - optional organization is behind one explicit **Organize** surface;
   - existing #115 move/concurrency behavior remains authoritative;
   - collection create/rename uses existing owner-scoped persistence/RLS.

5. **#159 / PR #160 + harness-fix PR #161 — responsive / accessibility / regression hardening**
   - mobile/tablet layout hardened without changing the accepted interaction architecture;
   - narrow screens preserve current Experiment → simulation controls/arena → authoring → advanced/admin hierarchy;
   - practical touch targets, visible keyboard focus, reduced-motion behavior and safe narrow-screen dialog sizing added;
   - Account/Experiment dialog focus entry/return made deterministic;
   - authoring tab/panel semantics and live status semantics strengthened;
   - structural regression tests lock the #148 invariants;
   - production deployment now includes both the existing simulator smoke and a real 390×844 responsive/focus smoke.

## Final #159 evidence

Primary UI implementation:

- PR #160 final head: `29da3b1fe4e1ba2cf67307873f0e1a3dd425e422`
- merge: `4edf78c619ce408e9d32ff16bc97094f05a34546`
- normal PR workflow `34901241471`: **success**
- independent performance workflow `34901241394`: first attempt hit the known Chrome DevTools startup race (`Chrome did not publish DevToolsActivePort`); unchanged rerun: **success**

The first production closeout run `34901550242` had successful build, Pages deployment and existing functional browser smoke. Its new responsive smoke did not reach any UI assertion because the smoke harness called nonexistent CDP command `Emulation.enable`.

That harness-only defect was corrected without weakening or changing the actual assertions:

- PR #161 commit: `2e3767302cd62a503ce0e54c1a6fe7aa1172c2ce`
- final main merge: `c1a99469d720850143513cab2704b7b6073ae709`
- PR #161 normal workflow `34901822171`: **success**

Authoritative final production workflow: **`34901925055`**

- build: **success**
- GitHub Pages deploy: **success**
- existing deployed simulator/browser smoke: **success**
- deployed 390×844 responsive hierarchy/focus smoke: **success**

The responsive smoke verifies, on the deployed site:

- no horizontal page overflow at the representative mobile viewport;
- Experiment → stage → authoring → Technical-details document hierarchy;
- administrative/organization surfaces remain outside the scientific workspace;
- exactly one active authoring pane;
- Technical details collapsed by default;
- collection filters absent from primary Experiment navigation;
- arena remains within the viewport;
- primary mobile controls and authoring tabs meet the 44px touch-target gate;
- Experiment finder fits the viewport and returns focus to its launcher;
- Account utility dialog receives focus and returns it to Account on close;
- authoring Arrow-key tab navigation and panel labelling remain correct.

## Preserved boundaries

The A–E redesign did **not** change simulator physics, controller/initializer scientific semantics, Environment semantics, scientific timing, RNG ownership, Experiment scientific content, revision semantics, Supabase schema/RLS, MCP/authoring contracts, capability-request lifecycle, Professor handoff semantics, or Showcase policy.

The two recent Grok requests remain durable but **requested/unapproved**:

- `7492c39d-fdd0-4f29-9661-63dbc6461bf5` — `controller / stochasticity.rng`
- `49368c8e-dff7-4ce0-9072-bc3f4b37ada2` — `initialization / heterogeneous_agent_state`

Completion of #147 does not authorize implementation of either request.

## Post-redesign checkpoint

The planned #147 implementation sequence is complete. There is **no implicit next engineering ticket**.

Previously deferred owner acceptance of #115/#118 may now be exercised naturally in the redesigned Lab when useful; optional #149 paper-Experiment refinement/Showcase curation remains separate. The owner is not required to perform a manual acceptance pass for this closeout because the current instruction explicitly delegates verification to the automated/deployed-browser gates.
