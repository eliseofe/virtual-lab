import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  PENDING_SAMPLE_LIMIT,
  buildStoredZip,
  formatRunNumber,
  metricFileName,
  nextRunNumberFromLogText,
  nextRunNumberFromNames,
  samplesToCsv,
  sanitizePathSegment,
} from "../src/result-storage-core.js";

const here = new URL(".", import.meta.url);

function utf8(bytes) { return new TextDecoder().decode(bytes); }

test("#199 keeps the user-visible run layout flat and deterministically numbered", () => {
  assert.equal(formatRunNumber(1), "000001");
  assert.equal(formatRunNumber(42), "000042");
  assert.equal(metricFileName("polarization", 7), "polarization_000007.csv");
  assert.equal(metricFileName("angular_momentum", 7), "angular_momentum_000007.csv");
  assert.equal(nextRunNumberFromNames([
    "polarization_000001.csv",
    "angular_momentum_000001.csv",
    "polarization_000004.csv",
    "notes.txt",
  ]), 5);
  assert.throws(() => metricFileName("Bad metric/name", 1), /invalid stable metric id/);
});

test("#199 run numbering also reserves empty/interrupted run numbers from hidden bookkeeping", () => {
  const log = [
    JSON.stringify({ event: "started", run_number: 2 }),
    JSON.stringify({ event: "completed", run_number: 2 }),
    JSON.stringify({ event: "started", run_number: 9 }),
    "not-json",
  ].join("\n");
  assert.equal(nextRunNumberFromLogText(log), 10);
});

test("#199 sanitizes only path-hostile Experiment title characters", () => {
  assert.equal(sanitizePathSegment("Active Elastic — Ferrante"), "Active Elastic — Ferrante");
  assert.equal(sanitizePathSegment("A/B: C?"), "A-B- C-");
  assert.equal(sanitizePathSegment("CON"), "_CON");
});

test("#199 scientific CSV is simple, complete and analysis-friendly", () => {
  assert.equal(samplesToCsv([
    { t: 0.1, value: 0.25 },
    { scientific_time: 0.2, value: 0.5 },
  ]), "scientific_time,value\n0.1,0.25\n0.2,0.5\n");
  assert.equal(samplesToCsv([{ t: 0.3, value: 0.75 }], { includeHeader: false }), "0.3,0.75\n");
  assert.throws(() => samplesToCsv([{ t: 0.1, value: Number.NaN }]), /finite numeric/);
});

test("#199 portable fallback is one ZIP containing flat metric files plus hidden bookkeeping", () => {
  const bytes = buildStoredZip([
    { name: "polarization_000001.csv", text: "scientific_time,value\n0.1,0.4\n" },
    { name: "angular_momentum_000001.csv", text: "scientific_time,value\n0.1,0.2\n" },
    { name: ".vlab/run.json", text: "{}\n" },
  ]);
  const text = utf8(bytes);
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  assert.match(text, /polarization_000001\.csv/);
  assert.match(text, /angular_momentum_000001\.csv/);
  assert.match(text, /\.vlab\/run\.json/);
});

test("#199 browser persistence uses selected directory, bounded async buffering and no per-run directories", async () => {
  const persistence = await readFile(new URL("../src/result-persistence.js", here), "utf8");
  const bridge = await readFile(new URL("../src/metrics-runtime-bridge.js", here), "utf8");
  assert.match(persistence, /showDirectoryPicker/);
  assert.match(persistence, /getDirectoryHandle\("runs", \{ create: true \}\)/);
  assert.match(persistence, /getDirectoryHandle\("\.vlab", \{ create: true \}\)/);
  assert.match(persistence, /runs\.ndjson/);
  assert.doesNotMatch(persistence, /getDirectoryHandle\([^\n]*runNumber/);
  assert.ok(PENDING_SAMPLE_LIMIT >= 100000);
  assert.match(persistence, /pauseForBackpressure/);
  assert.match(bridge, /vlab:run-start/);
  assert.match(bridge, /vlab:run-complete/);
  assert.match(bridge, /import "\.\/result-persistence\.js"/);
});
