// Behaviour fingerprint of the authoring-language compilers (#576).
//
// The shared translator core must not change what any compiler accepts,
// produces or reports. This module turns the seed corpus
// (web/tests/fixtures/authoring-corpus.json: every compiler input exercised by
// the test suite) into a deterministic set of cases: each seed plus mutated
// variants (lines deleted, duplicated or re-indented; tokens replaced, deleted,
// inserted or swapped; lines truncated) and seeds of one language fed to the
// others. Each case's outcome is fingerprinted: the canonical JSON of the
// result, or the thrown error's class, message, category, line and column.
//
//   node web/scripts/authoring-equivalence.mjs --write   record the golden fingerprints
//   node web/scripts/authoring-equivalence.mjs           compare with them (also a test)

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import { compileConfig, configStructure } from "../src/config/compiler.js";
import { compileController, controllerStructure } from "../src/controller/compiler.js";
import { compileEnvironmentScalar } from "../src/environment/compiler.js";
import { compileInitializer, initializerStructure } from "../src/initializer/compiler.js";
import { compileMetrics, metricsStructure } from "../src/metrics/compiler.js";

const CORPUS = new URL("../tests/fixtures/authoring-corpus.json", import.meta.url);
const GOLDEN = new URL("../tests/fixtures/authoring-golden.json", import.meta.url);
const MUTANTS_PER_SEED = 150;

const FUNCTIONS = {
  compileConfig,
  configStructure,
  compileController,
  controllerStructure,
  compileEnvironmentScalar,
  compileInitializer,
  initializerStructure,
  compileMetrics,
  metricsStructure,
};

// Which source-only functions also run on every case's source text.
const STRUCTURE_OF = {
  compileConfig: configStructure,
  compileController: controllerStructure,
  compileInitializer: initializerStructure,
  compileEnvironmentScalar: initializerStructure,
  compileMetrics: metricsStructure,
};

const POOL = [
  "+", "-", "*", "/", "//", "%", "**", "==", "!=", "<", "<=", ">", ">=", "(", ")", ",", ".", ":", "=", "+=", "-=",
  "and", "or", "not", "if", "elif", "else", "for", "in", "range", "return", "while", "def", "class", "True", "False", "None",
  "self", "obs", "snapshot", "config", "rng", "place", "x", "y", "i", "0", "1", "2.5", "-1", "1e3", "'s'", "\"t\"", "#", "\t", "    ", "@metric", "Motion", "len", "sqrt",
];

function prng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TOKEN = /[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\*\*|\/\/|==|!=|<=|>=|\+=|-=|"[^"]*"|'[^']*'|\S/g;

function tokens(line) {
  return [...line.matchAll(TOKEN)].map((match) => ({ start: match.index, end: match.index + match[0].length }));
}

function mutate(source, random) {
  const lines = source.split("\n");
  const pick = (n) => Math.floor(random() * n);
  const at = pick(lines.length);
  const line = lines[at];
  const spans = tokens(line);
  const token = spans.length ? spans[pick(spans.length)] : null;
  const pool = POOL[pick(POOL.length)];
  switch (pick(9)) {
    case 0: lines.splice(at, 1); break;
    case 1: lines.splice(at, 0, line); break;
    case 2: lines[at] = `    ${line}`; break;
    case 3: lines[at] = line.replace(/^ {1,2}/, ""); break;
    case 4: if (token) lines[at] = line.slice(0, token.start) + pool + line.slice(token.end); break;
    case 5: if (token) lines[at] = line.slice(0, token.start) + line.slice(token.end); break;
    case 6: { const position = pick(line.length + 1); lines[at] = `${line.slice(0, position)} ${pool} ${line.slice(position)}`; break; }
    case 7: {
      const index = spans.indexOf(token);
      if (token && index + 1 < spans.length) {
        const next = spans[index + 1];
        lines[at] = line.slice(0, token.start) + line.slice(next.start, next.end) + line.slice(token.end, next.start) + line.slice(token.start, token.end) + line.slice(next.end);
      }
      break;
    }
    default: lines[at] = line.slice(0, pick(line.length + 1));
  }
  return lines.join("\n");
}

