import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import { McpServer } from 'npm:@modelcontextprotocol/sdk@1.25.3/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from 'npm:@modelcontextprotocol/sdk@1.25.3/server/webStandardStreamableHttp.js'
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.57.4'
import { z } from 'npm:zod@4.1.13'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const publishableKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}')
const SUPABASE_PUBLISHABLE_KEY = publishableKeys.default ?? Deno.env.get('SUPABASE_ANON_KEY')!
const MCP_RESOURCE = `${SUPABASE_URL}/functions/v1/experiment-mcp`
const RESOURCE_METADATA_URL = `${MCP_RESOURCE}/.well-known/oauth-protected-resource`
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

function json(value: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  })
}

function unauthorized(
  description = 'A valid Supabase user access token is required.',
  error: 'invalid_token' | null = null,
) {
  const challenge = error
    ? `Bearer error="${error}", error_description="${description}", resource_metadata="${RESOURCE_METADATA_URL}", scope="email profile"`
    : `Bearer resource_metadata="${RESOURCE_METADATA_URL}", scope="email profile"`

  return json(
    { error: error ?? 'unauthorized', error_description: description },
    401,
    {
      'www-authenticate': challenge,
      'x-vlab-auth-challenge-version': '2',
    },
  )
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

function bearerToken(req: Request): string | null {
  const header = req.headers.get('authorization')
  const match = header?.match(/^Bearer\s+(.+)$/i)
  if (!match) return null
  const token = match[1].trim()
  return token.length > 0 ? token : null
}

function jwtClientId(token: string): string | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const decoded = JSON.parse(atob(padded))
    return typeof decoded.client_id === 'string' ? decoded.client_id : null
  } catch {
    return null
  }
}

async function authenticatedClient(req: Request): Promise<
  | { supabase: SupabaseClient; userId: string; email: string | null; clientId: string | null }
  | null
> {
  const token = bearerToken(req)
  if (!token) return null

  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
  })

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return null

  return {
    supabase,
    userId: data.user.id,
    email: data.user.email ?? null,
    clientId: jwtClientId(token),
  }
}

function registerExperimentTools(
  server: McpServer,
  supabase: SupabaseClient,
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
        'Start here. Without experiment_id, return the authenticated identity, owned collections, and visible experiment summaries. With experiment_id, return that visible experiment with all three editable sources and its current revision. This tool never writes.',
      inputSchema: {
        experiment_id: z.string().uuid().optional(),
        lifecycle: z.enum(['active', 'archived', 'all']).default('active'),
        owned_only: z.boolean().default(true),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ experiment_id, lifecycle, owned_only }) => {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, display_name')
        .eq('id', userId)
        .single()
      if (profileError) return toolError('Could not read the authenticated profile.', profileError.message)

      const identity = { ...profile, email, oauth_client_id: clientId }

      if (experiment_id) {
        const { data: experiment, error } = await supabase
          .from('experiments')
          .select('*')
          .eq('id', experiment_id)
          .maybeSingle()
        if (error) return toolError('Could not read experiment.', error.message)
        if (!experiment) return toolError('Experiment was not found or is not visible to this user.')
        return toolResult({ identity, experiment })
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

      return toolResult({ identity, collections, experiments })
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
      title: 'Create a new experiment',
      description:
        'Create a brand-new owned experiment from zero. Supply the exact configuration, initializer, and controller source strings. Use collection_id from read_workspace to file it, or omit collection_id to leave it unfiled.',
      inputSchema: {
        title: z.string().min(1).max(300),
        description: z.string().default(''),
        collection_id: z.string().uuid().nullable().optional(),
        config_source: z.string(),
        initializer_source: z.string(),
        controller_source: z.string(),
      },
      annotations: WRITE_ANNOTATIONS,
    },
    async ({ title, description, collection_id, config_source, initializer_source, controller_source }) => {
      const { data, error } = await supabase
        .from('experiments')
        .insert({
          owner_id: userId,
          collection_id: collection_id ?? null,
          title: title.trim(),
          description,
          config_source,
          initializer_source,
          controller_source,
          created_by_actor: 'ai',
          created_by_ai_client: aiClient,
          updated_by_actor: 'ai',
          updated_by_ai_client: aiClient,
        })
        .select('*')
        .single()
      if (error) return toolError('Could not create experiment.', error.message)
      return toolResult(data)
    },
  )

  server.registerTool(
    'edit_experiment',
    {
      title: 'Edit, move, archive, or restore an experiment',
      description:
        'Modify an owned experiment using optimistic concurrency. Always use the latest base_revision from read_workspace. Pass only fields to change. Set collection_id to another collection UUID to move it, null to unfile it. Set lifecycle=archived to archive or lifecycle=active to restore. A stale revision is rejected.',
      inputSchema: {
        experiment_id: z.string().uuid(),
        base_revision: z.number().int().positive(),
        title: z.string().min(1).max(300).optional(),
        description: z.string().optional(),
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
      config_source,
      initializer_source,
      controller_source,
      collection_id,
      lifecycle,
    }) => {
      const patch: Record<string, unknown> = {
        updated_by_actor: 'ai',
        updated_by_ai_client: aiClient,
      }

      if (title !== undefined) patch.title = title.trim()
      if (description !== undefined) patch.description = description
      if (config_source !== undefined) patch.config_source = config_source
      if (initializer_source !== undefined) patch.initializer_source = initializer_source
      if (controller_source !== undefined) patch.controller_source = controller_source
      if (collection_id !== undefined) patch.collection_id = collection_id
      if (lifecycle !== undefined) patch.lifecycle = lifecycle

      if (Object.keys(patch).length === 2) return toolError('No experiment fields were supplied to edit.')

      const { data, error } = await supabase
        .from('experiments')
        .update(patch)
        .eq('id', experiment_id)
        .eq('revision', base_revision)
        .select('*')
        .maybeSingle()

      if (error) return toolError('Could not edit experiment.', error.message)
      if (!data) {
        return toolError(
          'Conflict: the experiment is stale, missing, or not owned by this user. Re-read it with read_workspace before editing.',
        )
      }
      return toolResult(data)
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

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)

  if (url.pathname.endsWith('/.well-known/oauth-protected-resource')) {
    return json({
      resource: MCP_RESOURCE,
      authorization_servers: [AUTHORIZATION_SERVER],
      scopes_supported: ['email', 'profile'],
      bearer_methods_supported: ['header'],
    })
  }

  if (url.pathname.endsWith('/health')) {
    return json({
      ok: true,
      service: 'virtual-lab-experiment-mcp',
      interface_version: '3',
      auth_challenge_version: '2',
      tool_count: 5,
      simulator_access: false,
    })
  }

  const token = bearerToken(req)
  if (!token) return unauthorized('Authorization bearer token is missing.')

  const auth = await authenticatedClient(req)
  if (!auth) return unauthorized('The supplied access token is invalid or expired.', 'invalid_token')

  const server = new McpServer({
    name: 'virtual-lab-experiment-registry',
    version: '2.0.1',
  })
  registerExperimentTools(server, auth.supabase, auth.userId, auth.email, auth.clientId)

  const transport = new WebStandardStreamableHTTPServerTransport()
  await server.connect(transport)
  return transport.handleRequest(req)
})
