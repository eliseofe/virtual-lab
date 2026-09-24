import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { dockerSkipReason } from "./support/docker.mjs";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260921173000_blocked_experiment_revision_snapshots.sql", import.meta.url),
  "utf8",
);

test("#465 blocked Experiment snapshots are revision-exact and immutable", async (t) => {
  assert.match(migration, /origin_experiment_revision = v_origin\.revision/);
  assert.match(migration, /Blocked Experiment origin revision conflict/);
  assert.match(migration, /v_draft\.origin_experiment_id/);
  assert.match(migration, /v_draft\.origin_experiment_revision/);
  assert.doesNotMatch(migration, /create or replace function public\.revalidate_extension_closure/i);

  const skipReason = dockerSkipReason();
  if (skipReason) {
    t.skip(skipReason);
    return;
  }

  const container = `vlab-issue465-${process.pid}-${Date.now()}`;
  let started = false;

  const docker = (args, options = {}) =>
    spawnSync("docker", args, {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      ...options,
    });

  const sql = (source) => {
    const result = docker(
      ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-At"],
      { input: source },
    );
    assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
    return result.stdout.trim();
  };

  try {
    const start = docker([
      "run", "--detach", "--rm", "--name", container, "--network", "none",
      "--env", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:15-alpine",
    ]);
    assert.equal(start.status, 0, start.error?.message || start.stderr || start.stdout);
    started = true;

    let ready = false;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (docker(["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]).status === 0) {
        ready = true;
        break;
      }
      await delay(250);
    }
    assert.ok(ready, "Disposable PostgreSQL did not become ready");

    sql(`
      create extension if not exists pgcrypto;
      create schema auth;
      create schema private;

      create or replace function auth.uid()
      returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

      create table public.profiles (
        id uuid primary key,
        role text not null
      );

      create table public.experiments (
        id uuid primary key,
        revision bigint not null,
        title text not null,
        description text not null default '',
        artifacts jsonb not null default '[]'::jsonb
      );

      create table public.blocked_experiment_drafts (
        id uuid primary key default gen_random_uuid(),
        requester_id uuid not null,
        requester_role text not null,
        origin_experiment_id uuid,
        origin_experiment_revision bigint,
        title text not null,
        description text not null default '',
        artifacts jsonb not null default '[]'::jsonb,
        source_context text not null default '',
        publication_identifier text not null,
        publication_title text not null,
        lifecycle text not null default 'blocked',
        created_at timestamptz not null default now()
      );

      create table public.capability_closure_analyses (
        id uuid primary key default gen_random_uuid(),
        blocked_experiment_id uuid not null,
        analyst_id uuid not null,
        analysis_sequence bigint not null,
        contract_version text not null,
        analysis_status text not null,
        identified_requirements jsonb not null,
        unresolved_ambiguities jsonb not null,
        created_at timestamptz not null default now()
      );

      create table public.capability_requests (
        id uuid primary key default gen_random_uuid(),
        requester_id uuid,
        requester_role text,
        origin_experiment_id uuid,
        origin_experiment_revision bigint,
        draft_title text,
        draft_description text,
        draft_artifacts jsonb,
        capability_domain text,
        capability_name text,
        context text,
        requested_artifact_type text,
        requested_lifecycle_hook text,
        status text,
        closure_analysis_id uuid,
        requirement_keys jsonb,
        request_class text,
        extension_key text,
        extension_domain text,
        extension_name text,
        extension_definition text,
        novelty_statement text,
        canonical_capability_id uuid,
        publication_identifier text,
        publication_title text,
        created_at timestamptz default now()
      );

      create table public.active_extension_request_catalog (
        request_id uuid primary key,
        request_class text,
        extension_key text,
        extension_domain text,
        extension_name text,
        extension_definition text,
        status text,
        updated_at timestamptz default now()
      );

      create table public.canonical_capabilities (
        id uuid primary key default gen_random_uuid(),
        capability_key text unique not null
      );

      create table public.capability_request_evidence (
        request_id uuid not null,
        closure_analysis_id uuid not null,
        linked_by uuid not null,
        requirement_keys jsonb not null,
        primary key (request_id, closure_analysis_id)
      );
    `);

    sql(migration);

    const user = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const origin = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

    const result = sql(`
      select set_config('request.jwt.claim.sub', '${user}', false);
      insert into public.profiles values ('${user}', 'student');
      insert into public.experiments
        (id, revision, title, description, artifacts)
      values
        ('${origin}', 1, 'Revision fixture', 'Fixture', '[{"path":"main","content":"revision one"}]'::jsonb);

      do $$
      declare
        v_requirements jsonb :=
          '[{"key":"unknown","summary":"Unknown","evidence":"Needs clarification","resolution_status":"ambiguous"}]'::jsonb;
        v_ambiguities jsonb :=
          '[{"key":"question","requirement_key":"unknown","question":"Which behavior?"}]'::jsonb;
        v_first jsonb;
        v_same jsonb;
        v_second jsonb;
        v_draft1 uuid;
        v_draft2 uuid;
        v_analysis_count bigint;
        v_request jsonb;
        v_request_id uuid;
      begin
        v_first := public.submit_extension_closure(
          p_origin_experiment_id => '${origin}',
          p_origin_experiment_revision => 1,
          p_publication_identifier => 'test:revision',
          p_publication_title => 'Fixture',
          p_contract_version => 'test/1',
          p_analysis_status => 'partial_due_to_ambiguity',
          p_identified_requirements => v_requirements,
          p_unresolved_ambiguities => v_ambiguities
        );
        v_draft1 := (v_first->'blocked_experiment'->>'id')::uuid;

        v_same := public.submit_extension_closure(
          p_origin_experiment_id => '${origin}',
          p_origin_experiment_revision => 1,
          p_publication_identifier => 'test:revision',
          p_publication_title => 'Fixture',
          p_contract_version => 'test/1',
          p_analysis_status => 'partial_due_to_ambiguity',
          p_identified_requirements => v_requirements,
          p_unresolved_ambiguities => v_ambiguities
        );
        if (v_same->'blocked_experiment'->>'id')::uuid <> v_draft1
           or coalesce((v_same->>'reused_blocked_experiment')::boolean, false) is not true then
          raise exception 'same revision must reuse the same blocked snapshot';
        end if;

        update public.experiments
        set revision = 2,
            artifacts = '[{"path":"main","content":"revision two"}]'::jsonb
        where id = '${origin}';

        select count(*) into v_analysis_count from public.capability_closure_analyses;
        begin
          perform public.submit_extension_closure(
            p_blocked_experiment_id => v_draft1,
            p_origin_experiment_id => '${origin}',
            p_origin_experiment_revision => 2,
            p_publication_identifier => 'test:revision',
            p_publication_title => 'Fixture',
            p_contract_version => 'test/1',
            p_analysis_status => 'partial_due_to_ambiguity',
            p_identified_requirements => v_requirements,
            p_unresolved_ambiguities => v_ambiguities
          );
          raise exception 'stale explicit blocked snapshot unexpectedly accepted';
        exception
          when sqlstate '22023' then
            null;
        end;
        if (select count(*) from public.capability_closure_analyses) <> v_analysis_count then
          raise exception 'stale explicit reuse must be atomic';
        end if;

        v_second := public.submit_extension_closure(
          p_origin_experiment_id => '${origin}',
          p_origin_experiment_revision => 2,
          p_publication_identifier => 'test:revision',
          p_publication_title => 'Fixture',
          p_contract_version => 'test/1',
          p_analysis_status => 'partial_due_to_ambiguity',
          p_identified_requirements => v_requirements,
          p_unresolved_ambiguities => v_ambiguities
        );
        v_draft2 := (v_second->'blocked_experiment'->>'id')::uuid;
        if v_draft2 = v_draft1 then
          raise exception 'new origin revision must get a new blocked snapshot';
        end if;
        if not exists (
          select 1 from public.blocked_experiment_drafts
          where id = v_draft2
            and origin_experiment_revision = 2
            and artifacts = '[{"path":"main","content":"revision two"}]'::jsonb
        ) then
          raise exception 'revision two snapshot is not preserved exactly';
        end if;

        v_request := public.submit_extension_closure(
          p_blocked_experiment_id => v_draft1,
          p_publication_identifier => 'test:revision',
          p_publication_title => 'Fixture',
          p_contract_version => 'test/1',
          p_analysis_status => 'best_effort_complete',
          p_identified_requirements =>
            '[{"key":"a","summary":"Need A","evidence":"A unsupported","resolution_status":"clear"}]'::jsonb,
          p_requests =>
            '[{"request_class":"runtime_configuration","requirement_keys":["a"],"extension_key":"test.snapshot","extension_domain":"runtime","extension_name":"Snapshot test","extension_definition":"Fixture request","novelty_statement":"Fixture only"}]'::jsonb
        );
        v_request_id := (v_request->'requests'->0->>'id')::uuid;

        if not exists (
          select 1 from public.capability_requests
          where id = v_request_id
            and origin_experiment_id = '${origin}'
            and origin_experiment_revision = 1
            and draft_artifacts = '[{"path":"main","content":"revision one"}]'::jsonb
        ) then
          raise exception 'blocked-ID-only continuation lost immutable snapshot origin';
        end if;
      end;
      $$;

      select
        (select count(*) from public.blocked_experiment_drafts)::text
        || ':'
        || (select count(*) from public.capability_requests)::text;
    `);

    assert.equal(result.split("\n").at(-1), "2:1");
  } finally {
    if (started) docker(["rm", "--force", container]);
  }
});
