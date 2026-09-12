import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const publishableKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}')
const SUPABASE_PUBLISHABLE_KEY = publishableKeys.default ?? Deno.env.get('SUPABASE_ANON_KEY')!
const MCP_RESOURCE = `${SUPABASE_URL}/functions/v1/experiment-mcp`
const RESOURCE_METADATA_URL = `${MCP_RESOURCE}/.well-known/oauth-protected-resource`
const AUTHORIZATION_SERVER = `${SUPABASE_URL}/auth/v1`

function json(value: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function unauthorized(description = 'A valid Supabase user access token is required.') {
  return json(
    { error: 'unauthorized', error_description: description },
    401,
    {
      'www-authenticate': `Bearer resource_metadata="${RESOURCE_METADATA_URL}", scope="email profile"`,
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
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice('Bearer '.length).trim()
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
    'whoami',
    {
      title: 'Current experiment-registry identity',
      description: 'Return the authenticated registry identity. This has no simulator or GitHub capability.',
      inputSchema: {},
    },
    async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name')
        .eq('id', userId)
        .single()
      if (error) return toolError('Could not read the authenticated profile.', error.message)
      return toolResult({ ...data, email, oauth_client_id: clientId })
    },
  )

  server.registerTool(
    'list_collections',
    {
      title: 'List experiment collections',
      description: 'List collections/projects owned by the authenticated user.',
      inputSchema: {},
    },
    async () => {
      const { data, error } = await supabase
        .from('experiment_collections')
        .select('id, name, created_at, updated_at')
        .order('name')
      if (error) return toolError('Could not list collections.', error.message)
      return toolResult(data)
    },
  )

  server.registerTool(
    'create_collection',
    {
      title: 'Create experiment collection',
      description: 'Create a one-level collection/project for organizing the authenticated user’s experiments.',
      inputSchema: { name: z.string().min(1).max(200) },
    },
    async ({ name }) => {
      const { data, error } = await supabase
        .from('experiment_collections')
        .insert({ owner_id: userId, name: name.trim() })
        .select('id, name, created_at, updated_at')
        .single()
      if (error) return toolError('Could not create collection.', error.message)
      return toolResult(data)
    },
  )

  server.registerTool(
    'rename_collection',
    {
      title: 'Rename experiment collection',
      description: 'Rename a collection owned by the authenticated user.',
      inputSchema: {
        collection_id: z.string().uuid(),
        name: z.string().min(1).max(200),
      },
    },
    async ({ collection_id, name }) => {
      const { data, error } = await supabase
        .from('experiment_collections')
        .update({ name: name.trim(), updated_at: new Date().toISOString() })
        .eq('id', collection_id)
        .select('id, name, created_at, updated_at')
        .maybeSingle()
      if (error) return toolError('Could not rename collection.', error.message)
      if (!data) return toolError('Collection was not found or is not owned by this user.')
      return toolResult(data)
    },
  )

  server.registerTool(
    'delete_collection',
    {
      title: 'Delete experiment collection',
      description: 'Delete an owned collection. Experiments remain and become unfiled; experiments themselves are not deleted.',
      inputSchema: { collection_id: z.string().uuid() },
    },
    async ({ collection_id }) => {
      const { data, error } = await supabase
        .from('experiment_collections')
        .delete()
        .eq('id', collection_id)
        .select('id')
        .maybeSingle()
      if (error) return toolError('Could not delete collection.', error.message)
      if (!data) return toolError('Collection was not found or is not owned by this user.')
      return toolResult({ deleted_collection_id: data.id })
    },
  )

  server.registerTool(
    'list_experiments',
    {
      title: 'List experiments',
      description: 'List experiments visible to the authenticated user. By default returns owned active experiments.',
      inputSchema: {
        lifecycle: z.enum(['active', 'archived', 'all']).default('active'),
        collection_id: z.string().uuid().nullable().optional(),
        owned_only: z.boolean().default(true),
      },
    },
    async ({ lifecycle, collection_id, owned_only }) => {
      let query = supabase
        .from('experiments')
        .select('id, owner_id, collection_id, title, description, lifecycle, visibility, revision, schema_version, interface_version, created_at, updated_at')
        .order('updated_at', { ascending: false })
      if (owned_only) query = query.eq('owner_id', userId)
      if (lifecycle !== 'all') query = query.eq('lifecycle', lifecycle)
      if (collection_id === null) query = query.is('collection_id', null)
      else if (collection_id !== undefined) query = query.eq('collection_id', collection_id)
      const { data, error } = await query
      if (error) return toolError('Could not list experiments.', error.message)
      return toolResult(data)
    },
  )

  server.registerTool(
    'get_experiment',
    {
      title: 'Read experiment source',
      description: 'Read one visible experiment including configuration, initialization, and controller source.',
      inputSchema: { experiment_id: z.string().uuid() },
    },
    async ({ experiment_id }) => {
      const { data, error } = await supabase
        .from('experiments')
        .select('*')
        .eq('id', experiment_id)
        .maybeSingle()
      if (error) return toolError('Could not read experiment.', error.message)
      if (!data) return toolError('Experiment was not found or is not visible to this user.')
      return toolResult(data)
    },
  )

  server.registerTool(
    'create_experiment',
    {
      title: 'Create experiment',
      description: 'Create a new experiment from scratch using the three student-editable source artifacts.',
      inputSchema: {
        title: z.string().min(1).max(300),
        description: z.string().default(''),
        collection_id: z.string().uuid().nullable().optional(),
        config_source: z.string(),
        initializer_source: z.string(),
        controller_source: z.string(),
      },
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
    'update_experiment',
    {
      title: 'Update experiment source or metadata',
      description: 'Update an owned experiment using optimistic concurrency. A stale base revision is rejected.',
      inputSchema: {
        experiment_id: z.string().uuid(),
        base_revision: z.number().int().positive(),
        title: z.string().min(1).max(300).optional(),
        description: z.string().optional(),
        config_source: z.string().optional(),
        initializer_source: z.string().optional(),
        controller_source: z.string().optional(),
      },
    },
    async ({ experiment_id, base_revision, title, description, config_source, initializer_source, controller_source }) => {
      const patch: Record<string, unknown> = {
        updated_by_actor: 'ai',
        updated_by_ai_client: aiClient,
      }
      if (title !== undefined) patch.title = title.trim()
      if (description !== undefined) patch.description = description
      if (config_source !== undefined) patch.config_source = config_source
      if (initializer_source !== undefined) patch.initializer_source = initializer_source
      if (controller_source !== undefined) patch.controller_source = controller_source
      if (Object.keys(patch).length === 2) return toolError('No experiment fields were supplied to update.')

      const { data, error } = await supabase
        .from('experiments')
        .update(patch)
        .eq('id', experiment_id)
        .eq('revision', base_revision)
        .select('*')
        .maybeSingle()
      if (error) return toolError('Could not update experiment.', error.message)
      if (!data) return toolError('Conflict: the experiment is stale, missing, or not owned by this user. Re-read it before editing.')
      return toolResult(data)
    },
  )

  server.registerTool(
    'move_experiment',
    {
      title: 'Move experiment to collection',
      description: 'Move an owned experiment to another owned collection, or set collection_id to null to make it unfiled.',
      inputSchema: {
        experiment_id: z.string().uuid(),
        base_revision: z.number().int().positive(),
        collection_id: z.string().uuid().nullable(),
      },
    },
    async ({ experiment_id, base_revision, collection_id }) => {
      const { data, error } = await supabase
        .from('experiments')
        .update({
          collection_id,
          updated_by_actor: 'ai',
          updated_by_ai_client: aiClient,
        })
        .eq('id', experiment_id)
        .eq('revision', base_revision)
        .select('*')
        .maybeSingle()
      if (error) return toolError('Could not move experiment.', error.message)
      if (!data) return toolError('Conflict: the experiment is stale, missing, or not owned by this user.')
      return toolResult(data)
    },
  )

  async function setLifecycle(experimentId: string, baseRevision: number, lifecycle: 'active' | 'archived') {
    const { data, error } = await supabase
      .from('experiments')
      .update({ lifecycle, updated_by_actor: 'ai', updated_by_ai_client: aiClient })
      .eq('id', experimentId)
      .eq('revision', baseRevision)
      .select('*')
      .maybeSingle()
    if (error) return toolError(`Could not set lifecycle to ${lifecycle}.`, error.message)
    if (!data) return toolError('Conflict: the experiment is stale, missing, or not owned by this user.')
    return toolResult(data)
  }

  server.registerTool(
    'archive_experiment',
    {
      title: 'Archive experiment',
      description: 'Hide an owned experiment from the normal active list without deleting it.',
      inputSchema: {
        experiment_id: z.string().uuid(),
        base_revision: z.number().int().positive(),
      },
    },
    ({ experiment_id, base_revision }) => setLifecycle(experiment_id, base_revision, 'archived'),
  )

  server.registerTool(
    'restore_experiment',
    {
      title: 'Restore archived experiment',
      description: 'Return an owned archived experiment to the active list.',
      inputSchema: {
        experiment_id: z.string().uuid(),
        base_revision: z.number().int().positive(),
      },
    },
    ({ experiment_id, base_revision }) => setLifecycle(experiment_id, base_revision, 'active'),
  )

  server.registerTool(
    'delete_experiment',
    {
      title: 'Permanently delete working experiment',
      description: 'Permanently delete an eligible owned working experiment at the specified revision. Preserved submission/curation snapshots are independent and survive.',
      inputSchema: {
        experiment_id: z.string().uuid(),
        base_revision: z.number().int().positive(),
      },
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
      if (!data) return toolError('Conflict: the experiment is stale, missing, or not owned by this user.')
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
    return json({ ok: true, service: 'virtual-lab-experiment-mcp', simulator_access: false })
  }

  const auth = await authenticatedClient(req)
  if (!auth) return unauthorized()

  const server = new McpServer({
    name: 'virtual-lab-experiment-registry',
    version: '1.0.0',
  })
  registerExperimentTools(server, auth.supabase, auth.userId, auth.email, auth.clientId)

  const transport = new WebStandardStreamableHTTPServerTransport()
  await server.connect(transport)
  return transport.handleRequest(req)
})
