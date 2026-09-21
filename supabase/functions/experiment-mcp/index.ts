import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import { McpServer } from 'npm:@modelcontextprotocol/sdk@1.25.3/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from 'npm:@modelcontextprotocol/sdk@1.25.3/server/webStandardStreamableHttp.js'
import { pipeline } from 'npm:@supabase/middleware'
import { withOAuthProtectedResource } from 'npm:@supabase/server'
import { withRequiredClaims } from 'npm:@supabase/server/middleware/required-claims'
import { withSupabaseClient } from 'npm:@supabase/server/middleware/client'
import { z } from 'npm:zod@4.1.13'

import { buildClosureLinkedRequests } from './closure-linked-requests.js'
import { CANONICAL_CAPABILITY_BINDINGS } from './canonical-capability-bindings.js'
import { validateCanonicalCapabilitySurface } from './canonical-capability-consistency.js'
import {
  MCP_AUTHORING_CONTRACT as AUTHORING_CONTRACT,
  MCP_INTERFACE_VERSION,
  MCP_SERVER_VERSION,
  readResultsPresentation,
  registerMetricsResultsTool,
  validateExperimentArtifactsV09 as validateExperimentArtifacts,
} from './metrics-results-tools.ts'
import { MCP_TOOL_COUNT, MCP_TOOL_NAMES } from './tool-surface.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const MCP_RESOURCE = `${SUPABASE_URL}/functions/v1/experiment-mcp`
const AUTHORIZATION_SERVER = `${SUPABASE_URL}/auth/v1`
const CAPABILITY_REQUEST_INTERFACE = 'vlab.capability-request/7'

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

const EXTENSION_REQUEST_CLASSES = [
  'semantic_capability',
  'authoring_language',
  'runtime_configuration',
  'artifact_workflow',
  'implementation_optimization',
  'security_boundary',
] as const

const EXTENSION_REQUEST_CLASS = z.enum(EXTENSION_REQUEST_CLASSES)

const REQUEST_REQUIREMENT_KEYS = z.array(z.string().min(1).max(120)).min(1).max(50)

const CANDIDATE_AUTHORING_SURFACE = z.object({
  artifact: z.enum(['configuration', 'initialization', 'controller', 'metrics', 'environment', 'runtime']),
  kind: z.string().min(1).max(120),
  symbol: z.string().min(1).max(300),
  value_type: z.string().min(1).max(200).optional(),
  signature: z.record(z.string(), z.unknown()).optional(),
}).passthrough()

const CANDIDATE_CAPABILITY_SPEC = z.object({
  capability_key: z.string().min(1).max(240),
  capability_domain: z.string().min(1).max(200),
  capability_name: z.string().min(1).max(300),
  scientific_definition: z.string().min(1).max(6000).describe(
    'Scientific/model definition of the unavailable capability, preferably using source-publication terminology.',
  ),
  target_artifact: z.enum(['configuration', 'initialization', 'controller', 'metrics', 'environment', 'runtime']),
  target_runtime_domain: z.string().min(1).max(300),
  authoring_surfaces: z.array(CANDIDATE_AUTHORING_SURFACE).min(1).max(50),
})

const CANDIDATE_CONTRACT_DELTA_SPEC = z.object({
  delta_key: z.string().min(1).max(240),
  delta_name: z.string().min(1).max(300),
  target_contract_path: z.string().min(1).max(500).describe(
    'Precise path in the stable authoring/platform contract, for example artifacts.controller.language_intrinsics.',
  ),
  requested_change: z.string().min(1).max(6000).describe(
    'Requested rule, addition, or change expressed directly in the stable contract vocabulary.',
  ),
})

const REUSED_EXTENSION_REQUEST_INPUT = z.object({
  existing_request_id: z.string().uuid().describe(
    'Stable request ID exposed by candidate_capabilities or candidate_contract_deltas.',
  ),
  relationship: z.enum(['covered', 'generalization_needed']).default('covered'),
  generalization_note: z.string().min(1).max(6000).optional().describe(
    'Required when relationship=generalization_needed: why the prior candidate is related but too narrow or ambiguous.',
  ),
  requirement_keys: REQUEST_REQUIREMENT_KEYS,
})

