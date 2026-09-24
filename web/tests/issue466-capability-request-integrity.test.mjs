import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { dockerSkipReason } from "./support/docker.mjs";

const migrationPath = new URL(
  "../../supabase/migrations/20260921170000_capability_request_integrity.sql",
  import.meta.url,
);
const migration = readFileSync(migrationPath, "utf8");

test("#466 capability-request evidence is complete, retained safely, and lossless", async (t) => {
  // Keep this ticket bounded: it must not replace the closure RPCs whose
  // revision/readback behavior belongs to later tickets.
  assert.doesNotMatch(migration, /create or replace function public\.submit_extension_closure/i);
  assert.doesNotMatch(migration, /create or replace function public\.revalidate_extension_closure/i);
  assert.match(migration, /create constraint trigger enforce_extension_requirement_coverage/i);
  assert.match(migration, /deferrable initially deferred/i);

  const skipReason = dockerSkipReason();
  if (skipReason) {
    t.skip(skipReason);
    return;
  }

  const container = `vlab-issue466-${process.pid}-${Date.now()}`;
  let started = false;

  const docker = (args, options = {}) =>
    spawnSync("docker", args, {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      ...options,
    });

  const sql = (source, { expectFailure = false } = {}) => {
    const result = docker(
      ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-At"],
      { input: source },
    );
    if (expectFailure) {
      assert.notEqual(result.status, 0, "SQL was expected to fail");
      return `${result.stdout}\n${result.stderr}`;
    }
    assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
    return result.stdout.trim();
  };

  try {
    const start = docker([
      "run",
      "--detach",
      "--rm",
      "--name",
      container,
      "--network",
      "none",
      "--env",
      "POSTGRES_HOST_AUTH_METHOD=trust",
      "postgres:15-alpine",
    ]);
    assert.equal(start.status, 0, start.error?.message || start.stderr || start.stdout);
    started = true;

    let ready = false;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const probe = docker([
        "exec",
        container,
        "pg_isready",
        "-h",
        "127.0.0.1",
        "-U",
        "postgres",
      ]);
      if (probe.status === 0) {
        ready = true;
        break;
      }
      await delay(250);
    }
    assert.ok(ready, "Disposable PostgreSQL did not become ready");

    sql(`
      create role anon nologin;
      create role authenticated nologin;
      create schema private;

      create table public.blocked_experiment_drafts (
        id uuid primary key
      );
      create table public.capability_closure_analyses (
        id uuid primary key,
        blocked_experiment_id uuid not null references public.blocked_experiment_drafts(id),
        identified_requirements jsonb not null
      );
      create table public.capability_requests (
        id uuid primary key
      );
      create table public.active_extension_request_catalog (
        request_id uuid primary key references public.capability_requests(id)
      );
      create table public.capability_request_evidence (
        request_id uuid not null references public.capability_requests(id),
        closure_analysis_id uuid not null references public.capability_closure_analyses(id),
        requirement_keys jsonb not null,
        primary key (request_id, closure_analysis_id)
      );
    `);

    sql(migration);

    assert.equal(
      sql(`
        select tgdeferrable::text || ':' || tginitdeferred::text
        from pg_trigger
        where tgname = 'enforce_extension_requirement_coverage';
      `),
      "true:true",
    );

    const blocked = "11111111-1111-4111-8111-111111111111";
    const request = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    sql(`
      insert into public.blocked_experiment_drafts values ('${blocked}');
      insert into public.capability_requests values ('${request}');
      insert into public.active_extension_request_catalog values ('${request}');
    `);

    const requirements = JSON.stringify([
      { key: "a", summary: "Need A", evidence: "A unsupported", resolution_status: "clear" },
      { key: "b", summary: "Need B", evidence: "B unsupported", resolution_status: "clear" },
    ]).replaceAll("'", "''");

    const partialFailure = sql(
      `
        begin;
        insert into public.capability_closure_analyses
          (id, blocked_experiment_id, identified_requirements)
        values
          ('20000000-0000-4000-8000-000000000001', '${blocked}', '${requirements}'::jsonb);
        insert into public.capability_request_evidence
          (request_id, closure_analysis_id, requirement_keys)
        values
          ('${request}', '20000000-0000-4000-8000-000000000001', '["a"]'::jsonb);
        commit;
      `,
      { expectFailure: true },
    );
    assert.match(partialFailure, /Unrequested clear requirements: b\./);
    assert.equal(
      sql(`select count(*) from public.capability_closure_analyses where id='20000000-0000-4000-8000-000000000001';`),
      "0",
      "failed coverage must roll back the analysis",
    );

    // One grouped evidence link may legitimately account for multiple requirements.
    sql(`
      begin;
      insert into public.capability_closure_analyses
        (id, blocked_experiment_id, identified_requirements)
      values
        ('20000000-0000-4000-8000-000000000002', '${blocked}', '${requirements}'::jsonb);
      insert into public.capability_request_evidence
        (request_id, closure_analysis_id, requirement_keys)
      values
        ('${request}', '20000000-0000-4000-8000-000000000002', '["a","b"]'::jsonb);
      commit;
    `);

    // An unchanged requirement can inherit a valid link from the same blocked Experiment.
    sql(`
      begin;
      insert into public.capability_closure_analyses
        (id, blocked_experiment_id, identified_requirements)
      values
        ('20000000-0000-4000-8000-000000000003', '${blocked}', '${requirements}'::jsonb);
      commit;
    `);

    const changed = JSON.stringify([
      { key: "a", summary: "Different scientific need", evidence: "Still unsupported", resolution_status: "clear" },
    ]).replaceAll("'", "''");
    const changedFailure = sql(
      `
        begin;
        insert into public.capability_closure_analyses
          (id, blocked_experiment_id, identified_requirements)
        values
          ('20000000-0000-4000-8000-000000000004', '${blocked}', '${changed}'::jsonb);
        commit;
      `,
      { expectFailure: true },
    );
    assert.match(changedFailure, /Unrequested clear requirements: a\./);

    const fresh = JSON.stringify([
      { key: "new", summary: "New gap", evidence: "New unsupported behavior", resolution_status: "clear" },
    ]).replaceAll("'", "''");
    const freshFailure = sql(
      `
        begin;
        insert into public.capability_closure_analyses
          (id, blocked_experiment_id, identified_requirements)
        values
          ('20000000-0000-4000-8000-000000000005', '${blocked}', '${fresh}'::jsonb);
        commit;
      `,
      { expectFailure: true },
    );
    assert.match(freshFailure, /Unrequested clear requirements: new\./);

    // Ambiguity alone must never manufacture a request.
    const ambiguous = JSON.stringify([
      { key: "unknown", summary: "Unknown behavior", evidence: "Needs clarification", resolution_status: "ambiguous" },
    ]).replaceAll("'", "''");
    sql(`
      begin;
      insert into public.capability_closure_analyses
        (id, blocked_experiment_id, identified_requirements)
      values
        ('20000000-0000-4000-8000-000000000006', '${blocked}', '${ambiguous}'::jsonb);
      commit;
    `);

    const repeated = JSON.stringify([
      {
        existing_request_id: request,
        requirement_keys: ["a"],
        relationship: "generalization_needed",
        generalization_note: "Broaden A",
      },
      {
        existing_request_id: request.toUpperCase(),
        requirement_keys: ["b"],
        relationship: "covered",
      },
    ]).replaceAll("'", "''");
    const repeatedFailure = sql(
      `select private.legacy_extension_requests_from_candidates('${repeated}'::jsonb);`,
      { expectFailure: true },
    );
    assert.match(repeatedFailure, /Each existing_request_id may appear only once\./);

    const grouped = JSON.stringify([
      {
        existing_request_id: request,
        requirement_keys: ["a", "b"],
        relationship: "generalization_needed",
        generalization_note: "Broaden A; B already covered",
      },
    ]).replaceAll("'", "''");
    assert.equal(
      sql(`
        select
          jsonb_array_length(private.legacy_extension_requests_from_candidates('${grouped}'::jsonb))::text
          || ':'
          || jsonb_array_length(
            private.legacy_extension_requests_from_candidates('${grouped}'::jsonb)->0->'requirement_keys'
          )::text;
      `),
      "1:2",
    );
  } finally {
    if (started) {
      docker(["rm", "--force", container]);
    }
  }
});
