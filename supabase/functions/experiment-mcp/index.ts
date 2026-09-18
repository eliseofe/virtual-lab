import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import { McpServer } from 'npm:@modelcontextprotocol/sdk@1.25.3/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from 'npm:@modelcontextprotocol/sdk@1.25.3/server/webStandardStreamableHttp.js'
import { pipeline } from 'npm:@supabase/middleware'
import { withOAuthProtectedResource } from 'npm:@supabase/server'
import { withRequiredClaims } from 'npm:@supabase/server/middleware/required-claims'
import { withSupabaseClient } from 'npm:@supabase/server/middleware/client'
import { z } from 'npm:zod@4.1.13'

import {
  artifactsFromLegacySources,
  mergeLegacySourcesIntoArtifacts,
} from './authoring.js'
import {
  MCP_AUTHORING_CONTRACT as AUTHORING_CONTRACT,
  MCP_INTERFACE_VERSION,
  MCP_SERVER_VERSION,
  readResultsPresentation,
  registerMetricsResultsTool,
  validateExperimentArtifactsV06 as validateExperimentArtifacts,
} from './metrics-results-tools.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const MCP_RESOURCE = `${SUPABASE_URL}/functions/v1/experiment-mcp`
const AUTHORIZATION_SERVER = `${SUPABASE_URL}/auth/v1`
const CAPABILITY_REQUEST_INTERFACE = 'vlab.capability-request/3'

type RegistryRole = 'student' | 'professor'
type RegistryProfile = {
  id: string
  display_name: string
  role: RegistryRole
}

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const

const WRITE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const

const DESTRUCTIVE_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
} as const

const ARTIFACT_INPUT = z.object({
  id: z.string().min(1).max(200),
  type: z.string().min(1).max(200),
  label: z.string().min(1).max(300),
  format: z.string().min(1).max(200),
  order: z.number().finite(),
  content: z.string(),
})

const CLOSURE_REQUIREMENT_INPUT = z.object({
  key: z.string().min(1).max(120),
  summary: z.string().min(1).max(4000),
  evidence: z.string().min(1).max(12000),
  resolution_status: z.enum(['clear', 'ambiguous']),
})

const CLOSURE_AMBIGUITY_INPUT = z.object({
  key: z.string().min(1).max(120),
  requirement_key: z.string().min(1).max(120),
  question: z.string().min(1).max(6000),
  evidence: z.string().max(12000).default(''),
})

const GROUPED_CAPABILITY_REQUEST_INPUT = z.object({
  capability_domain: z.string().min(1).max(200),
  capability_name: z.string().min(1).max(300),
  requirement_keys: z.array(z.string().min(1).max(120)).min(1).max(50),
  context: z.string().max(20000).default(''),
  requested_artifact_type: z.string().min(1).max(200).optional(),
  requested_lifecycle_hook: z.enum(['setup', 'initialize', 'control', 'measure', 'finalize']).optional(),
})

function json(value: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  })
}

function toolResult(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
  }
}

function toolError(message: string, detail?: unknown) {
  return {
    isError: true,
    content: [
      {
        type: 'text' as const,
        text: detail === undefined ? message : `${message}\n${JSON.stringify(detail, null, 2)}`,
      },
    ],
  }
}

function unsupportedCapabilityBehavior(role: RegistryRole) {
  return {
    requestable: true,
    action: 'request_capability',
    capability_request_interface: CAPABILITY_REQUEST_INTERFACE,
    preserve_draft: true,
    comprehensive_analysis_required: true,
    submitter_role: role,
    triage_authority: 'professor',
  }
}

function authoringInfo(includeContract: boolean, role: RegistryRole) {
  return {
    contract_version: AUTHORING_CONTRACT.contract_version,
    experiment_interface_version: AUTHORING_CONTRACT.experiment_interface_version,
    experiment_artifact_interface: AUTHORING_CONTRACT.experiment_artifact_interface,
    results_presentation_interface: AUTHORING_CONTRACT.results_presentation.schema_version,
    capability_request_interface: CAPABILITY_REQUEST_INTERFACE,
    validation_required_for_source_writes: true,
    invalid_write_policy: AUTHORING_CONTRACT.invalid_write_policy,
    unsupported_capability_behavior: unsupportedCapabilityBehavior(role),
    ...(includeContract ? { contract: AUTHORING_CONTRACT } : {}),
  }
}