const NEW_SEMANTIC_EXTENSION_REQUEST_INPUT = z.object({
  request_class: z.literal('semantic_capability'),
  candidate_capability: CANDIDATE_CAPABILITY_SPEC,
  novelty_statement: z.string().min(1).max(6000).describe(
    'Why this scientific/model need is genuinely absent from both implemented and candidate capabilities.',
  ),
  requirement_keys: REQUEST_REQUIREMENT_KEYS,
  context: z.string().max(20000).default(''),
  requested_lifecycle_hook: z.enum(['setup', 'initialize', 'control', 'measure', 'finalize']).optional(),
})

const NON_SEMANTIC_EXTENSION_REQUEST_CLASS = z.enum([
  'authoring_language',
  'runtime_configuration',
  'artifact_workflow',
  'implementation_optimization',
  'security_boundary',
])

const NEW_CONTRACT_DELTA_REQUEST_INPUT = z.object({
  request_class: NON_SEMANTIC_EXTENSION_REQUEST_CLASS,
  candidate_contract_delta: CANDIDATE_CONTRACT_DELTA_SPEC,
  novelty_statement: z.string().min(1).max(6000).describe(
    'Why this contract need is genuinely absent from both the stable contract and existing candidate contract deltas.',
  ),
  requirement_keys: REQUEST_REQUIREMENT_KEYS,
  context: z.string().max(20000).default(''),
  requested_lifecycle_hook: z.enum(['setup', 'initialize', 'control', 'measure', 'finalize']).optional(),
})

const GROUPED_EXTENSION_REQUEST_INPUT = z.union([
  REUSED_EXTENSION_REQUEST_INPUT,
  NEW_SEMANTIC_EXTENSION_REQUEST_INPUT,
  NEW_CONTRACT_DELTA_REQUEST_INPUT,
])

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

function extensionRequestBehavior(role: RegistryRole) {
  return {
    requestable: true,
    action: 'request_capability',
    capability_request_interface: CAPABILITY_REQUEST_INTERFACE,
    request_classes: EXTENSION_REQUEST_CLASSES,
    canonical_registry_first: true,
    candidate_capability_catalog_first: true,
    candidate_contract_delta_catalog_first: true,
    reuse_when_candidate_covers: true,
    generalization_evidence_when_related: true,
    new_request_threshold: 'genuinely_absent_from_implemented_and_candidates',
    request_language: 'scientific_model',
    durable_closure_required: true,
    task_state_while_unsupported: 'blocked',
    resume_action: 'resume_capability_closure',
    revalidate_action: 'revalidate_capability_closure',
    unblocked_only_after_revalidation: true,
    preserve_draft: true,
    preserve_publication_identity: true,
    comprehensive_analysis_required: true,
    submitter_role: role,
    triage_authority: 'professor',
    automatic_rejection_classes: [],
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
    extension_request_behavior: extensionRequestBehavior(role),
    ...(includeContract ? { contract: AUTHORING_CONTRACT } : {}),
  }
}

