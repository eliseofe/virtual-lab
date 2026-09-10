# UI and Visualization Principles

Virtual Lab should present as a serious scientific instrument rather than an engineering/debug demo.

## Visual continuity

The owner's academic website may be consulted as a visual-language reference for typography, spacing, restraint, and polished modern academic presentation. Virtual Lab remains an independent application and must not import code, components, build configuration, runtime dependencies, or deployment configuration from the website.

## Round 1 layout goals

The interface should make the scientific workflow immediately legible:

- experiment collection/selector;
- selected experiment identity and source/reference;
- dominant live simulation viewport;
- visible editable controller source;
- clear Run/Pause/Restart/Apply controls;
- simulation status and compile/runtime feedback.

Desktop is the primary editing surface. Mobile must remain coherent and useful for viewing/running even if code editing is less comfortable.

## Visualization contract

The renderer consumes sampled read-only simulation state. It must not own or advance physics, controller state, seeds, or scientific time.

Visualization rate is independent from physics/control rates. Headless execution omits rendering while retaining the same scientific evolution for a given run/backend guarantee.

## Scientific honesty

The visual simulation must represent actual simulator state. It must not smooth, steer, interpolate, or cosmetically alter collective dynamics in a way that could be mistaken for scientific behavior unless that presentation transformation is explicit and scientifically harmless.

## Future replay

Replay should render recorded state independently from simulation execution. Round 2 may allow selection of any individual realization for replay after a multi-run experiment.