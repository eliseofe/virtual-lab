# Professor capability-request workflow

Status: **deployed baseline and standing development boundary, updated 19 September 2026**.

This document records the paper-to-Experiment extension loop when a research AI discovers that the current Virtual Lab cannot express a required simulator capability.

## Structural boundary

The authenticated Experiment MCP is an Experiment-domain interface. Research AI clients can create/read/edit supported Experiment content and, for Student or Professor users, preserve/submit missing-capability analyses and requests. They have no GitHub, repository, shell, deployment, simulator-source, arbitrary SQL, arbitrary filesystem or Supabase-admin capability.

That boundary is structural. Missing simulator functionality is not “allowed through prompt”; it is absent until implemented by the trusted developer workflow.

## Roles

Current registry roles include:

- `student`
- `professor`

Student and Professor share ordinary Experiment-domain behavior, durable capability-request submission, and closure resume/revalidation semantics. A Student acts on their own blocked Experiments; Professor additionally owns cross-requester supervision and the queue-wide inbox/triage surface. Professor role never implies simulator-development authority.

## Unsupported Experiment capabilities

Validation answers whether requested Experiment semantics fit the active versioned Virtual Lab capability contract. It must not decide whether a missing scientific feature is desirable or fabricate a substitute.

Current policy:

```text
capability exists
    -> author/validate normally

capability missing + student or professor
    -> preserve one whole blocked Experiment/analysis and submit durable grouped request(s)

scientific ambiguity remains
    -> preserve it explicitly; do not hand it to developer generalization

requested rows
    -> Professor inbox for approve/decline
```

## Durable blocked Experiment / closure foundation

Issue #310 adds the durable domain foundation used by the repaired closed loop:

- `blocked_experiment_drafts` preserves one resumable scientific draft/intent rather than relying on isolated request rows;
- `capability_closure_analyses` stores append-only analyses against a specific capability-contract version, including identified requirements and unresolved scientific ambiguity;
- individual capability requests may link to the closure analysis that identified them.

This schema foundation is secure-by-default. #311 adopts it in the authenticated research-AI MCP for both Student and Professor submission. #312 established durable `resume_capability_closure` and `revalidate_capability_closure`; #360 makes those scientific continuation semantics shared: a Student can resume/revalidate their own blocked Experiment, while a Professor may also supervise visible blocked Experiments. Resume reconstructs the durable draft, analysis history and linked request lifecycle without chat history; revalidation appends a new whole-Experiment analysis against the current contract, preserves earlier analyses and request rows, records resolved/remaining/new requirement keys, and permits `unblocked` only when no unsupported requirement or scientific ambiguity remains.

The two historical aggregation requests remained unchanged and unlinked through #310–#312. The later canonical-architecture transition superseded that temporary state: #348 intentionally retires those legacy request rows before fresh scientific acceptance, so no historical request identity is carried into the clean baseline.

## Six-class request model

The request queue is broader than the canonical semantic-capability registry. Every clear unsupported requirement is classified as one of:

1. `semantic_capability`
2. `authoring_language`
3. `runtime_configuration`
4. `artifact_workflow`
5. `implementation_optimization`
6. `security_boundary`

All six are valid Professor-visible requests. None is automatically approved or rejected. In particular, classes 5 and 6 remain visible so the owner can observe whether real research tasks ever elicit them and decide manually.

Only class 1 may later bind to canonical semantic-capability identity. Classes 2–6 remain typed extension requests.

Each research task carries minimal publication identity (title + persistent identifier) separately from scientific reasoning. One active request is the Professor decision unit: several papers and blocked Experiments may attach evidence to the same request when its scientific/model meaning covers their need.

## Durable capability request

A request is a first-class Supabase domain row with stable identity and retained context. The deployed model preserves information such as:

- request identity/timestamps;
- authenticated requester identity/role;
- originating Experiment/revision when available;
- preserved draft artifacts/intent;
- capability domain/name/summary;
- requested lifecycle hook;
- status;
- Professor review note/identity/time where applicable;
- linked GitHub engineering issue/PR once trusted development begins;
- implemented capability/contract version when completed.

The request does not contain or grant repository credentials.

## Lifecycle

Current lifecycle vocabulary is:

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

`approved` means approved by the Professor to enter developer design/queue. It **does not** authorize code implementation by itself.

The developer-side standing boundary is:

`approved request → developer design discussion → explicit owner implementation approval → trusted developer implementation/deploy/verification → implemented`

## Professor inbox — deployed

The production Lab includes the Professor-only request inbox/triage path implemented under #139 / #58.3.

Professor can review pending requests and transition only `requested → approved` or `requested → declined` through the user-facing triage flow, with durable reviewer/time/note data. Approval accepts the scientific/product need into the design queue. Student users receive the sanitized active-request catalog for research-AI reconciliation while the Professor triage queue and its review data remain Professor-only.

This UI remains an Experiment/product administration surface. It does not embed GitHub credentials or turn the browser into a simulator-development client.

## Research-AI request action — deployed

Authenticated Student and Professor MCP sessions expose the durable closure path under `vlab.capability-request/7`: `request_capability`, `resume_capability_closure`, and `revalidate_capability_closure`.

