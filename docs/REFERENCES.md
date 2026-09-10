# Scientific References and Reference Implementations

## Active Elastic Model — primary Round 1 target

1. E. Ferrante, A. E. Turgut, M. Dorigo, C. Huepe, **Elasticity-Based Mechanism for the Collective Motion of Self-Propelled Particles with Springlike Interactions: A Model System for Natural and Artificial Swarms**, Physical Review Letters 111, 268302 (2013). DOI: `10.1103/PhysRevLett.111.268302`.
2. E. Ferrante, A. E. Turgut, M. Dorigo, C. Huepe, **Collective motion dynamics of active solids and active crystals**, New Journal of Physics 15, 095011 (2013). DOI: `10.1088/1367-2630/15/9/095011`.

Round 1 implementation must read the primary papers rather than rely on paraphrases in project documentation. The project owner is an author and will be the final scientific reviewer of model fidelity.

Implementation documentation should record:

- equations actually implemented;
- mapping from mathematical variables to environment/controller state;
- topology/interaction graph construction;
- initial conditions;
- parameter values and units/conventions;
- sensing/actuation noise placement;
- integration method and timestep assumptions;
- which PRL/NJP formulation is reproduced where they differ;
- deliberate deviations made for visualization or numerical reasons.

## Violet — architectural reference only

Repository: `https://github.com/m-rots/violet`

Violet is not a required dependency. Inspect it for useful design principles such as:

- deterministic simulation configuration;
- efficient neighbourhood perception;
- agent/environment separation;
- headless execution;
- heterogeneous populations;
- snapshot/metric recording;
- replay separation.

Review its abstractions critically. The new project specifically strengthens separation between agent local rule, private controller state, simulator-owned action application, simulator-owned randomness, independent metrics, and independent physics/control/render clocks.