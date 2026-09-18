import { z } from 'npm:zod@4.1.13'

import {
  AUTHORING_CONTRACT as BASE_AUTHORING_CONTRACT,
  validateExperimentArtifacts as validateBaseExperimentArtifacts,
} from './authoring.js'
import {
  RESULTS_PRESENTATION_CONTRACT,
  RESULTS_PRESENTATION_SCHEMA,
  emptyResultsPresentation,
  metricIdsFromArtifacts,
  mutateMetricArtifact,
  mutateResultsPanels,
  normalizeResultsPanels,
  pruneMetricFromPanels,
} from './results-authoring.js'

export const MCP_SERVER_VERSION = '3.2.0'
export const MCP_INTERFACE_VERSION = '10'
export const MCP_AUTHORING_CONTRACT = Object.freeze({
  ...BASE_AUTHORING_CONTRACT,
  contract_version: 'vlab.authoring/0.6',
  experiment_interface_version: MCP_INTERFACE_VERSION,
  capability_request_interface: 'vlab.capability-request/3',
  results_presentation: RESULTS_PRESENTATION_CONTRACT,
})

export function validateExperimentArtifactsV06(artifacts: unknown[]) {
  const validation = validateBaseExperimentArtifacts(artifacts)
  return { ...validation, contract_version: MCP_AUTHORING_CONTRACT.contract_version }
}

const WRITE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const

function toolResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] }
}

function toolError(message: string, detail?: unknown) {
  return {
    isError: true,
    content: [{
      type: 'text' as const,
      text: detail === undefined ? message : `${message}\n${JSON.stringify(detail, null, 2)}`,
    }],
  }
}

function validationForRole(validation: any, role: 'student' | 'professor') {
  const unsupported = validation.diagnostics?.some((diagnostic: { category?: string }) => diagnostic.category === 'unsupported-capability')
  if (!unsupported) return validation
  return {
    ...validation,
    unsupported_capability_behavior: {
      requestable: true,
      action: 'request_capability',
      capability_request_interface: 'vlab.capability-request/3',
      preserve_draft: true,
      comprehensive_analysis_required: true,
      submitter_role: role,
      triage_authority: 'professor',
    },
  }
}

