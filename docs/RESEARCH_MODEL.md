# Virtual Lab research object model

Status: **approved product/architecture direction, 14 September 2026**.

This document records the agreed conceptual model connecting Experiments, Studies, results, Research Notes, Research Documents, and future AI-assisted paper/report workflows. It exists so a context-free future session does not have to reconstruct these decisions from chat history.

For current sequencing, read `AGENTS.md` and `PROJECT_CONTROL.md` first. This document defines architecture and product meaning, not current priority by itself.

## 1. Why this model exists

The production Lab currently presents three source areas for an Experiment: configuration, initialization, and controller. That is sufficient for the current simulator, but it is not a durable definition of scientific work.

Two separate generalizations are needed:

1. an Experiment must not be structurally limited to exactly three source artifacts;
2. a complete research investigation is more than one Experiment definition: it includes repeated runs, parameter variation, metrics, analysis, plots, hypotheses, observations, interpretation, and eventually a paper/report narrative.

Do not solve this by continuously adding privileged columns such as `metric_source`, `batch_source`, `plot_source`, `discussion`, etc. The architecture should instead expose explicit research objects with clear responsibilities.

## 2. Core object model

The agreed conceptual layers are:

```text
Experiment
  = one runnable scientific model / single-run definition

Study
  = one named reproducible investigation using pinned Experiment revision(s)

Research Note
  = durable structured scientific memory

Research Document
  = the scope/organization of a paper, report, thesis chapter, etc.
```

Supporting objects include Run, Result, Plot Specification, Generated Plot/Result, and generic typed Artifacts.

The important relationships are:

```text
Experiment
  -> versioned revisions
  -> extensible Experiment artifacts
  -> many Studies
  -> Research Notes in its broader research context

Study
  -> pinned Experiment revision binding(s)
  -> extensible Study artifacts
  -> runs / results / plots
  -> may be referenced by Research Notes

Research Document
  -> references any number of Studies
  -> references any number of Research Notes
  -> references selected plots/results
  -> may therefore span several Experiments
```

This is deliberately not a generalized arbitrary graph/database abstraction. Stable IDs and explicit references exist underneath; the user-facing model remains normal scientific concepts.

## 3. Generic artifacts

`Artifact` is the generic building block for versioned authored pieces of an Experiment or Study.

An artifact needs enough metadata for clients to reason about it without a hard-coded field name, including conceptually:

- stable type/id;
- deterministic ordering/display metadata where relevant;
- authoring format/language where relevant;
- content;
- ownership/revision/provenance through its containing object.

### Experiment artifacts

The current Experiment artifact set is:

1. Configuration
2. Initialization
3. Controller

These remain the only real Experiment artifacts during the immediate migration. The point is not to invent more fields now. The point is that a future Experiment-level artifact can be added without another database and UI architecture rewrite.

Issues #117 and #118 own this immediate generalization.

### Study artifacts

A Study also owns an extensible artifact set. The first important executable Study artifact is the **protocol / experimental setup**.

The protocol sits one semantic level above one simulator run and may define, as applicable:

- parameters to vary;
- parameter values/ranges/matrices;
- repetitions/seeds;
- measurements/metrics to collect;
- sampling rules;
- grouping and aggregation;
- analysis steps;
- plot definitions.

The authoring syntax may reuse the same constrained Python-like family where appropriate, but it is a Study-level specification, not a fourth source block of the single-run Experiment.

Do not prematurely freeze whether metrics, analysis, and plots are separate Study artifact types or parts of one initial protocol. The Study epic should split those boundaries based on implementation/use evidence.

## 4. Experiment semantics

An **Experiment** answers:

> What is the reproducible model/run definition?

The current Experiment workspace remains the primary laboratory for editing the model, initializing it, running a single realization, visually inspecting behavior, and debugging it.

Executed Experiment revisions are scientifically significant. A Study/result must never silently follow later edits to an Experiment.

Collections continue to organize **Experiments**. The Study architecture does not replace, overload, or nest another collection system into the existing Experiment library.

## 5. Study semantics

A **Study** answers:

> Which runs do I perform on this model, what do I measure, how do I combine the runs, and what do I plot?

A Study is a named reproducible investigation attached to an Experiment context and pinned to exact Experiment revision(s).

### 5.1 Granularity is intentionally unconstrained

Do **not** enforce one Study per variable, figure, Results subsection, or paper.

All of the following are legitimate:

