// Follow the "CI and Pages deploy" run for one exact commit and report exactly
// one terminal outcome (#533). It never declares a ticket complete: only a
// green outcome for the exact candidate does, per DEVELOPMENT_WORKFLOW.md.
//
//   node web/scripts/wait-for-run.mjs <commit-sha> [--pull-request] [--timeout-minutes 35] [--appear-minutes 3]
//
// By default it follows the push run that builds, publishes and live-verifies
// the commit. With --pull-request it follows the pull-request check run instead
// (build and pre-publish verification only; a green PR run is not completion).
//
// Uses GITHUB_TOKEN or GH_TOKEN when present (polls every 15 s), otherwise the
// unauthenticated API (polls every 60 s to stay inside its rate limit).
//
// Exit codes / outcomes:
//   0 green       the run for this commit succeeded (build, deploy, live smoke)
//   1 red         the run failed; failing jobs/steps are printed for diagnosis
//   2 superseded  the run was cancelled because a newer commit's run replaced it
//   3 not-a-candidate  no run is expected: every changed file is paths-ignored
//   4 no-run      a run was expected but none appeared; start it with workflow_dispatch
//   5 timeout     the run did not finish in time; report it, do not assume either result
//   6 error       usage or API error

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repository = process.env.GITHUB_REPOSITORY ?? "eliseofe/virtual-lab";
const workflowFile = "ci-pages.yml";
const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";
const pollMs = token ? 15_000 : 60_000;
const followPullRequest = process.argv.includes("--pull-request");

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? Number(process.argv[index + 1]) : fallback;
}

function finish(code, outcome, detail) {
  console.log(`[wait-for-run] ${outcome}: ${detail}`);
  process.exit(code);
}


async function api(pathname) {
  const response = await fetch(`https://api.github.com/repos/${repository}${pathname}`, {
    headers: {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "virtual-lab-wait-for-run",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status} for ${pathname}`);
  return response.json();
}

// Push paths-ignore patterns, read from the workflow so they cannot drift.
export async function pathsIgnore() {
  const text = await readFile(path.join(here, "../../.github/workflows", workflowFile), "utf8");
  const push = text.split(/\n  pull_request:/)[0];
  const block = push.split("paths-ignore:")[1] ?? "";
  return [...block.matchAll(/^\s+-\s+'([^']+)'/gm)].map((match) => match[1]);
}

export function globToRegExp(glob) {
  const source = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\//g, "\u0000")
    .replace(/\*\*/g, "\u0001")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, "(?:.*/)?")
    .replace(/\u0001/g, ".*");
  return new RegExp(`^${source}$`);
}

// A commit with no listed files (e.g. a merge) is conservatively a candidate.
export function isCandidateChange(files, patterns) {
  return files.length === 0 || files.some((file) => !patterns.some((pattern) => pattern.test(file)));
}

async function isDeployCandidate(commitSha) {
  const commit = await api(`/commits/${commitSha}`);
  const patterns = (await pathsIgnore()).map(globToRegExp);
  const files = (commit.files ?? []).map((file) => file.filename);
  return { fullSha: commit.sha, candidate: isCandidateChange(files, patterns) };
}

async function runFor(fullSha) {
  const data = await api(`/actions/workflows/${workflowFile}/runs?head_sha=${fullSha}&per_page=20`);
  const runs = (data.workflow_runs ?? []).filter((run) => (run.event === "pull_request") === followPullRequest);
  runs.sort((a, b) => b.run_attempt - a.run_attempt || Date.parse(b.created_at) - Date.parse(a.created_at));
  return runs[0] ?? null;
}

async function failureSummary(run) {
  const data = await api(`/actions/runs/${run.id}/jobs?per_page=50`);
  const failed = (data.jobs ?? []).filter((job) => job.conclusion === "failure");
  return failed.map((job) => {
    const step = (job.steps ?? []).find((candidate) => candidate.conclusion === "failure");
    return `${job.name}${step ? ` → ${step.name}` : ""}`;
  }).join("; ") || run.conclusion;
}

async function newerRunExists(run) {
  const data = await api(`/actions/workflows/${workflowFile}/runs?branch=${encodeURIComponent(run.head_branch)}&event=push&per_page=10`);
  return (data.workflow_runs ?? []).some((other) => Date.parse(other.created_at) > Date.parse(run.created_at));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const sha = process.argv[2];
  if (!sha || !/^[0-9a-f]{7,40}$/i.test(sha)) finish(6, "error", "usage: wait-for-run.mjs <commit-sha>");
  const timeoutMs = option("timeout-minutes", 35) * 60_000;
  const appearMs = option("appear-minutes", 3) * 60_000;

  const { fullSha, candidate } = await isDeployCandidate(sha);
  if (!candidate && !followPullRequest) {
    finish(3, "not-a-candidate", `${fullSha.slice(0, 12)} only changes paths-ignored files (documentation); no run is expected and nothing is deployed`);
  }
  const started = Date.now();
  let lastStatus = "";
  for (;;) {
    const run = await runFor(fullSha);
    const elapsed = Date.now() - started;
    if (!run) {
      if (elapsed > appearMs) {
        finish(4, "no-run", `no run appeared for ${fullSha.slice(0, 12)} within ${appearMs / 60_000} min; start one with workflow_dispatch on this commit's branch`);
      }
    } else if (run.status === "completed") {
      if (run.conclusion === "success") finish(0, "green", `${run.html_url}`);
      if (run.conclusion === "cancelled") {
        if (!followPullRequest && await newerRunExists(run)) finish(2, "superseded", `run cancelled by a newer commit's run; follow that candidate instead (${run.html_url})`);
        finish(followPullRequest ? 2 : 1, followPullRequest ? "superseded" : "red", `run was cancelled${followPullRequest ? " (pull-request runs are cancelled by newer pushes to the branch)" : " without a newer run"} (${run.html_url})`);
      }
      finish(1, "red", `${await failureSummary(run)} (${run.html_url})`);
    } else if (run.status !== lastStatus) {
      lastStatus = run.status;
      console.log(`[wait-for-run] ${fullSha.slice(0, 12)}: ${run.status} (${run.html_url})`);
    }
    if (elapsed > timeoutMs) finish(5, "timeout", `still not finished after ${timeoutMs / 60_000} min; report this instead of assuming a result`);
    await sleep(pollMs);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    finish(6, "error", error instanceof Error ? error.message : String(error));
  }
}