async function ownedExperimentAtRevision(supabase: any, userId: string, experimentId: string, baseRevision?: number) {
  let query = supabase
    .from('experiments')
    .select('id,owner_id,title,description,revision,artifacts')
    .eq('id', experimentId)
    .eq('owner_id', userId)
  if (baseRevision !== undefined) query = query.eq('revision', baseRevision)
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

async function visibleExperiment(supabase: any, experimentId: string) {
  const { data, error } = await supabase
    .from('experiments')
    .select('id,owner_id,title,description,revision,artifacts')
    .eq('id', experimentId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function readResultsPresentation(supabase: any, experimentId: string) {
  const { data, error } = await supabase
    .from('experiment_results_presentations')
    .select('schema_version,revision,panels,created_at,updated_at,updated_by_actor,updated_by_ai_client')
    .eq('experiment_id', experimentId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ?? emptyResultsPresentation()
}

async function writeResultsPresentation({
  supabase,
  experimentId,
  currentRevision,
  panels,
  aiClient,
}: {
  supabase: any
  experimentId: string
  currentRevision: number
  panels: unknown[]
  aiClient: string
}) {
  if (currentRevision === 0) {
    const { data, error } = await supabase
      .from('experiment_results_presentations')
      .insert({
        experiment_id: experimentId,
        schema_version: RESULTS_PRESENTATION_SCHEMA,
        panels,
        created_by_actor: 'ai',
        created_by_ai_client: aiClient,
        updated_by_actor: 'ai',
        updated_by_ai_client: aiClient,
      })
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data
  }

  const { data, error } = await supabase
    .from('experiment_results_presentations')
    .update({ panels, updated_by_actor: 'ai', updated_by_ai_client: aiClient })
    .eq('experiment_id', experimentId)
    .eq('revision', currentRevision)
    .select('*')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Results presentation conflict: re-read before editing the layout.')
  return data
}

function metricOperationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return {
    valid: false,
    contract_version: MCP_AUTHORING_CONTRACT.contract_version,
    diagnostics: [{
      artifact: 'metrics',
      category: /unknown metric|does not exist|already exists|stable metric id/i.test(message) ? 'metric-id' : 'metrics',
      compiler_category: null,
      parameter: null,
      message,
      line: null,
      column: null,
    }],
  }
}

export function registerMetricsResultsTool(
  server: any,
  supabase: any,
  profile: { id: string; role: 'student' | 'professor' },
  clientId: string | null,
) {
  const userId = profile.id
  const aiClient = clientId ?? 'mcp-client'

  server.registerTool(
    'author_metrics_results',
    {
      title: 'Author Experiment Metrics and Results presentation',
      description:
        'Fine-grained authoring for the compulsory Metrics artifact and non-scientific Results presentation. Start with action=read. Metric actions create/update/remove one metric definition without rewriting unrelated artifacts. Panel actions create/update/remove one time-series panel using stable metric IDs. Updating a panel does not increment the scientific Experiment revision. update_metric must preserve the stable metric id; changing identity requires remove/create. Unsupported metric syntax/capabilities return validation diagnostics rather than workarounds.',
      inputSchema: {
        action: z.enum(['read', 'create_metric', 'update_metric', 'remove_metric', 'upsert_panel', 'remove_panel']),
        experiment_id: z.string().uuid(),
        base_revision: z.number().int().positive().optional(),
        base_presentation_revision: z.number().int().nonnegative().optional(),
        metric_id: z.string().optional(),
        metric_source: z.string().optional(),
        panel_id: z.string().optional(),
        metric_ids: z.array(z.string()).optional(),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    async ({
      action,
      experiment_id,
      base_revision,
      base_presentation_revision,
      metric_id,
      metric_source,
      panel_id,
      metric_ids,
    }: {
      action: string
      experiment_id: string
      base_revision?: number
      base_presentation_revision?: number
      metric_id?: string
      metric_source?: string
      panel_id?: string
      metric_ids?: string[]
    }) => {
      try {
        if (action === 'read') {
          const experiment = await visibleExperiment(supabase, experiment_id)
          if (!experiment) return toolError('Experiment was not found or is not visible to this user.')
          const presentation = await readResultsPresentation(supabase, experiment_id)
          return toolResult({
            authoring_contract_version: MCP_AUTHORING_CONTRACT.contract_version,
            results_presentation_contract: RESULTS_PRESENTATION_CONTRACT,
            experiment: {
              id: experiment.id,
              title: experiment.title,
              revision: experiment.revision,
              metrics: metricIdsFromArtifacts(experiment.artifacts),
              artifacts: experiment.artifacts,
            },
            results_presentation: presentation,
          })
        }

        if (base_revision === undefined) return toolError(`${action} requires base_revision from a fresh read.`)
        const experiment = await ownedExperimentAtRevision(supabase, userId, experiment_id, base_revision)
        if (!experiment) {
          return toolError('Conflict: the experiment is stale, missing, or not owned by this user. Re-read before editing.')
        }

        if (action === 'create_metric' || action === 'update_metric' || action === 'remove_metric') {
          let mutated
          try {
            mutated = mutateMetricArtifact(experiment.artifacts, { action, metric_id, metric_source })
          } catch (error) {
            return toolError('Metric operation is not valid for the current Virtual Lab authoring contract.', validationForRole(metricOperationError(error), profile.role))
          }

          const validation = validateExperimentArtifactsV06(mutated.artifacts)
          if (!validation.valid) {
            return toolError('Experiment artifacts are not valid for the current Virtual Lab authoring contract.', validationForRole(validation, profile.role))
          }

          const { data: updated, error: updateError } = await supabase
            .from('experiments')
            .update({ artifacts: mutated.artifacts, updated_by_actor: 'ai', updated_by_ai_client: aiClient })
            .eq('id', experiment_id)
            .eq('owner_id', userId)
            .eq('revision', base_revision)
            .select('*')
            .maybeSingle()
          if (updateError) return toolError('Could not update the Metrics artifact.', updateError.message)
          if (!updated) return toolError('Conflict: the Experiment changed while the metric edit was being written. Re-read before editing.')

          let presentation = await readResultsPresentation(supabase, experiment_id)
          if (action === 'remove_metric' && presentation.revision > 0) {
            const nextMetricIds = metricIdsFromArtifacts(updated.artifacts)
            const nextPanels = pruneMetricFromPanels(presentation.panels, nextMetricIds, metric_id ?? '')
            if (JSON.stringify(nextPanels) !== JSON.stringify(presentation.panels)) {
              presentation = await writeResultsPresentation({
                supabase,
                experimentId: experiment_id,
                currentRevision: presentation.revision,
                panels: nextPanels,
                aiClient,
              })
            }
          }

          return toolResult({
            action,
            metric_id: mutated.metric_id,
            experiment_revision: updated.revision,
            validation,
            metrics: metricIdsFromArtifacts(updated.artifacts),
            results_presentation: presentation,
          })
        }

        if (action === 'upsert_panel' || action === 'remove_panel') {
          if (base_presentation_revision === undefined) {
            return toolError(`${action} requires base_presentation_revision from action=read (0 means no saved presentation yet).`)
          }
          const availableMetricIds = metricIdsFromArtifacts(experiment.artifacts)
          const current = await readResultsPresentation(supabase, experiment_id)
          if (current.revision !== base_presentation_revision) {
            return toolError(`Results presentation conflict: current revision is ${current.revision}; re-read before editing.`)
          }
          let panels
          try {
            panels = mutateResultsPanels(current.panels, availableMetricIds, {
              action,
              panel_id,
              metric_ids,
            })
          } catch (error) {
            return toolError('Results panel operation is invalid.', error instanceof Error ? error.message : String(error))
          }
          const presentation = await writeResultsPresentation({
            supabase,
            experimentId: experiment_id,
            currentRevision: current.revision,
            panels,
            aiClient,
          })
          return toolResult({
            action,
            experiment_revision: experiment.revision,
            results_presentation: presentation,
            scientific_revision_changed: false,
          })
        }

        return toolError(`Unsupported action '${action}'.`)
      } catch (error) {
        return toolError('Metrics/Results authoring failed.', error instanceof Error ? error.message : String(error))
      }
    },
  )
}

// Kept explicit for contract tests: read is semantically read-only even though the
// combined tool also contains writes, so clients can inspect action=read safely.
export const METRICS_RESULTS_READ_ANNOTATIONS = READ_ONLY_ANNOTATIONS
