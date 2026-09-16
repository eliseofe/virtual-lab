# Virtual Lab research object model

Status: **approved architecture direction, current through 16 September 2026**.

This document records the conceptual model connecting Experiments, Studies, runs/results, Research Notes, Research Documents and future AI-assisted analysis/paper workflows. Current sequencing is always controlled by `PROJECT_CONTROL.md`.

## 1. Core object model

```text
Experiment
  = one runnable scientific model / single-run definition

Study
  = one named reproducible multi-run investigation based on pinned Experiment revision(s)

Research Note
  = durable structured scientific memory

Research Document
  = scope/organization of a paper, report, thesis chapter, etc.
```

Supporting objects include Run, Result, Results Presentation, Plot Specification, Generated Plot/Result and generic typed Artifacts.

These are explicit scientific/product concepts, not an arbitrary graph abstraction.

## 2. Experiment semantics

An **Experiment** answers:

> What exactly is one reproducible run definition, including what is measured?

A runnable Experiment currently has four compulsory core artifacts:

1. Configuration
2. Initialization
3. Controller
4. Metrics

The Metrics artifact is compulsory because single-run measurement belongs to the Experiment definition. It may validly contain zero metric definitions.

The generic artifact representation remains extensible, but extra artifacts are passive unless the simulator's versioned capability registry explicitly gives them execution semantics.

Executed scientific revisions are significant. A later Study/result must never silently follow a newer Experiment revision.

Collections organize Experiments. They are not a filesystem hierarchy and do not become the Study storage tree.

## 3. Single-run Results vs presentation

Experiment Results answer:

> What happened during this run?

Metrics produce read-only scientific samples identified by stable metric IDs. The scientific metric definition and sampling policy live in the Experiment Metrics artifact.

Results **presentation** is separate workspace state. A panel binds one or more stable metric IDs; the same metric may appear in several panels. Reconfiguring panels does not create a new scientific Experiment revision.

The first deployed visualization type is interactive time-series. Future richer presentation/figure specifications remain downstream of the scientific metric definitions.

## 4. Run and local-result model

A **Run** is one execution of an exact Experiment revision with concrete run configuration/seed/runtime context.

Current standalone raw metric output is local-first and flat:

```text
<VirtualLab root>/
  <Experiment>/
    runs/
      <metric-id>_000001.csv
      <other-metric-id>_000001.csv
      <metric-id>_000002.csv
      ...
    studies/
      <Study>/
        runs/
          ...same flat single-run contract...
```

There is no directory per run. Stable metric ID + run-number suffix associates the files of one run. Lab-managed execution/reproducibility metadata stays out of the ordinary `runs/` directory.

The registry preserves Experiment definitions/identity and lightweight workspace state; it is not the mandatory warehouse for large trajectories or Monte Carlo data.

## 5. Study semantics

A **Study** answers:

> Which runs/conditions do I perform on this Experiment, and how do I compare/aggregate them?

The first Study implementation should use one pinned Experiment revision as its basis. If the Experiment later advances, the Study remains attached to its original revision until an explicit rebase/update action is designed. Existing results must never be relabelled as though they came from the newer revision.

A Study may define, as applicable:

- parameters/conditions to vary;
- parameter values/ranges/matrices;
- repetitions/seeds;
- fresh vs checkpoint/resume policy;
- which already-defined Experiment metrics to collect/use;
- grouping/aggregation/statistics;
- cross-run analyses;
- cross-run plot specifications.

The existing single-run Metrics definitions remain in the Experiment. A Study consumes stable metric IDs and may specify how their outputs are aggregated/compared; it does not duplicate or relocate the single-run metric formulas.

### Granularity

Do not force one Study per variable, plot or paper section. Legitimate examples include one broad campaign Study or several focused Studies. Modularity is available when useful, not compulsory.

### Future multi-Experiment Studies

The first implementation need not coordinate multiple Experiment revisions in one Study. Cross-Experiment stories can initially use several Studies referenced by one Research Document. Persistence should not make later multi-Experiment orchestration impossible if a concrete need arises.

## 6. Study GUI/workspace

Studies should be visible in the context of their Experiment while having their own workspace.

Conceptually on the Experiment page:

```text
Active Elastic — r12

[single-run Experiment laboratory]

Studies
  Effect of population size
  Noise robustness
  Main experimental campaign
```

Opening a Study should use a stable/bookmarkable route and may open in a normal browser tab while the Experiment workspace remains available.

