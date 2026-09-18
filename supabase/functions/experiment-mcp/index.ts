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
const CAPABILITY_REQUEST_INTERFACE = 'vlab.capability-request/1'

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
  return role === 'professor'
    ? {
        requestable: true,
        action: 'request_capability',
        capability_request_interface: CAPABILITY_REQUEST_INTERFACE,
        preserve_draft: true,
      }
    : {
        requestable: false,
        action: null,
        reason: 'student-role',
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
        'Start here. Without experiment_id, return the authenticated identity, owned collections, and all Experiment summaries visible through the caller\'s RLS permissions by default. This includes Professor-supervised student/researcher Experiments and explicitly shared Experiments when authorized. Set owned_only=true only when the caller specifically wants to narrow discovery to Experiments they own. With experiment_id, return that visible experiment, its ordered typed artifacts, and its Results presentation at the current revisions. The artifacts array is canonical. Results presentation is separate workspace state and does not change the scientific Experiment revision. Legacy config_source/initializer_source/controller_source mirrors may remain temporarily in responses for compatibility and must not be treated as a second source of truth. Before authoring or changing artifacts, set include_authoring_contract=true. This tool never writes.',
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

      return toolResult({ identity, authoring, collections, experiments })
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

  if (profile.role === 'professor') {
    server.registerTool(
      'request_capability',
      {
        title: 'Request a missing Virtual Lab experiment capability',
        description:
          'Professor-only. Use when the active Virtual Lab authoring/runtime contract lacks a capability required to express the professor\'s experiment intent. Preserve the intent/draft; do not invent a workaround or implement the simulator feature. This creates only a durable requested capability row for later Professor triage and separate developer work.',
        inputSchema: {
          capability_domain: z.string().min(1).max(200),
          capability_name: z.string().min(1).max(300),
          context: z.string().max(20000).default(''),
          origin_experiment_id: z.string().uuid().optional(),
          origin_revision: z.number().int().positive().optional(),
          draft_title: z.string().max(300).optional(),
          draft_description: z.string().max(20000).optional(),
          draft_artifacts: z.array(ARTIFACT_INPUT).optional(),
          requested_artifact_type: z.string().min(1).max(200).optional(),
          requested_lifecycle_hook: z.enum(['setup', 'initialize', 'control', 'measure', 'finalize']).optional(),
        },
        annotations: WRITE_ANNOTATIONS,
      },
      async ({
        capability_domain,
        capability_name,
        context,
        origin_experiment_id,
        origin_revision,
        draft_title,
        draft_description,
        draft_artifacts,
        requested_artifact_type,
        requested_lifecycle_hook,
      }) => {
        const domain = capability_domain.trim()
        const name = capability_name.trim()
        if (!domain || !name) return toolError('Capability domain and name must contain non-whitespace text.')
        if (origin_revision !== undefined && origin_experiment_id === undefined) {
          return toolError('origin_revision requires origin_experiment_id.')
        }

        let origin: {
          id: string
          revision: number
          title: string
          description: string
          artifacts: unknown[]
        } | null = null

        if (origin_experiment_id) {
          const { data, error } = await supabase
            .from('experiments')
            .select('id, revision, title, description, artifacts')
            .eq('id', origin_experiment_id)
            .maybeSingle()
          if (error) return toolError('Could not read the originating experiment.', error.message)
          if (!data) return toolError('Originating experiment was not found or is not visible to this user.')
          if (origin_revision !== undefined && data.revision !== origin_revision) {
            return toolError(
              `Conflict: originating experiment is at revision ${data.revision}, not requested revision ${origin_revision}. Re-read it before creating the capability request.`,
            )
          }
          origin = data
        }

        const preservedTitle = draft_title?.trim() || origin?.title || null
        const preservedDescription = draft_description ?? origin?.description ?? null
        const preservedArtifacts = draft_artifacts ?? origin?.artifacts ?? []
        if (!origin && !preservedTitle && preservedArtifacts.length === 0) {
          return toolError('Preserve either an originating experiment or draft title/artifacts with the capability request.')
        }

        const { data, error } = await supabase
          .from('capability_requests')
          .insert({
            requester_id: userId,
            requester_role: profile.role,
            origin_experiment_id: origin?.id ?? null,
            origin_experiment_revision: origin?.revision ?? null,
            draft_title: preservedTitle,
            draft_description: preservedDescription,
            draft_artifacts: preservedArtifacts,
            capability_domain: domain,
            capability_name: name,
            context,
            requested_artifact_type: requested_artifact_type?.trim() || null,
            requested_lifecycle_hook: requested_lifecycle_hook ?? null,
            status: 'requested',
          })
          .select('*')
          .single()
        if (error) return toolError('Could not create capability request.', error.message)

        return toolResult({
          capability_request_interface: CAPABILITY_REQUEST_INTERFACE,
          request: data,
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
      tool_count: 6,
      shared_tool_count: 6,
      professor_tool_count: 7,
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