export async function authoringCases() {
  const { seeds } = JSON.parse(await readFile(CORPUS, "utf8"));
  const cases = [];
  const sourcesByLanguage = new Map();
  for (const seed of seeds) {
    if (!STRUCTURE_OF[seed.name] || typeof seed.args[0] !== "string") continue;
    if (!sourcesByLanguage.has(seed.name)) sourcesByLanguage.set(seed.name, []);
    sourcesByLanguage.get(seed.name).push(seed.args[0]);
  }
  seeds.forEach((seed, seedIndex) => {
    cases.push({ name: seed.name, args: seed.args });
    if (!STRUCTURE_OF[seed.name] || typeof seed.args[0] !== "string") return;
    const random = prng(seedIndex + 1);
    for (let k = 0; k < MUTANTS_PER_SEED; k += 1) {
      let source = seed.args[0];
      const edits = 1 + Math.floor(random() * 3);
      for (let e = 0; e < edits; e += 1) source = mutate(source, random);
      cases.push({ name: seed.name, args: [source, ...seed.args.slice(1)] });
    }
  });
  // Every language also compiles the other languages' seeds.
  const languages = [...sourcesByLanguage.keys()].sort();
  for (const name of languages) {
    const template = seeds.find((seed) => seed.name === name);
    for (const other of languages) {
      if (other === name) continue;
      for (const source of sourcesByLanguage.get(other)) cases.push({ name, args: [source, ...template.args.slice(1)] });
    }
  }
  return cases;
}

function canonical(value) {
  if (value === undefined) return { $undefined: true };
  if (typeof value === "number") {
    if (Object.is(value, -0)) return { $number: "-0" };
    if (!Number.isFinite(value)) return { $number: String(value) };
    return value;
  }
  if (typeof value === "bigint") return { $bigint: String(value) };
  if (typeof value === "function") return { $function: value.name };
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Map) return { $map: [...value.entries()].map(([k, v]) => [canonical(k), canonical(v)]) };
  if (value instanceof Set) return { $set: [...value].map(canonical) };
  if (Array.isArray(value)) return value.map(canonical);
  if (value instanceof Error) {
    const fields = Object.fromEntries(Object.entries(value).filter(([key]) => key !== "stack"));
    return { $error: value.constructor.name, name: value.name, message: value.message, fields: canonical(fields) };
  }
  // Key order is kept: it is part of the compiled output.
  return { $object: Object.keys(value).map((key) => [key, canonical(value[key])]) };
}

function outcome(fn, args) {
  try {
    return { result: canonical(fn(...structuredClone(args))) };
  } catch (error) {
    return { thrown: canonical(error) };
  }
}

export function fingerprint(testCase) {
  const outcomes = [outcome(FUNCTIONS[testCase.name], testCase.args)];
  const structure = STRUCTURE_OF[testCase.name];
  if (structure && typeof testCase.args[0] === "string") outcomes.push(outcome(structure, [testCase.args[0]]));
  return createHash("sha256").update(JSON.stringify(outcomes)).digest("hex").slice(0, 16);
}

export async function compareWithGolden() {
  const cases = await authoringCases();
  const golden = JSON.parse(await readFile(GOLDEN, "utf8"));
  const mismatches = [];
  cases.forEach((testCase, index) => {
    if (fingerprint(testCase) !== golden.fingerprints[index]) mismatches.push(index);
  });
  return { cases, golden, mismatches };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cases = await authoringCases();
  if (process.argv.includes("--write")) {
    const fingerprints = cases.map(fingerprint);
    await writeFile(GOLDEN, `${JSON.stringify({ schema: "vlab.authoring-golden/1", cases: cases.length, fingerprints })}\n`);
    console.log(`wrote ${cases.length} fingerprints`);
  } else {
    const { mismatches } = await compareWithGolden();
    console.log(`${cases.length} cases, ${mismatches.length} differ`);
    for (const index of mismatches.slice(0, 20)) console.log(`case ${index}: ${cases[index].name}\n${String(cases[index].args[0]).slice(0, 400)}\n---`);
    if (mismatches.length) process.exitCode = 1;
  }
}