function validationForRole(
  validation: ReturnType<typeof validateExperimentArtifacts>,
  role: RegistryRole,
) {
  const requestClasses = [
    ...new Set(
      (validation.diagnostics ?? [])
        .map((diagnostic: { request_class?: string | null }) => diagnostic.request_class)
        .filter((value: string | null | undefined): value is string => Boolean(value)),
    ),
  ]
  return requestClasses.length
    ? {
        ...validation,
        extension_request_behavior: {
          ...extensionRequestBehavior(role),
          diagnostic_request_classes: requestClasses,
        },
      }
    : validation
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
      title: 'Read Virtual Lab knowledge or an explicit experiment workspace',
      description:
        'Start here for current Lab knowledge. Without experiment_id, return the authenticated identity, the stable Virtual Lab authoring/compiler contract, implemented canonical capabilities with concrete authoring surfaces, candidate_capabilities, and candidate_contract_deltas. Implemented support alone drives authoring acceptance; every candidate remains unavailable. Compare unsupported requirements with both candidate catalogs before creating a request: covered candidates receive new evidence; related-but-too-narrow candidates receive generalization-needed evidence; only genuinely absent needs create one new structured candidate/request. Set include_workspace_index=true only when Experiment discovery is needed. With experiment_id, return that visible Experiment and Results presentation. This tool never writes.',
      inputSchema: {
        experiment_id: z.string().uuid().optional(),
        include_workspace_index: z.boolean().default(false),
        lifecycle: z.enum(['active', 'archived', 'all']).default('active'),
        owned_only: z.boolean().default(false),
        include_authoring_contract: z.boolean().default(false),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ experiment_id, include_workspace_index, lifecycle, owned_only, include_authoring_contract }) => {
      const identity = { ...profile, email, oauth_client_id: clientId }
      const authoring = authoringInfo(experiment_id ? include_authoring_contract : true, profile.role)

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

      const { data: capabilityRegistry, error: capabilityRegistryError } = await supabase
        .rpc('list_canonical_capability_registry')
      if (capabilityRegistryError) {
        return toolError('Could not read canonical Virtual Lab capabilities.', capabilityRegistryError.message)
      }

      const capabilityConsistency = validateCanonicalCapabilitySurface(
        capabilityRegistry ?? [],
        CANONICAL_CAPABILITY_BINDINGS,
      )
      if (!capabilityConsistency.valid) {
        return toolError(
          'Canonical Virtual Lab capability truth is inconsistent with the deployed authoring bindings.',
          capabilityConsistency.errors,
        )
      }

      const capabilityBindingsById = new Map(
        CANONICAL_CAPABILITY_BINDINGS.map((binding) => [binding.canonical_capability_id, binding]),
      )
      const discoverableCapabilityRegistry = (capabilityRegistry ?? []).map((capability: any) => {
        const binding = capabilityBindingsById.get(capability.id)
        return {
          ...capability,
          authoring_surfaces: binding?.surfaces ?? [],
          authoring_requires: binding?.requires ?? [],
        }
      })

      const { data: candidateCapabilities, error: candidateCapabilitiesError } = await supabase
        .from('candidate_capabilities')
        .select('request_id, capability_key, capability_domain, capability_name, canonical_definition, target_artifact, target_runtime_domain, authoring_surfaces, availability, request_status, request_created_at, request_updated_at, generalization_revision, generalized_at')
        .eq('availability', 'candidate_unavailable')
        .order('request_updated_at', { ascending: false })
      if (candidateCapabilitiesError) {
        return toolError('Could not read candidate Virtual Lab capabilities.', candidateCapabilitiesError.message)
      }

      const { data: candidateContractDeltas, error: candidateContractDeltasError } = await supabase
        .from('candidate_contract_deltas')
        .select('request_id, request_class, delta_key, delta_name, target_contract_path, requested_change, availability, request_status, request_created_at, request_updated_at, generalization_revision, generalized_at')
        .eq('availability', 'candidate_unavailable')
        .order('request_updated_at', { ascending: false })
      if (candidateContractDeltasError) {
        return toolError('Could not read candidate Virtual Lab contract deltas.', candidateContractDeltasError.message)
      }

      const neutralLabKnowledge = {
        identity,
        authoring,
        capability_registry: discoverableCapabilityRegistry,
        candidate_capabilities: candidateCapabilities ?? [],
        candidate_contract_deltas: candidateContractDeltas ?? [],
      }

      if (!include_workspace_index) return toolResult(neutralLabKnowledge)

      const { data: collections, error: collectionsError } = await supabase
        .from('experiment_collections')
        .select('id, name, created_at, updated_at')
        .order('name')
      if (collectionsError) return toolError('Could not list collections.', collectionsError.message)

      let query = supabase
        .from('experiments')
        .select(
          'id, owner_id, collection_id, title, lifecycle, visibility, revision, schema_version, interface_version, created_at, updated_at',
        )
        .order('updated_at', { ascending: false })

      if (owned_only) query = query.eq('owner_id', userId)
      if (lifecycle !== 'all') query = query.eq('lifecycle', lifecycle)

      const { data: experiments, error: experimentsError } = await query
      if (experimentsError) return toolError('Could not list experiments.', experimentsError.message)

      return toolResult({
        ...neutralLabKnowledge,
        workspace_index: {
          collections,
          experiments,
        },
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
        'Create a brand-new owned experiment from the complete ordered typed artifacts array. Read the current authoring contract first and supply all four compulsory core artifacts explicitly: Configuration, Initialization, Controller, and Metrics. Metrics may be empty. The canonical artifacts array is validated before writing. Use author_metrics_results afterward to add/amend individual metrics and Results panels without rewriting unrelated artifacts. If validation establishes a genuine unsupported scientific/product requirement, continue through request_capability so the blocked Experiment and closure analysis are preserved instead of changing the requested science.',
      inputSchema: {
        title: z.string().min(1).max(300),
        description: z.string().default(''),
        collection_id: z.string().uuid().nullable().optional(),
        artifacts: z.array(ARTIFACT_INPUT).min(4),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    async ({ title, description, collection_id, artifacts }) => {
      const validation = validateExperimentArtifacts(artifacts)
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
          artifacts,
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
        'Modify an owned experiment using optimistic concurrency. Always use the latest base_revision from read_workspace. To change scientific source wholesale, pass the complete canonical artifacts array with all four compulsory core artifacts. Prefer author_metrics_results for individual metric and Results-panel changes. A stale revision is rejected. If validation establishes a genuine unsupported scientific/product requirement, continue through request_capability and preserve the blocked Experiment rather than substituting different semantics.',
      inputSchema: {
        experiment_id: z.string().uuid(),
        base_revision: z.number().int().positive(),
        title: z.string().min(1).max(300).optional(),
        description: z.string().optional(),
        artifacts: z.array(ARTIFACT_INPUT).min(4).optional(),
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
      collection_id,
      lifecycle,
    }) => {
      let validation: ReturnType<typeof validateExperimentArtifacts> | null = null
      if (artifacts !== undefined) {
        validation = validateExperimentArtifacts(artifacts)
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
      if (artifacts !== undefined) patch.artifacts = artifacts
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
      title: 'Preserve and route unsupported Virtual Lab science through durable closure',
      description:
        'Student/Professor research-AI continuation when the intended scientific task requires support outside the current Lab contract. When the Lab already represents the required semantics exactly, author normally. Otherwise preserve the whole intended Experiment and closure analysis. Compare each clear unsupported requirement against implemented support plus candidate_capabilities and candidate_contract_deltas. If a candidate covers the need, reuse its request_id and attach evidence. If it is related but too narrow or ambiguous, reuse it with relationship=generalization_needed and explain why; this creates no new Professor-facing request. Only a genuinely absent need creates one new structured candidate: semantic_capability carries a complete candidate capability including its concrete authoring surfaces, while the other five classes carry a candidate contract delta against a precise stable-contract path. Candidates remain unavailable to validation until implementation. The task remains blocked on durable closure state until whole-Experiment revalidation finds no unsupported requirement or unresolved ambiguity. Submission grants no development authority.',
      inputSchema: {
        blocked_experiment_id: z.string().uuid().optional(),
        origin_experiment_id: z.string().uuid().optional(),
        origin_revision: z.number().int().positive().optional(),
        draft_title: z.string().min(1).max(300).optional(),
        draft_description: z.string().max(20000).optional(),
        draft_artifacts: z.array(ARTIFACT_INPUT).optional(),
        source_context: z.string().max(40000).default(''),
        publication: z.object({
          identifier: z.string().min(1).max(500),
          title: z.string().min(1).max(2000),
        }),
        analysis_status: z.enum(['best_effort_complete', 'partial_due_to_ambiguity']),
        identified_requirements: z.array(CLOSURE_REQUIREMENT_INPUT).min(1).max(100),
        unresolved_ambiguities: z.array(CLOSURE_AMBIGUITY_INPUT).max(100).default([]),
        requests: z.array(GROUPED_EXTENSION_REQUEST_INPUT).max(50).default([]),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    async ({
      blocked_experiment_id,
      origin_experiment_id,
      origin_revision,
      draft_title,
      draft_description,
      draft_artifacts,
      source_context,
      publication,
      analysis_status,
      identified_requirements,
      unresolved_ambiguities,
      requests,
    }) => {
      if (origin_revision !== undefined && origin_experiment_id === undefined) {
        return toolError('origin_revision requires origin_experiment_id.')
      }

      if (
        blocked_experiment_id === undefined
        && origin_experiment_id === undefined
        && draft_artifacts === undefined
        && !(draft_description?.trim())
        && !(source_context?.trim())
      ) {
        return toolError(
          'A title alone is not enough. Preserve the blocked Experiment artifacts, scientific description, or source/research context.',
        )
      }

      const { data, error } = await supabase.rpc('submit_structured_extension_closure', {
        p_blocked_experiment_id: blocked_experiment_id ?? null,
        p_origin_experiment_id: origin_experiment_id ?? null,
        p_origin_experiment_revision: origin_revision ?? null,
        p_draft_title: draft_title ?? null,
        p_draft_description: draft_description ?? null,
        p_draft_artifacts: draft_artifacts ?? null,
        p_source_context: source_context,
        p_publication_identifier: publication.identifier,
        p_publication_title: publication.title,
        p_contract_version: AUTHORING_CONTRACT.contract_version,
        p_analysis_status: analysis_status,
        p_identified_requirements: identified_requirements,
        p_unresolved_ambiguities: unresolved_ambiguities,
        p_requests: requests,
      })

      if (error) return toolError('Could not submit the blocked Experiment extension analysis.', error.message)

      return toolResult({
        capability_request_interface: CAPABILITY_REQUEST_INTERFACE,
        request_classes: EXTENSION_REQUEST_CLASSES,
        submitter_role: profile.role,
        triage_authority: 'professor',
        implementation_authority: 'owner_explicit_only',
        task_status: 'blocked',
        resume_with: 'resume_capability_closure',
        revalidate_with: 'revalidate_capability_closure',
        submission: data,
      })
    },
  )

  server.registerTool(
    'resume_capability_closure',
    {
      title: 'Resume a durable blocked Experiment capability closure',
      description:
        'Student/Professor research-AI action. Reopen one visible durable blocked Experiment without relying on chat history. A Student resumes their own blocked Experiment; a Professor may also resume a visible blocked Experiment for supervision. Return the preserved publication identity, scientific draft/context, complete ordered closure-analysis history, and linked structured candidate capability/contract-delta requests with lifecycle and evidence. Use this before whole-Experiment revalidation.',
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
      if (!blockedExperiment) return toolError('Blocked Experiment was not found or is not visible to this user.')

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
        const { data: evidence, error: evidenceError } = await supabase
          .from('capability_request_evidence')
          .select('request_id, closure_analysis_id, requirement_keys, relationship, generalization_note, created_at')
          .in('closure_analysis_id', analysisIds)
          .order('created_at', { ascending: true })
        if (evidenceError) return toolError('Could not read linked capability-request evidence.', evidenceError.message)

        const requestIds = [...new Set((evidence ?? []).map((link: { request_id: string }) => link.request_id))]
        if (requestIds.length > 0) {
          const { data: requests, error: requestsError } = await supabase
            .from('capability_requests')
            .select('*')
            .in('id', requestIds)
            .order('created_at', { ascending: true })
          if (requestsError) return toolError('Could not read linked capability requests.', requestsError.message)

          const { data: candidateCapabilities, error: candidateCapabilitiesError } = await supabase
            .from('candidate_capabilities')
            .select('*')
            .in('request_id', requestIds)
          if (candidateCapabilitiesError) {
            return toolError('Could not read linked candidate capabilities.', candidateCapabilitiesError.message)
          }

          const { data: candidateContractDeltas, error: candidateContractDeltasError } = await supabase
            .from('candidate_contract_deltas')
            .select('*')
            .in('request_id', requestIds)
          if (candidateContractDeltasError) {
            return toolError('Could not read linked candidate contract deltas.', candidateContractDeltasError.message)
          }

          linkedRequests = buildClosureLinkedRequests(
            evidence ?? [], requests ?? [], candidateCapabilities ?? [], candidateContractDeltas ?? [],
          )
        }
      }

      return toolResult({
        capability_request_interface: CAPABILITY_REQUEST_INTERFACE,
        resumed_by_role: profile.role,
        task_status: blockedExperiment.lifecycle,
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
        'Student/Professor research-AI action. Re-analyse the entire preserved Experiment against implemented capabilities, candidate_capabilities, candidate_contract_deltas, and the stable Lab contract. A Student revalidates their own blocked Experiment; a Professor may also supervise a visible blocked Experiment. Reuse a covering candidate, record generalization_needed evidence on a related-but-too-narrow candidate, and create a structured candidate only for a genuinely absent need. Candidate presence never makes validation pass. Use analysis_status=unblocked only when no unsupported requirements and no unresolved scientific ambiguity remain.',
      inputSchema: {
        blocked_experiment_id: z.string().uuid(),
        base_analysis_sequence: z.number().int().positive(),
        analysis_status: z.enum(['best_effort_complete', 'partial_due_to_ambiguity', 'unblocked']),
        identified_requirements: z.array(CLOSURE_REQUIREMENT_INPUT).max(100).default([]),
        unresolved_ambiguities: z.array(CLOSURE_AMBIGUITY_INPUT).max(100).default([]),
        requests: z.array(GROUPED_EXTENSION_REQUEST_INPUT).max(50).default([]),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    async ({
      blocked_experiment_id,
      base_analysis_sequence,
      analysis_status,
      identified_requirements,
      unresolved_ambiguities,
      requests,
    }) => {
      if (
        analysis_status === 'unblocked'
        && (identified_requirements.length > 0 || unresolved_ambiguities.length > 0 || requests.length > 0)
      ) {
        return toolError('Unblocked requires zero unsupported requirements, zero ambiguity, and zero new requests.')
      }
      if (analysis_status === 'best_effort_complete' && identified_requirements.length === 0) {
        return toolError('best_effort_complete revalidation must retain at least one unsupported requirement.')
      }
      if (analysis_status === 'partial_due_to_ambiguity' && unresolved_ambiguities.length === 0) {
        return toolError('partial_due_to_ambiguity requires unresolved scientific ambiguity.')
      }

      const { data, error } = await supabase.rpc('revalidate_structured_extension_closure', {
        p_blocked_experiment_id: blocked_experiment_id,
        p_base_analysis_sequence: base_analysis_sequence,
        p_contract_version: AUTHORING_CONTRACT.contract_version,
        p_analysis_status: analysis_status,
        p_identified_requirements: identified_requirements,
        p_unresolved_ambiguities: unresolved_ambiguities,
        p_requests: requests,
      })

      if (error) return toolError('Could not revalidate the blocked Experiment extension closure.', error.message)

      return toolResult({
        capability_request_interface: CAPABILITY_REQUEST_INTERFACE,
        revalidated_by_role: profile.role,
        whole_experiment_revalidation: true,
        task_status: data?.blocked_experiment?.lifecycle ?? analysis_status,
        revalidation: data,
      })
    },
  )
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
      tools: MCP_TOOL_NAMES,
      tool_count: MCP_TOOL_COUNT,
      shared_tool_count: MCP_TOOL_COUNT,
      student_tool_count: MCP_TOOL_COUNT,
      professor_tool_count: MCP_TOOL_COUNT,
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