function validationForRole(
  validation: ReturnType<typeof validateExperimentArtifacts>,
  role: RegistryRole,
) {
  const unsupported = validation.diagnostics?.some(
    (diagnostic: { category?: string }) => diagnostic.category === 'unsupported-capability',
  )
  return unsupported
    ? { ...validation, unsupported_capability_behavior: unsupportedCapabilityBehavior(role) }
    : validation
}

function legacySourceArgumentsPresent(values: {
  config_source?: string
  initializer_source?: string
  controller_source?: string
}) {
  return values.config_source !== undefined
    || values.initializer_source !== undefined
    || values.controller_source !== undefined
}

function registerExperimentTools(
  server: McpServer,
  supabase: any,
  profile: RegistryProfile,
  email: string | null,
  clientId: string | null,
) {
  const userId = profile.id
  const aiClient = clientId ?? 'mcp-client'

  server.registerTool(
    'read_workspace',
    {
      title: 'Read Virtual Lab experiment workspace',
      description:
        'Start here. Without experiment_id, return the authenticated identity, owned collections, all Experiment summaries visible through the caller\'s RLS permissions, and the caller-visible pending capability queue (requested, approved, or in_progress). The pending queue is durable protocol state: approved means accepted into the developer queue, not implemented. The current authoring contract remains the authority for capabilities available now. Professor supervision and ordinary sharing remain governed by existing RLS. Set owned_only=true only when the caller specifically wants to narrow Experiment discovery; it does not broaden or bypass capability-request visibility. With experiment_id, return that visible experiment, its ordered typed artifacts, and its Results presentation at the current revisions. The artifacts array is canonical. Results presentation is separate workspace state and does not change the scientific Experiment revision. Legacy config_source/initializer_source/controller_source mirrors may remain temporarily in responses for compatibility and must not be treated as a second source of truth. Before authoring or changing artifacts, set include_authoring_contract=true. This tool never writes.',
      inputSchema: {
        experiment_id: z.string().uuid().optional(),
        lifecycle: z.enum(['active', 'archived', 'all']).default('active'),
        owned_only: z.boolean().default(false),
        include_authoring_contract: z.boolean().default(false),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ experiment_id, lifecycle, owned_only, include_authoring_contract }) => {
      const identity = { ...profile, email, oauth_client_id: clientId }
      const authoring = authoringInfo(include_authoring_contract, profile.role)

      if (experiment_id) {
        const { data: experiment, error } = await supabase
          .from('experiments')
          .select('*')
          .eq('id', experiment_id)
          .maybeSingle()
        if (error) return toolError('Could not read experiment.', error.message)
        if (!experiment) return toolError('Experiment was not found or is not visible to this user.')
        try {
          const results_presentation = await readResultsPresentation(supabase, experiment_id)
          return toolResult({ identity, authoring, experiment, results_presentation })
        } catch (presentationError) {
          return toolError('Could not read Results presentation.', presentationError instanceof Error ? presentationError.message : String(presentationError))
        }
      }

      const { data: collections, error: collectionsError } = await supabase
        .from('experiment_collections')
        .select('id, name, created_at, updated_at')
        .order('name')
      if (collectionsError) return toolError('Could not list collections.', collectionsError.message)

      let query = supabase
        .from('experiments')
        .select(
          'id, owner_id, collection_id, title, description, lifecycle, visibility, revision, schema_version, interface_version, created_at, updated_at',
        )
        .order('updated_at', { ascending: false })

      if (owned_only) query = query.eq('owner_id', userId)
      if (lifecycle !== 'all') query = query.eq('lifecycle', lifecycle)

      const { data: experiments, error: experimentsError } = await query
      if (experimentsError) return toolError('Could not list experiments.', experimentsError.message)

      const { data: capabilityQueue, error: capabilityQueueError } = await supabase
        .from('capability_requests')
        .select(
          'id, requester_role, origin_experiment_id, origin_experiment_revision, draft_title, capability_domain, capability_name, context, requested_artifact_type, requested_lifecycle_hook, status, professor_notes, requirement_keys, created_at, updated_at',
        )
        .in('status', ['requested', 'approved', 'in_progress'])
        .order('updated_at', { ascending: false })
      if (capabilityQueueError) {
        return toolError('Could not read pending capability commitments.', capabilityQueueError.message)
      }

      return toolResult({
        identity,
        authoring,
        collections,
        experiments,
        capability_queue: capabilityQueue ?? [],
      })
    },
  )

  server.registerTool(
    'manage_collection',
    {
      title: 'Manage an experiment collection',
      description:
        'Create, rename, or delete one owned collection. For create pass action=create and name. For rename pass action=rename, collection_id, and name. For delete pass action=delete and collection_id. Deleting a collection does not delete its experiments; they become unfiled.',
      inputSchema: {
        action: z.enum(['create', 'rename', 'delete']),
        collection_id: z.string().uuid().optional(),
        name: z.string().min(1).max(200).optional(),
      },
      annotations: DESTRUCTIVE_ANNOTATIONS,
    },
    async ({ action, collection_id, name }) => {
      if (action === 'create') {
        if (!name) return toolError('Create requires name.')
        const { data, error } = await supabase
          .from('experiment_collections')
          .insert({ owner_id: userId, name: name.trim() })
          .select('id, name, created_at, updated_at')
          .single()
        if (error) return toolError('Could not create collection.', error.message)
        return toolResult({ action, collection: data })
      }

      if (!collection_id) return toolError(`${action} requires collection_id.`)

      if (action === 'rename') {
        if (!name) return toolError('Rename requires name.')
        const { data, error } = await supabase
          .from('experiment_collections')
          .update({ name: name.trim(), updated_at: new Date().toISOString() })
          .eq('id', collection_id)
          .select('id, name, created_at, updated_at')
          .maybeSingle()
        if (error) return toolError('Could not rename collection.', error.message)
        if (!data) return toolError('Collection was not found or is not owned by this user.')
        return toolResult({ action, collection: data })
      }

      const { data, error } = await supabase
        .from('experiment_collections')
        .delete()
        .eq('id', collection_id)
        .select('id')
        .maybeSingle()
      if (error) return toolError('Could not delete collection.', error.message)
      if (!data) return toolError('Collection was not found or is not owned by this user.')
      return toolResult({ action, deleted_collection_id: data.id })
    },
  )

  server.registerTool(
    'create_experiment',
    {
      title: 'Create a new validated experiment',
      description:
        'Create a brand-new owned experiment from an ordered typed artifacts array. Read the authoring contract first and preserve each artifact id/type/format. The artifacts array is canonical and validated before writing. During the compatibility transition an older client may instead supply all three legacy source arguments; they are converted to canonical artifacts with an empty compulsory Metrics artifact. Do not supply both forms. Use author_metrics_results afterward to add/amend individual metrics and Results panels without rewriting unrelated artifacts.',
      inputSchema: {
        title: z.string().min(1).max(300),
        description: z.string().default(''),
        collection_id: z.string().uuid().nullable().optional(),
        artifacts: z.array(ARTIFACT_INPUT).min(3).optional(),
        config_source: z.string().optional(),
        initializer_source: z.string().optional(),
        controller_source: z.string().optional(),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    async ({ title, description, collection_id, artifacts, config_source, initializer_source, controller_source }) => {
      const hasLegacy = legacySourceArgumentsPresent({ config_source, initializer_source, controller_source })
      if (artifacts !== undefined && hasLegacy) {
        return toolError('Supply canonical artifacts or the legacy three-source compatibility form, not both.')
      }

      let nextArtifacts = artifacts
      if (nextArtifacts === undefined) {
        if (config_source === undefined || initializer_source === undefined || controller_source === undefined) {
          return toolError('Create requires artifacts. Legacy compatibility requires all three source arguments.')
        }
        nextArtifacts = artifactsFromLegacySources({ config_source, initializer_source, controller_source })
      }

      const validation = validateExperimentArtifacts(nextArtifacts)
      if (!validation.valid) {
        return toolError(
          'Experiment artifacts are not valid for the current Virtual Lab authoring contract.',
          validationForRole(validation, profile.role),
        )
      }

      const { data, error } = await supabase
        .from('experiments')
        .insert({
          owner_id: userId,
          collection_id: collection_id ?? null,
          title: title.trim(),
          description,
          artifacts: nextArtifacts,
          created_by_actor: 'ai',
          created_by_ai_client: aiClient,
          updated_by_actor: 'ai',
          updated_by_ai_client: aiClient,
        })
        .select('*')
        .single()
      if (error) return toolError('Could not create experiment.', error.message)
      return toolResult({ ...data, validation })
    },
  )

  server.registerTool(
    'edit_experiment',
    {
      title: 'Edit, move, archive, or restore an experiment',
      description:
        'Modify an owned experiment using optimistic concurrency. Always use the latest base_revision from read_workspace. To change scientific source wholesale, pass the complete canonical artifacts array. Prefer author_metrics_results for individual metric and Results-panel changes. During compatibility an older client may instead pass one or more legacy source arguments; they are merged into canonical artifacts. A stale revision is rejected.',
      inputSchema: {
        experiment_id: z.string().uuid(),
        base_revision: z.number().int().positive(),
        title: z.string().min(1).max(300).optional(),
        description: z.string().optional(),
        artifacts: z.array(ARTIFACT_INPUT).min(3).optional(),
        config_source: z.string().optional(),
        initializer_source: z.string().optional(),
        controller_source: z.string().optional(),
        collection_id: z.string().uuid().nullable().optional(),
        lifecycle: z.enum(['active', 'archived']).optional(),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    async ({
      experiment_id,
      base_revision,
      title,
      description,
      artifacts,
      config_source,
      initializer_source,
      controller_source,
      collection_id,
      lifecycle,
    }) => {
      const hasLegacy = legacySourceArgumentsPresent({ config_source, initializer_source, controller_source })
      if (artifacts !== undefined && hasLegacy) {
        return toolError('Supply canonical artifacts or legacy source compatibility arguments, not both.')
      }
      const artifactChanged = artifacts !== undefined || hasLegacy

      let validation: ReturnType<typeof validateExperimentArtifacts> | null = null
      let nextArtifacts = artifacts
      if (artifactChanged) {
        const { data: current, error: currentError } = await supabase
          .from('experiments')
          .select('artifacts')
          .eq('id', experiment_id)
          .eq('owner_id', userId)
          .eq('revision', base_revision)
          .maybeSingle()
        if (currentError) return toolError('Could not read the current experiment artifacts for validation.', currentError.message)
        if (!current) {
          return toolError(
            'Conflict: the experiment is stale, missing, or not owned by this user. Re-read it with read_workspace before editing.',
          )
        }

        if (nextArtifacts === undefined) {
          nextArtifacts = mergeLegacySourcesIntoArtifacts(current.artifacts, {
            config_source,
            initializer_source,
            controller_source,
          })
        }

        validation = validateExperimentArtifacts(nextArtifacts)
        if (!validation.valid) {
          return toolError(
            'Experiment artifacts are not valid for the current Virtual Lab authoring contract.',
            validationForRole(validation, profile.role),
          )
        }
      }

      const patch: Record<string, unknown> = {
        updated_by_actor: 'ai',
        updated_by_ai_client: aiClient,
      }

      if (title !== undefined) patch.title = title.trim()
      if (description !== undefined) patch.description = description
      if (artifactChanged) patch.artifacts = nextArtifacts
      if (collection_id !== undefined) patch.collection_id = collection_id
      if (lifecycle !== undefined) patch.lifecycle = lifecycle

      if (Object.keys(patch).length === 2) return toolError('No experiment fields were supplied to edit.')

      const { data, error } = await supabase
        .from('experiments')
        .update(patch)
        .eq('id', experiment_id)
        .eq('owner_id', userId)
        .eq('revision', base_revision)
        .select('*')
        .maybeSingle()

      if (error) return toolError('Could not edit experiment.', error.message)
      if (!data) {
        return toolError(
          'Conflict: the experiment is stale, missing, or not owned by this user. Re-read it with read_workspace before editing.',
        )
      }
      return toolResult(validation ? { ...data, validation } : data)
    },
  )

  server.registerTool(
    'delete_experiment',
    {
      title: 'Permanently delete a working experiment',
      description:
        'Permanently delete an eligible owned working experiment at its latest revision. Use only when permanent deletion is explicitly intended. Preserved submission or curation snapshots are independent and survive.',
      inputSchema: {
        experiment_id: z.string().uuid(),
        base_revision: z.number().int().positive(),
      },
      annotations: DESTRUCTIVE_ANNOTATIONS,
    },
    async ({ experiment_id, base_revision }) => {
      const { data, error } = await supabase
        .from('experiments')
        .delete()
        .eq('id', experiment_id)
        .eq('owner_id', userId)
        .eq('revision', base_revision)
        .select('id')
        .maybeSingle()

      if (error) return toolError('Could not permanently delete experiment.', error.message)
      if (!data) {
        return toolError(
          'Conflict: the experiment is stale, missing, or not owned by this user. Re-read it with read_workspace before deleting.',
        )
      }
      return toolResult({ permanently_deleted_experiment_id: data.id })
    },
  )

  registerMetricsResultsTool(server, supabase, profile, clientId)

  server.registerTool(
    'request_capability',
    {
      title: 'Submit missing Virtual Lab capabilities for a blocked Experiment',
      description:
        'Student/Professor research-AI action. Use only after analysing the whole intended Experiment against the active Virtual Lab contract. Preserve a resumable blocked draft plus all scientifically meaningful unsupported requirements found in this pass. Repeated submissions for the same blocked Experiment converge on the same durable blocked Experiment and accumulate the initial closure analysis. Matching existing nonterminal capability requests are reconciled into that closure while preserving their current lifecycle state. Do not stop at the first parser/compiler diagnostic. Group low-level diagnostics into meaningful capability requests. Mark scientifically unresolved requirements as ambiguous and preserve the question/evidence; ambiguous requirements must not be forwarded as developer-ready capability requests. Submission enters the Professor triage queue and grants no development authority.',
      inputSchema: {
        origin_experiment_id: z.string().uuid().optional(),
        origin_revision: z.number().int().positive().optional(),
        draft_title: z.string().min(1).max(300).optional(),
        draft_description: z.string().max(20000).optional(),
        draft_artifacts: z.array(ARTIFACT_INPUT).optional(),
        source_context: z.string().max(40000).default(''),
        analysis_status: z.enum(['best_effort_complete', 'partial_due_to_ambiguity']),
        identified_requirements: z.array(CLOSURE_REQUIREMENT_INPUT).min(1).max(100),
        unresolved_ambiguities: z.array(CLOSURE_AMBIGUITY_INPUT).max(100).default([]),
        requests: z.array(GROUPED_CAPABILITY_REQUEST_INPUT).max(50).default([]),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    async ({
      origin_experiment_id,
      origin_revision,
      draft_title,
      draft_description,
      draft_artifacts,
      source_context,
      analysis_status,
      identified_requirements,
      unresolved_ambiguities,
      requests,
    }) => {
      if (origin_revision !== undefined && origin_experiment_id === undefined) {
        return toolError('origin_revision requires origin_experiment_id.')
      }

      if (
        origin_experiment_id === undefined
        && draft_artifacts === undefined
        && !(draft_description?.trim())
        && !(source_context?.trim())
      ) {
        return toolError(
          'A title alone is not enough. Preserve the blocked Experiment artifacts, scientific description, or source/research context.',
        )
      }

      const { data, error } = await supabase.rpc('submit_capability_closure', {
        p_origin_experiment_id: origin_experiment_id ?? null,
        p_origin_experiment_revision: origin_revision ?? null,
        p_draft_title: draft_title ?? null,
        p_draft_description: draft_description ?? null,
        p_draft_artifacts: draft_artifacts ?? null,
        p_source_context: source_context,
        p_contract_version: AUTHORING_CONTRACT.contract_version,
        p_analysis_status: analysis_status,
        p_identified_requirements: identified_requirements,
        p_unresolved_ambiguities: unresolved_ambiguities,
        p_requests: requests,
      })

      if (error) return toolError('Could not submit the blocked Experiment capability analysis.', error.message)

      return toolResult({
        capability_request_interface: CAPABILITY_REQUEST_INTERFACE,
        submitter_role: profile.role,
        triage_authority: 'professor',
        submission: data,
      })
    },

  )

  if (profile.role === 'professor') {
    server.registerTool(
      'resume_capability_closure',
      {
        title: 'Resume a durable blocked Experiment capability closure',
        description:
          'Professor-only research-AI action. Reopen one durable blocked Experiment without relying on chat history. Return the preserved scientific draft/context, the complete ordered closure-analysis history, the latest analysis, and all linked capability requests with their current lifecycle state. Use this before revalidating after deployed capability-contract changes.',
        inputSchema: {
          blocked_experiment_id: z.string().uuid(),
        },
        annotations: READ_ONLY_ANNOTATIONS,
      },
      async ({ blocked_experiment_id }) => {
        const { data: blockedExperiment, error: draftError } = await supabase
          .from('blocked_experiment_drafts')
          .select('*')
          .eq('id', blocked_experiment_id)
          .maybeSingle()
        if (draftError) return toolError('Could not read the blocked Experiment.', draftError.message)
        if (!blockedExperiment) return toolError('Blocked Experiment was not found or is not visible to this Professor.')

        const { data: analyses, error: analysisError } = await supabase
          .from('capability_closure_analyses')
          .select('*')
          .eq('blocked_experiment_id', blocked_experiment_id)
          .order('analysis_sequence', { ascending: true })
        if (analysisError) return toolError('Could not read capability-closure history.', analysisError.message)

        const analysisHistory = analyses ?? []
        const analysisIds = analysisHistory.map((analysis: { id: string }) => analysis.id)
        let linkedRequests: unknown[] = []
        if (analysisIds.length > 0) {
          const { data: requests, error: requestsError } = await supabase
            .from('capability_requests')
            .select('*')
            .in('closure_analysis_id', analysisIds)
            .order('created_at', { ascending: true })
          if (requestsError) return toolError('Could not read linked capability requests.', requestsError.message)
          linkedRequests = requests ?? []
        }

        return toolResult({
          capability_request_interface: CAPABILITY_REQUEST_INTERFACE,
          blocked_experiment: blockedExperiment,
          analysis_history: analysisHistory,
          latest_analysis: analysisHistory.length > 0 ? analysisHistory[analysisHistory.length - 1] : null,
          linked_requests: linkedRequests,
          revalidate_with: 'revalidate_capability_closure',
        })
      },
    )

    server.registerTool(
      'revalidate_capability_closure',
      {
        title: 'Revalidate a whole blocked Experiment against the current capability contract',
        description:
          'Professor-only research-AI action. After one or more capabilities have been deployed and advertised, re-analyse the entire preserved Experiment against the current contract, not only the capability just implemented. Supply the complete remaining/new unsupported requirements and unresolved scientific ambiguity. The new analysis is appended to the same blocked Experiment. Existing capability-request rows and lifecycle states are preserved; new_requests is only for newly surfaced clear gaps that do not already have a durable request. Use analysis_status=unblocked only when no unsupported semantics and no unresolved scientific ambiguity remain.',
        inputSchema: {
          blocked_experiment_id: z.string().uuid(),
          base_analysis_sequence: z.number().int().positive(),
          analysis_status: z.enum(['best_effort_complete', 'partial_due_to_ambiguity', 'unblocked']),
          identified_requirements: z.array(CLOSURE_REQUIREMENT_INPUT).max(100).default([]),
          unresolved_ambiguities: z.array(CLOSURE_AMBIGUITY_INPUT).max(100).default([]),
          new_requests: z.array(GROUPED_CAPABILITY_REQUEST_INPUT).max(50).default([]),
        },
        annotations: WRITE_ANNOTATIONS,
      },
      async ({
        blocked_experiment_id,
        base_analysis_sequence,
        analysis_status,
        identified_requirements,
        unresolved_ambiguities,
        new_requests,
      }) => {
        if (
          analysis_status === 'unblocked'
          && (identified_requirements.length > 0 || unresolved_ambiguities.length > 0 || new_requests.length > 0)
        ) {
          return toolError('Unblocked requires zero unsupported requirements, zero ambiguity, and zero new requests.')
        }
        if (analysis_status === 'best_effort_complete' && identified_requirements.length === 0) {
          return toolError('best_effort_complete revalidation must retain at least one unsupported requirement.')
        }
        if (analysis_status === 'partial_due_to_ambiguity' && unresolved_ambiguities.length === 0) {
          return toolError('partial_due_to_ambiguity requires unresolved scientific ambiguity.')
        }

        const { data, error } = await supabase.rpc('revalidate_capability_closure', {
          p_blocked_experiment_id: blocked_experiment_id,
          p_base_analysis_sequence: base_analysis_sequence,
          p_contract_version: AUTHORING_CONTRACT.contract_version,
          p_analysis_status: analysis_status,
          p_identified_requirements: identified_requirements,
          p_unresolved_ambiguities: unresolved_ambiguities,
          p_new_requests: new_requests,
        })

        if (error) return toolError('Could not revalidate the blocked Experiment capability closure.', error.message)

        return toolResult({
          capability_request_interface: CAPABILITY_REQUEST_INTERFACE,
          revalidated_by_role: profile.role,
          whole_experiment_revalidation: true,
          revalidation: data,
        })
      },
    )
  }
}

const authenticatedMcp = pipeline(
  [withRequiredClaims(), withSupabaseClient()],
  async (req, ctx) => {
    const claims = ctx.jwtClaims as Record<string, unknown>
    const userId = String(claims.sub)
    const email = typeof claims.email === 'string' ? claims.email : null
    const clientId = typeof claims.client_id === 'string' ? claims.client_id : null

    const { data: rawProfile, error: profileError } = await ctx.supabase
      .from('profiles')
      .select('id, display_name, role')
      .eq('id', userId)
      .single()
    if (profileError || !rawProfile) {
      return json({ error: 'Could not read the authenticated Virtual Lab profile.' }, 500)
    }
    const profile = rawProfile as RegistryProfile

    const server = new McpServer({
      name: 'virtual-lab-experiment-registry',
      version: MCP_SERVER_VERSION,
    })
    registerExperimentTools(server, ctx.supabase, profile, email, clientId)

    const transport = new WebStandardStreamableHTTPServerTransport()
    await server.connect(transport)
    return transport.handleRequest(req)
  },
)

const oauthProtectedMcp = withOAuthProtectedResource(
  {
    resourceServer: MCP_RESOURCE,
    authorizationServer: AUTHORIZATION_SERVER,
  },
  authenticatedMcp,
)

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)

  if (url.pathname.endsWith('/health')) {
    return json({
      ok: true,
      service: 'virtual-lab-experiment-mcp',
      interface_version: MCP_INTERFACE_VERSION,
      experiment_artifact_interface: AUTHORING_CONTRACT.experiment_artifact_interface,
      results_presentation_interface: AUTHORING_CONTRACT.results_presentation.schema_version,
      capability_request_interface: CAPABILITY_REQUEST_INTERFACE,
      auth_implementation: 'supabase-jwks-middleware',
      authoring_contract_version: AUTHORING_CONTRACT.contract_version,
      validation_mode: AUTHORING_CONTRACT.validation_mode,
      tool_count: 9,
      shared_tool_count: 7,
      student_tool_count: 7,
      professor_tool_count: 9,
      simulator_access: false,
    })
  }

  if (url.pathname.endsWith('/.well-known/oauth-protected-resource')) {
    return json({
      resource: MCP_RESOURCE,
      authorization_servers: [AUTHORIZATION_SERVER],
      scopes_supported: ['email', 'profile'],
      bearer_methods_supported: ['header'],
    })
  }

  return oauthProtectedMcp(req)
})
