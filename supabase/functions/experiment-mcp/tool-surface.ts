export const MCP_TOOL_NAMES = Object.freeze([
  'read_workspace',
  'manage_collection',
  'manage_showcase',
  'create_experiment',
  'edit_experiment',
  'delete_experiment',
  'author_metrics_results',
  'request_capability',
  'resume_capability_closure',
  'revalidate_capability_closure',
] as const)

export const MCP_TOOL_COUNT = MCP_TOOL_NAMES.length

export const MCP_TOOLS = Object.freeze({
  readWorkspace: MCP_TOOL_NAMES[0],
  manageCollection: MCP_TOOL_NAMES[1],
  manageShowcase: MCP_TOOL_NAMES[2],
  createExperiment: MCP_TOOL_NAMES[3],
  editExperiment: MCP_TOOL_NAMES[4],
  deleteExperiment: MCP_TOOL_NAMES[5],
  authorMetricsResults: MCP_TOOL_NAMES[6],
  requestCapability: MCP_TOOL_NAMES[7],
  resumeCapabilityClosure: MCP_TOOL_NAMES[8],
  revalidateCapabilityClosure: MCP_TOOL_NAMES[9],
})
