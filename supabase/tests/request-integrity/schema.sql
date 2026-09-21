-- EMPTY disposable PostgreSQL database only. Minimal relational fixture, not a Supabase deployment.

\set ON_ERROR_STOP on
create role anon;
create role authenticated;
create schema auth;
create schema private;
create function auth.uid() returns uuid language sql as $$ select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid $$;
create table public.profiles(id uuid primary key, role text);
insert into public.profiles values (auth.uid(),'student');
create table public.experiments(id uuid primary key, revision bigint, title text, description text, artifacts jsonb);
create table public.canonical_capabilities(id uuid primary key, capability_key text);
create table public.blocked_experiment_drafts(
 id uuid primary key default gen_random_uuid(), requester_id uuid,requester_role text,
 origin_experiment_id uuid,origin_experiment_revision bigint,title text,description text,
 artifacts jsonb,source_context text,publication_identifier text,publication_title text,
 lifecycle text default 'blocked',created_at timestamptz default now()
);
create table public.capability_closure_analyses(
 id uuid primary key default gen_random_uuid(),blocked_experiment_id uuid,analyst_id uuid,
 analysis_sequence bigint,contract_version text,analysis_status text,identified_requirements jsonb,
 unresolved_ambiguities jsonb,created_at timestamptz default now(),unique(blocked_experiment_id,analysis_sequence)
);
create table public.capability_requests(
 id uuid primary key default gen_random_uuid(),requester_id uuid,requester_role text,
 origin_experiment_id uuid,origin_experiment_revision bigint,draft_title text,draft_description text,draft_artifacts jsonb,
 capability_domain text,capability_name text,context text,requested_artifact_type text,requested_lifecycle_hook text,status text,
 closure_analysis_id uuid,requirement_keys jsonb,request_class text,extension_key text,extension_domain text,extension_name text,
 extension_definition text,novelty_statement text,canonical_capability_id uuid,publication_identifier text,publication_title text,
 created_at timestamptz default now(),updated_at timestamptz default now(),implemented_at timestamptz
);
create table public.active_extension_request_catalog(
 request_id uuid primary key,request_class text,extension_key text,extension_domain text,
 extension_name text,extension_definition text,status text,updated_at timestamptz
);
create table public.capability_request_evidence(
 request_id uuid references public.capability_requests(id),closure_analysis_id uuid,linked_by uuid,requirement_keys jsonb,
 created_at timestamptz default now(),primary key(request_id,closure_analysis_id)
);
