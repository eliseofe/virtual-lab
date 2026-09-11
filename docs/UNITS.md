# Units and arena scale

Virtual Lab core coordinates are expressed in **model distance units**. The simulator does not globally declare that one unit is one meter.

An experiment may assign physical units when appropriate. For the current Adaptive Behavior (2012) reproduction, the published numerical defaults correspond to SI quantities such as meters, meters per second, seconds, and radians. A future nondimensional experiment may instead interpret the same simulator coordinate system without physical units.

The live arena visualization includes a scale grid. At ordinary zoom, one visible square is exactly one model distance unit on each side. If an arena becomes so large that one-unit lines would be sub-pixel, the renderer may display a coarser visual grid and labels its spacing explicitly. This visual grid is observational only and is unrelated to the internal neighbour-search spatial index.

`ARENA_SIZE` is the side length in model distance units. Periodic boundaries operate in those same units.
