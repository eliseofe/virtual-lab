# Professor capability-request workflow

Status: product/architecture decision, 14 September 2026.

This document records the intended first version of the paper-to-experiment extension loop. It deliberately keeps the policy simple.

## Existing structural boundary

The Supabase Experiment MCP is already an experiment-domain interface. An AI client such as Grok or Claude can create/read/edit experiment records and collections exposed by MCP. It has no GitHub, repository, shell, deployment, simulator-source, arbitrary SQL, filesystem, or Supabase-admin capability.

That boundary is structural: simulator-development actions are absent from the MCP. Do not add a second policy layer that tries to classify such actions as allowed/forbidden; they are simply outside this interface.

## Roles

The registry will distinguish at least two authenticated experiment-domain roles:

- `student`
- `professor` / `curator`

For initial owner testing, one of the owner's existing authenticated identities should be promoted to professor/curator while the other remains an ordinary student identity. This allows both paths to be tested with real AI clients.

Professor/curator remains an experiment-domain role. It does not imply simulator-development access.

## Unsupported experiment capabilities

Validation should answer only whether an experiment requirement is currently supported by the active Virtual Lab authoring/runtime capability contract. It must not try to decide whether a missing capability is scientifically reasonable, architecturally desirable, or likely to be implemented.

Initial policy:

```text
capability exists
    -> allowed

capability missing + professor
    -> preserve the experiment intent/draft and create a capability request

capability missing + student
    -> reject as unsupported; no capability request in the first version
```

There is no `requestable vs forbidden` classifier for missing experiment capabilities in the first version. For a professor, a missing experiment capability is requestable by default. For a student, missing capabilities are not requestable yet. Student requests may be revisited later.

## What a capability request is

A capability request is a first-class Supabase registry/domain row, not a GitHub issue and not free-form chat state.

It should have a stable request ID and retain enough provenance to reconnect the request to the paper/experiment that exposed the gap. The first useful schema should contain, at minimum:

- request ID and timestamps;
- authenticated requester identity and role;
- originating experiment/draft ID and revision when available;
- capability domain, for example `world-builder`, `observation`, `action`, `intrinsic`, or another future typed extension point;
- concise requested capability name/summary;
- short motivation/context produced from the experiment discussion;
- lifecycle status;
- optional professor/developer notes;
- optional linked GitHub issue/PR once development begins;
- implemented contract/capability version and completion timestamp once available.

Do not expose GitHub credentials or repository-development operations through this row or through the professor MCP.

## Capability-request lifecycle

Keep the initial state machine small:

```text
requested
   |\
   | \-> declined
   v
approved
   v
in_progress
   v
implemented
```

`approved` means "approved for development / queued". It does not itself execute repository work.

If implementation reveals that a request must be reformulated, notes can be attached and the request can remain approved/in progress rather than inventing a complex workflow immediately.

## Professor-mode request inbox

Professor mode in the production Virtual Lab should include a simple, polished capability-request viewer/inbox. The professor should not need to ask an AI chat to enumerate raw Supabase rows every time.

The initial viewer should support:

- list requests, newest first, with status filters;
- clearly show originating experiment/draft and capability domain;
- open a request to read its description/context and linked experiment;
- `Approve for development` and `Decline` actions while status is `requested`;
- show `approved`, `in progress`, and `implemented` state visibly;
- show linked GitHub issue/PR and implemented capability/contract version once the development side has supplied them;
- optionally jump back to/revalidate the originating experiment after implementation.

The viewer is an experiment/product administration surface backed by Supabase. It must not embed GitHub credentials or turn the professor browser into a simulator-development client.

## Development handoff from ChatGPT

The development side is separate from Grok/Claude's Experiment MCP.

A normal owner workflow should be possible from this ChatGPT development interface:

1. owner says to inspect capability requests, or to take a particular/next approved request;
2. ChatGPT reads the approved Supabase request through the developer-side Supabase connection;
3. ChatGPT creates or links the corresponding GitHub engineering issue when implementation actually begins;
4. the Supabase request status is changed to `in_progress` and stores the GitHub issue link;
5. implementation proceeds through the normal repository/PR/test/deploy workflow;
6. only after the capability is deployed and advertised by the active authoring/runtime contract does ChatGPT mark the request `implemented`;
7. the request row records the relevant PR/issue and implemented contract/capability version;
8. Professor mode then shows the completed state automatically from Supabase.

This means the Professor UI can initiate the human decision by approving/queuing a request, while actual simulator development remains in the engineering interface. No manual copying of request details into chat should be required.

A convenience command such as "implement the next approved capability request" should eventually be enough for the owner in the developer chat once the Supabase developer connection and request schema exist.

## What counts as an experiment capability

The professor may request any capability needed to express an experiment through the Virtual Lab model, including future classes such as:

- world/setup construction: gradients, sites, regions, raster/image worlds, obstacles, resources, boundaries, placement primitives;
- observations/sensors available to agents;
- actions/actuators available to agents;
- simulator-owned stochastic or local intrinsic operations exposed through the authoring contract;
- other typed, versioned experiment-domain extension points introduced by the simulator architecture.

The professor-facing AI may formulate the missing requirement and submit the request. It does not implement the capability.

## Paper-to-experiment loop

Intended workflow once professor identity and capability requests are implemented:

1. Professor discusses a paper with Grok/Claude and asks it to create a Virtual Lab experiment.
2. The AI reads the current authoring/capability contract through MCP.
3. Supported portions are authored normally.
4. If a required experiment capability is missing, validation identifies the missing capability/domain.
5. Because the authenticated role is professor, the experiment intent is preserved as a non-runnable draft if necessary and a durable Supabase capability request is created.
6. The request appears in the Professor-mode inbox as `requested`.
7. The professor approves or declines it. Approval moves it to `approved`; it does not grant Grok/Claude development privileges.
8. The development workflow later takes an approved request, links a GitHub issue, and marks it `in_progress`.
9. Once the new capability is implemented, tested and deployed, the versioned authoring contract advertises it and the request is marked `implemented`.
10. The originating draft is revalidated; the AI can then complete/use the experiment without changing its basic workflow.
11. An accepted professor-owned experiment may later be promoted into the public Showcase/curated collection under the professor/curator workflow.

This loop lets papers drive simulator development empirically: each paper either maps to current capabilities or produces a concrete missing-capability request.

## Example

If a paper requires a continuous environmental gradient and the active contract has no gradient world-builder capability:

- professor identity: preserve the draft and create a Supabase request for the missing world/setup capability;
- the request appears in Professor mode;
- professor chooses `Approve for development`;
- later the developer-side ChatGPT workflow takes that approved request and implements it through GitHub;
- after deployment, the request becomes `implemented` and the draft can be revalidated;
- student identity: report that the experiment cannot currently be expressed and do not create a request.

The AI does not decide whether gradients are a good feature. The authenticated role determines whether the missing capability can enter the request queue; the professor decides whether the queued request should actually be developed.

## Related issues

- #45 — professor/curator identity, curation and Showcase workflows;
- #58 — capability registry and durable missing-capability request lifecycle;
- #65 — first-class world/environment/setup architecture, including gradients and other environment primitives;
- #46 — production registry integration;
- #55 — authoring contract and validation boundary.