Normal no-ID `read_workspace` discovery exposes the stable authoring/platform contract, implemented canonical capabilities, unavailable candidate capabilities, and unavailable candidate contract deltas as distinct product surfaces.

A semantic request is created with a complete candidate capability, including the scientific/model identity, target artifact/runtime domain and concrete authoring surfaces required to express it. The other five request classes are created with a candidate contract delta that points directly at a precise stable-contract location and states the requested rule/addition/change in that contract vocabulary. The backend validates this structure and target references; it does not infer or rewrite scientific meaning.

Before submission, research AI compares each clear unsupported requirement against implemented support and both candidate catalogs. A covering candidate receives another evidence link and no new request row. A related but too-narrow or ambiguous candidate receives Professor-visible `generalization_needed` evidence and no new request row. Only a genuinely absent requirement creates one new structured candidate/request.

Candidate identity persists through `requested`, `approved`, `declined` and `in_progress` states while remaining unavailable to validation. Implementation or an explicit owner-governed resolution may supersede the candidate. The blocked Experiment, closure analysis, requirement keys and publication remain linked as evidence beneath the durable candidate/request identity.

## Professor candidate generalization

When linked evidence is marked `generalization_needed`, the Professor inbox exposes an explicit **Generalize candidate** action. The Professor may broaden or refine the candidate scientific/model definition and structured authoring surfaces, or the structured contract-delta target/change, while keeping the stable candidate/request key unchanged.

Each Professor revision is append-only audited with the previous and generalized candidate snapshots. The Professor may explicitly state that the revision covers the currently flagged generalization evidence; those evidence rows keep their original `generalization_needed` relationship and record the resolving revision rather than being rewritten. Fresh research-AI discovery immediately sees the generalized candidate.

Candidate generalization is separate from Approve/Decline review, developer software generalization, owner implementation authorization, and implementation. The generalized candidate remains `candidate_unavailable` and does not alter compiler/runtime behavior.

Current lifecycle-hook vocabulary exposed by the request path includes:

`setup | initialize | control | measure | finalize`

## Development handoff

Trusted developer work is separate from research-AI MCP.

When the owner asks to take an approved request, developer-side ChatGPT should:

1. read the approved Supabase request and its preserved context;
2. perform the software-generalization/refactor gate;
3. discuss the architecture/design with the owner where required;
4. obtain explicit owner implementation approval;
5. create/link the GitHub engineering issue and mark the request `in_progress` only when implementation actually begins;
6. implement/test/deploy through the normal repository workflow;
7. mark the request `implemented` only after the active deployed capability contract advertises it;
8. leave the originating Experiment/draft ready for research-AI revalidation.

No manual copying of request details should be required when developer tooling can read the durable row.

## What counts as an Experiment capability

Potential capability domains include, for example:

- world/environment/setup construction;
- observations/sensors;
- actions/actuators;
- simulator-owned stochastic/intrinsic operations;
- per-agent initialization/state representation;
- future registered measurement/lifecycle extension points.

The research AI can describe the missing requirement. It cannot implement the simulator capability.

## Scientific request identity

The research AI preserves the scientific/model requirement from the task and source publication. Existing active requests are reused when they cover that requirement. The developer later generalizes the software design, and the owner explicitly approves implementation.

## Current queue baseline

#348 intentionally establishes a clean-slate request baseline: the two historical aggregation requests for simulator-owned controller stochasticity/RNG and heterogeneous agent initialization/state are retired rather than migrated, and the old scalar-environment request row is retired as capability authority.

This retirement does **not** implement RNG or heterogeneous state. If fresh scientific work still requires them, the research AI must rediscover and submit them through the typed request workflow for normal Professor triage. The implemented scalar Environment capabilities remain represented in the canonical registry independently of request history.

`docs/CAPABILITY_APPROVALS_2026-09-15.md` remains historical design evidence, not current queue state.

## Paper-to-Experiment loop

Current intended loop:

1. A Student or Professor works on a paper/hypothesis/Experiment with a research AI.
2. AI reads the current authoring/capability contract through MCP.
3. Supported Experiment artifacts/Metrics/Results bindings are authored normally.
4. If a required simulator capability is absent, validation exposes that gap.
5. The authenticated research AI preserves one durable blocked Experiment/closure analysis and compares each clear gap with the active-extension catalog.
6. A covering candidate receives linked evidence; a related but too-narrow candidate receives `generalization_needed` evidence; neither creates a second request.
7. A genuinely absent need creates one structured candidate/request, which appears once in the Professor inbox regardless of how many papers later attach evidence.
8. Professor approves/declines the request; approval accepts the need into developer design.
9. Developer generalization/reconciliation resolves semantic requests to existing or new canonical capability identity as appropriate, followed by explicit owner implementation authorization.
10. Trusted developer implements/deploys if authorized.
11. Deployed versioned contract advertises implemented semantic capability truth; fulfilled request state is recorded.
12. The owning Student research AI, or a supervising Professor research AI, resumes the durable blocked Experiment and revalidates the whole Experiment against the current deployed contract; it becomes unblocked only when the intended semantics are fully representable with no unresolved ambiguity.

This lets real papers expose simulator gaps without giving research AI development privileges, blocking Student requests, or encouraging paper-specific hacks.