A Study workspace can contain concepts such as:

```text
Active Elastic > Effect of population size
Based on Active Elastic r12

Protocol
Runs
Results
Plots
Notes   # later
```

If a newer Experiment revision exists, the Study should show that fact without silently rebasing.

## 7. Study filesystem organization

Study result storage is nested under its Experiment so origin/context is obvious:

```text
<VirtualLab root>/
  Active Elastic/
    runs/                    # standalone loose runs
    studies/
      Noise sweep/
        runs/                # Study-managed loose runs
      Density sweep/
        runs/
```

Do not create global sibling `studies/` outside the Experiment and do not create one directory per simulation run.

Human-readable directory names help navigation, while stable IDs/revisions in machine-managed metadata remain authoritative for automation/reproducibility.

## 8. Result and plot concepts

A **Result** is a derived scientific output tied to exact Run/Study/Experiment identities.

A **Plot Specification** is a persistent reproducible recipe describing how a plot is constructed from Result/Study data. A **Generated Plot** is a concrete rendering produced from a specific data/run set.

Long-term figure scope may include reproducible SVG/PDF/PNG export and publication-ready plots. This should be a downstream analysis/presentation layer rather than turning the live single-run Results UI into a general graphics editor.

Scientific aggregation/statistics/figure choices must come from the researcher/research-AI scientific workflow; implementation agents provide mechanisms without inventing paper-specific analysis.

## 9. Research Notes

A **Research Note** is durable structured scientific memory, not the raw chat transcript.

Useful note types may include hypothesis, observation, interpretation, discussion, decision, caveat and open question.

Notes should reference stable research-object identities explicitly where possible. Examples:

```text
Hypothesis H1
references: none yet
later motivates: Study A
```

```text
Observation O7
references: Study A, Plot P3
```

```text
Interpretation I4
references: Study A, Study B, Plot A7, Plot B4
```

A future “Create Study from this hypothesis” action may be useful, but not every Study must originate from a formal hypothesis.

## 10. Research Documents

A **Research Document** is the lightweight object representing a scientific narrative: conference paper, journal paper, technical report, thesis chapter or similar output.

It references relevant Studies, Research Notes and selected plots/results without duplicating underlying bulk data.

This is the natural layer for cross-Experiment narratives. For example, one document may compare Studies built on a kinematic Experiment, a dynamics Experiment and later physical-system data.

## 11. AI/research-assistant direction

The research model is provider-independent. An authorized research AI should progressively be able to:

- read/edit Experiment definitions within the current MCP capability boundary;
- author Metrics and Results presentation bindings (already deployed);
- later read/create/edit Studies when explicitly implemented;
- preserve/update structured Research Notes;
- work from Research Document scope/references;
- receive selected compact Study results/plots through an explicit user-controlled result channel;
- help construct a research narrative without requiring the original chat transcript.

Research AI does not gain simulator-development privileges. GitHub/source/deployment/shell/admin access remains a separate trusted developer workflow.

Conceptually:

```text
Experiment definition(s)
  + Studies / protocols
  + selected results / plots
  + Research Notes
  + Research Document scope
       ↓
authorized research AI
       ↓
report / paper draft
       ↓
future document/output adapter
```

## 12. Capability-request relationship

A paper-to-Experiment AI may discover that the simulator lacks a required capability. The durable Professor request loop handles that gap; the AI must not fabricate substitute science.

The current generic four-artifact architecture and capability registry are the basis of that workflow. Old assumptions that capability requests depend on a fixed three-field Experiment representation are obsolete.

## 13. Current vs future implementation

Already deployed foundations include generic four-artifact Experiments, Metrics/live Results, local single-run persistence and MCP fine-grained Metrics/Results authoring.

Studies, Research Notes/Documents, selected Study-result → AI and paper/report synthesis remain future substantial layers. Their existence in this architecture document is not permission to implement them before `PROJECT_CONTROL.md` makes them active.

## 14. Decomposition rule

Do not implement any future research-workflow epic monolithically.

When an epic becomes active:

1. read `AGENTS.md`, `PROJECT_CONTROL.md`, `PROJECT_STATE.md` and the relevant design docs;
2. inspect the then-current implementation/dependencies;
3. choose the smallest coherent independently testable/deployable child;
4. preserve scientific guardrails and stable IDs/revisions;
5. update durable project memory after verified completion.
