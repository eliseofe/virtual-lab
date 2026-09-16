# UI and Visualization Principles

Virtual Lab should present as a serious scientific instrument rather than an engineering/debug demo.

Current detailed UI/UX improvement work is tracked under #207; this document records stable principles rather than a second implementation roadmap.

## Visual continuity

The owner's academic website may be consulted as a visual-language reference for typography, spacing, restraint and polished academic presentation. Virtual Lab remains an independent application and must not import website code/components/build/runtime/deployment configuration.

## Current Experiment workspace model

The interface should make the scientific workflow legible around one selected Experiment:

- Experiment identity/library/organization;
- four authored surfaces: Configuration, Initialization, Controller, Metrics;
- dominant live simulation viewport;
- Run/Pause/Restart/apply/validation feedback;
- live Results physically close to the simulation;
- persistence/export state that does not masquerade as scientific configuration;
- Account/Professor administration surfaces separated from ordinary scientific editing.

Results panels are presentation/workspace objects. Their layout/metric bindings must not look like they are changing the scientific metric definitions merely because the view is rearranged.

## Responsive behavior

Desktop remains the strongest editing surface, but phone/foldable layouts must remain coherent for running/inspecting Experiments. Do not treat mobile as an afterthought that forces unreadable aspect ratios or hidden essential controls.

Foldable/square devices may keep simulation and Results side-by-side when usable horizontal space supports it; narrow phones may stack them.

## Visualization contract

The renderer consumes sampled read-only simulation state. It must not own/advance physics, controller state, seeds or scientific time.

Visualization rate is independent from physics/control/metric/persistence rates. Headless execution omits rendering while preserving scientific evolution under the documented backend guarantee.

Display reduction for long metric series may reduce drawing work only; it must never mutate/delete the complete retained scientific samples.

## Scientific honesty

Visual output must represent actual simulator state. It must not smooth/steer/cosmetically alter collective dynamics in a way that can be mistaken for scientific behavior unless the transformation is explicit and scientifically harmless.

Similarly, plot styling/presentation may not alter metric definitions or sampled values.

## Live Results interaction

Current generic Results supports time-series panels with one/many stable metric IDs, metric reuse across panels and interactive inspection/pan/zoom.

Known UX refinements deliberately deferred to #207 include clearer metric-selection affordance and an explicit return-to-`Follow live` state after manual pan/zoom. These are product-polish items, not reasons to fork the scientific Results architecture.

## Local results and export

Canonical scientific run output writes automatically to the selected local workspace on browsers with writable-directory access. UI wording should distinguish automatic persistence from optional whole-Experiment package export; do not imply that per-run manual ZIP downloading is the normal scientific workflow.

## Replay / Studies

Future replay and Study work should render recorded/local result state independently from simulation execution and reuse stable Experiment/run identities. Study UI is a separate multi-run workspace rather than cramming all batch/aggregate controls into the single-run Experiment laboratory.
