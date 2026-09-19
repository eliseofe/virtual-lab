export const MCP_TOOL_NAMES = Object.freeze([
  'read_workspace',
  'manage_collection',
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
  createExperiment: MCP_TOOL_NAMES[2],
  editExperiment: MCP_TOOL_NAMES[3],
  deleteExperiment: MCP_TOOL_NAMES[4],
  authorMetricsResults: MCP_TOOL_NAMES[5],
  requestCapability: MCP_TOOL_NAMES[6],
  resumeCapabilityClosure: MCP_TOOL_NAMES[7],
  revalidateCapabilityClosure: MCP_TOOL_NAMES[8],
})