```text
Small conference paper
Experiment
  -> Study: Main experimental campaign
       population size + noise + density + all figures
```

```text
Journal paper
Experiment
  -> Study: Population-size scaling
  -> Study: Noise robustness
  -> Study: Density dependence
```

```text
Thesis-scale work
Experiment
  -> Study: Chapter 3 baseline
  -> Study: Chapter 4 robustness
  -> Study: Chapter 5 heterogeneous conditions
```

The principle is pragmatic: support modularity when it helps, never force fragmentation for small work.

### 5.2 Initial binding rule

The first Study implementation should expose the simple rule:

> One Study is based on one pinned Experiment revision.

For example:

```text
Study: Effect of population size
Based on: Active Elastic r12
```

If Active Elastic later becomes r13, the Study stays on r12. Existing results remain attributable to the scientific definition that produced them.

A later explicit rebase/update workflow may move a Study to r13, but that operation must never relabel r12 results as though they came from r13. A changed scientific basis implies affected computations must be rerun.

This formalizes an ordinary research practice: if the underlying experiment definition changes, previous results may no longer answer the same study.

### 5.3 Future multi-Experiment Studies

There are real future cases where one scientific investigation may orchestrate more than one experimental/simulator layer, especially reality-gap/comparative studies across:

- a kinematic simulator;
- a dynamics/physics simulator;
- a future physical system or richer simulator.

The first implementation does **not** need to expose multi-Experiment Studies. The clean initial way to tell such a scientific story is several Studies, each pinned to its own Experiment, combined by one Research Document.

However, persistence should not make the one-binding rule irreversible. If a future concrete workflow genuinely requires one Study to coordinate several Experiment revisions under matched conditions, the model should be able to relax the rule without replacing the Study concept.

This is future-proofing, not a requirement to build multi-Experiment orchestration now.

## 6. Study GUI/workspace

Studies should not be crammed into the current single-run Experiment laboratory.

### 6.1 Experiment page

The current Experiment page remains intact and gains a clearly separated Studies area, conceptually:

```text
Active Elastic — r12

[existing single-run Experiment laboratory]

Studies                                  [+ New study]
Search/filter when useful

Effect of population size               [Open]
Noise robustness                        [Open]
Main experimental campaign              [Open]
```

`+ New study` captures the exact Experiment revision used as the initial Study basis.

The Study list can grow search/filter support as needed. Do not create a second collection/folder hierarchy merely because Studies exist.

### 6.2 Opening a Study

Opening a Study should open a **normal new browser tab**, not a popup and not replace the existing Experiment workspace.

Conceptually:

```text
TAB 1
Virtual Lab — Active Elastic
single-run Experiment workspace remains open

TAB 2
Virtual Lab — Active Elastic > Effect of population size
Study workspace
```

A Study should have its own stable/bookmarkable route.

### 6.3 Study workspace

The Study workspace is distinct from the Experiment simulator screen, conceptually:

```text
Active Elastic > Effect of population size
Based on Active Elastic r12
[Open base experiment]

Protocol
Runs
Results
Plots
Notes            # later
```

This is where the researcher defines/edits the Study protocol, launches batches, inspects progress, examines individual runs, computes/loads aggregate results, and works with plots.

If the Experiment has advanced to r13, the Study should visibly say that a newer revision exists. It must not silently update. `Open base experiment` should allow inspection of the exact pinned revision that generated the Study results.

## 7. Runs, results, plots, and local-first data

Large scientific data remains local-first.

The canonical registry should preserve reproducible recipes, identities, compact provenance, and small selected outputs where justified. It should not become the mandatory warehouse for large trajectories or Monte Carlo data.

Important distinctions:

### Run
One execution of an exact Study/Experiment basis with concrete parameters/seeds and execution provenance.

### Result
A derived scientific output tied to exact run(s), Study protocol/artifact revisions, and execution provenance.

### Plot Specification
A persistent reproducible definition/recipe describing how a plot is constructed from Study outputs.

### Generated Plot/Result
The concrete output produced from a particular Study execution/run set. It should have a stable identity/provenance reference even when the underlying bulk data remains only local.

