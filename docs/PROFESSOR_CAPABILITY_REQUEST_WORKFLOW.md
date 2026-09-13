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
5. Because the authenticated role is professor, the experiment intent is preserved as a non-runnable draft if necessary and a durable capability request is created automatically or through one simple professor-domain action.
6. Simulator-development work happens separately through the normal repository engineering workflow.
7. Once the new capability is implemented and deployed, the versioned authoring contract advertises it.
8. The existing draft is revalidated; the AI can then complete/use the experiment without changing its basic workflow.
9. An accepted professor-owned experiment may later be promoted into the public Showcase/curated collection under the professor/curator workflow.

This loop lets papers drive simulator development empirically: each paper either maps to current capabilities or produces a concrete missing-capability request.

## Example

If a paper requires a continuous environmental gradient and the active contract has no gradient world-builder capability:

- professor identity: preserve the draft and create a request for the missing world/setup capability;
- student identity: report that the experiment cannot currently be expressed and do not create a request.

The AI does not decide whether gradients are a good feature. The authenticated role determines whether the missing capability can enter the request queue.

## Related issues

- #45 — professor/curator identity, curation and Showcase workflows;
- #58 — capability registry and durable missing-capability request lifecycle;
- #65 — first-class world/environment/setup architecture, including gradients and other environment primitives;
- #46 — production registry integration;
- #55 — authoring contract and validation boundary.
