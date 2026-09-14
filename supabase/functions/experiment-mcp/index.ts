import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import { McpServer } from 'npm:@modelcontextprotocol/sdk@1.25.3/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from 'npm:@modelcontextprotocol/sdk@1.25.3/server/webStandardStreamableHttp.js'
import { pipeline } from 'npm:@supabase/middleware'
import { withOAuthProtectedResource } from 'npm:@supabase/server'
import { withRequiredClaims } from 'npm:@supabase/server/middleware/required-claims'
import { withSupabaseClient } from 'npm:@supabase/server/middleware/client'
import { z } from 'npm:zod@4.1.13'

import {
  AUTHORING_CONTRACT,
  artifactsFromLegacySources,
  mergeLegacySourcesIntoArtifacts,
  validateExperimentArtifacts,
} from './authoring.js'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const MCP_RESOURCE = `${SUPABASE_URL}/functions/v1/experiment-mcp`
const AUTHORIZATION_SERVER = `${SUPABASE_URL}/auth/v1`

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

function authoringInfo(includeContract: boolean) {
  return {
    contract_version: AUTHORING_CONTRACT.contract_version,
    experiment_interface_version: AUTHORING_CONTRACT.experiment_interface_version,
    experiment_artifact_interface: AUTHORING_CONTRACT.experiment_artifact_interface,
    validation_required_for_source_writes: true,
    invalid_write_policy: AUTHORING_CONTRACT.invalid_write_policy,
    ...(includeContract ? { contract: AUTHORING_CONTRACT } : {}),
  }
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
  userId: string,
  email: string | null,
  clientId: string | null,
) {
  const aiClient = clientId ?? 'mcp-client'

  server.registerTool(
    'read_workspace',
    {
      title: 'Read Virtual Lab experiment workspace',
      description:
        'Start here. Without experiment_id, return the authenticated identity, owned collections, and visible experiment summaries. With experiment_id, return that visible experiment and its ordered typed artifacts at the current revision. The artifacts array is canonical. Legacy config_source/initializer_source/controller_source mirrors may remain temporarily in responses for compatibility and must not be treated as a second source of truth. Before authoring or changing artifacts, set include_authoring_contract=true. This tool never writes.',
      inputSchema: {
        experiment_id: z.string().uuid().optional(),
        lifecycle: z.enum(['active', 'archived', 'all']).default('active'),
        owned_only: z.boolean().default(true),
        include_authoring_contract: z.boolean().default(false),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ experiment_id, lifecycle, owned_only, include_authoring_contract }) => {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, display_name, role')
        .eq('id', userId)
        .single()
      if (profileError) return toolError('Could not read the authenticated profile.', profileError.message)

      const identity = { ...profile, email, oauth_client_id: clientId }
      const authoring = authoringInfo(include_authoring_contract)

      if (experiment_id) {
        const { data: experiment, error } = await supabase
          .from('experiments')
          .select('*')
          .eq('id', experiment_id)
          .maybeSingle()
        if (error) return toolError('Could not read experiment.', error.message)
        if (!experiment) return toolError('Experiment was not found or is not visible to this user.')
        return toolResult({ identity, authoring, experiment })
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
        'Create a brand-new owned experiment from an ordered typed artifacts array. Read the authoring contract first and preserve each artifact id/type/format. The artifacts array is canonical and validated before writing. During the v1→v2 transition only, an older client may instead supply all three legacy source arguments; they are converted to canonical artifacts. Do not supply both forms. Use collection_id to file the experiment or omit it for Unfiled.',
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
        return toolError('Experiment artifacts are not valid for the current Virtual Lab authoring contract.', validation)
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
        'Modify an owned experiment using optimistic concurrency. Always use the latest base_revision from read_workspace. To change scientific source, pass the complete canonical artifacts array. During the transition an older client may instead pass one or more legacy source arguments; they are merged into the canonical artifacts. Do not supply both forms. Artifact changes are validated as a complete experiment before writing. Set collection_id to move/unfile, or lifecycle to archive/restore. A stale revision is rejected.',
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
          return toolError('Experiment artifacts are not valid for the current Virtual Lab authoring contract.', validation)
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
}

const authenticatedMcp = pipeline(
  [withRequiredClaims(), withSupabaseClient()],
  async (req, ctx) => {
    const claims = ctx.jwtClaims as Record<string, unknown>
    const userId = String(claims.sub)
    const email = typeof claims.email === 'string' ? claims.email : null
    const clientId = typeof claims.client_id === 'string' ? claims.client_id : null

    const server = new McpServer({
      name: 'virtual-lab-experiment-registry',
      version: '2.4.0',
    })
    registerExperimentTools(server, ctx.supabase, userId, email, clientId)

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
      interface_version: '6',
      experiment_artifact_interface: AUTHORING_CONTRACT.experiment_artifact_interface,
      auth_implementation: 'supabase-jwks-middleware',
      authoring_contract_version: AUTHORING_CONTRACT.contract_version,
      validation_mode: AUTHORING_CONTRACT.validation_mode,
      tool_count: 5,
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