This separation is what later permits an explicit Lab → AI channel (#6) without uploading all raw data or redesigning Studies.

Scientific metrics/statistics must not be invented autonomously by implementation agents. The software can provide mechanisms; real scientific choices require the researcher/owner.

## 8. Research Notes

A **Research Note** is durable structured scientific memory. It is not itself a paper and it is not merely the raw chat transcript.

Likely note types include:

- hypothesis;
- observation;
- interpretation;
- discussion;
- decision;
- caveat;
- open question.

Notes should preserve explicit stable references to the research objects they concern rather than requiring later AI systems to infer links from prose names.

Examples:

```text
Hypothesis H1
scope: broader Experiment context
references: none yet
later motivates: Study A
```

```text
Observation O7
references: Study A, Plot P3
```

```text
Cross-study interpretation I4
references: Study A, Study B, Plot A7, Plot B4
```

A future convenience may allow `Create study from this hypothesis`. The hypothesis remains; the Study records the relationship. Not every Study is required to originate from a hypothesis.

The durable note layer should be the distilled scientific context accumulated during work, not an uncontrolled copy of every conversational turn.

## 9. Research Documents

A **Research Document** is the lightweight object representing the scientific narrative being assembled, for example:

- conference paper;
- journal paper;
- technical report;
- thesis chapter;
- another coherent written research output.

A Research Document references the relevant Studies, Research Notes, and selected plots/results. It does not need to own or duplicate the underlying raw data.

This is the correct layer for cross-Experiment scientific narratives.

Example:

```text
Research Document: Reality-gap paper

references:
  Study A -> kinematic Experiment r12
  Study B -> dynamics Experiment r7
  Study C -> future physical-system Experiment
  selected notes comparing A/B/C
  selected plots/results
```

Therefore a paper can span several Experiments without forcing the first Study implementation to become multi-Experiment.

Issue #119 owns the Research Note / Research Document epic.

## 10. AI/Grok/Claude direction

The research model must be provider-independent. Grok and Claude are example clients, not architectural dependencies.

An authorized AI should eventually be able to:

- read the Experiment/Study structure through a research-domain contract;
- create or edit a Study when that permission is intentionally introduced;
- preserve/update structured Research Notes as scientific discussion evolves;
- read a selected Research Document and its explicit references;
- receive selected compact results/plots through the explicit user-controlled result channel;
- help construct a coherent research narrative without needing the original chat transcript.

The AI still receives **no simulator-development privileges** through this research channel. GitHub/source/deployment/shell/admin access remains a separate developer workflow.

The future synthesis flow is conceptually:

```text
Experiment definition(s)
  + Studies / protocols
  + selected results / plots
  + Research Notes
  + Research Document scope
       ↓
authorized research AI
       ↓
report / paper skeleton or draft
       ↓
future output adapter, e.g. Overleaf
```

A future Overleaf/document adapter is output infrastructure, not part of the core scientific object model.

Issue #120 owns this future synthesis epic. Issue #6 owns the explicit selected-results/plots channel.

## 11. Relationship to professor capability requests

The professor paper-to-experiment capability-request workflow remains valid, but should build on the generalized Experiment artifact architecture rather than teaching AI clients a fixed three-field representation that is already known to be temporary.

The immediate sequence is therefore to generalize Experiment artifacts (#117/#118) before extending the professor/AI authoring loop.

Studies and Research Documents are not prerequisites for the **first** professor missing-capability request loop. They are later research-workflow layers that the same authenticated research-domain architecture should eventually support.

## 12. What is approved now vs later

### Approved immediate implementation

- #117 — generic Experiment artifact persistence/contract, preserving current three artifacts and behavior.
- #118 — artifact-driven Experiment workspace/editor path, preserving the current visible three-editor experience.

These two are justified independently of Studies.

### Approved architecture / future epics

- #3 — Study layer: pinned experiment basis, Study workspace, protocol, multi-run execution, metrics/results/plots/replay.
- #119 — Research Notes and Research Documents.
- #6 — explicit selected Study results/plots/provenance channel to authorized AI.
- #120 — AI research synthesis into report/paper seeds and future output adapters.

The professor capability-request workflow (#58 plus `docs/PROFESSOR_CAPABILITY_REQUEST_WORKFLOW.md`) remains a separate near-term product lane after the immediate artifact generalization.

## 13. Decomposition rule for future sessions

Do not implement any epic above as one large ticket.

When an epic becomes the active frontier:

1. read current `PROJECT_CONTROL.md` and this document;
2. inspect the then-current implementation and already completed dependencies;
3. create the smallest coherent child issue that can be implemented, tested, deployed, and browser-verified independently;
4. preserve the scientific guardrail;
5. update repository memory after acceptance.

The fact that an epic has many ideas recorded here is not permission to implement all of them at once.
