// Compatibility export for the canonical capability consistency seam.
// #375 moves the implemented authoring surface into capability-bindings.js so
// the compiler and research-AI discovery consume the same capability-owned data.

export {
  IMPLEMENTED_CAPABILITY_BINDINGS as CANONICAL_CAPABILITY_BINDINGS,
} from "./capability-bindings.js"
