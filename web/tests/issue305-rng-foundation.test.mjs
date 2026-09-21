import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { compileConfig } from "../src/config/compiler.js";
import { compileInitializer } from "../src/initializer/compiler.js";
import {
  RNG_CONTRACT_VERSION,
  RNG_DOMAINS,
  ScientificRng,
  deriveScientificStreamSeed,
} from "../src/rng.js";

const rust = readFileSync(new URL("../../crates/kernel/src/rng.rs", import.meta.url), "utf8");
const browserRng = readFileSync(new URL("../src/rng.js", import.meta.url), "utf8");
const edgeRng = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/vendor/rng.js", import.meta.url),
  "utf8",
);
const browserInitializer = readFileSync(
  new URL("../src/initializer/compiler.js", import.meta.url),
  "utf8",
);
const edgeInitializer = readFileSync(
  new URL("../../supabase/functions/experiment-mcp/vendor/initializer-compiler.js", import.meta.url),
  "utf8",
);
const worker = readFileSync(new URL("../src/worker.js", import.meta.url), "utf8");
const doc = readFileSync(new URL("../../docs/RNG_CONTRACT.md", import.meta.url), "utf8");

test("#305 browser and edge use the same canonical RNG implementation", () => {
  assert.equal(browserRng, edgeRng);
  assert.match(browserInitializer, /ScientificRng\.forDomain\(seed, RNG_DOMAINS\.initialization\)/);
  assert.match(edgeInitializer, /ScientificRng\.forDomain\(seed, RNG_DOMAINS\.initialization\)/);
  assert.doesNotMatch(browserInitializer, /class SimulatorRng/);
  assert.doesNotMatch(edgeInitializer, /class SimulatorRng/);
});

test("#305 v1 fixed vectors match the cross-runtime contract", () => {
  assert.equal(RNG_CONTRACT_VERSION, "vlab.rng/splitmix64-domain/1");
  assert.equal(
    deriveScientificStreamSeed(2026, RNG_DOMAINS.initialization, 0),
    0x00000000000007EAn,
  );
  assert.equal(
    deriveScientificStreamSeed(2026, RNG_DOMAINS.sensing, 0),
    0x47FDC51ABF391476n,
  );
  assert.equal(
    deriveScientificStreamSeed(2026, RNG_DOMAINS.controller, 0),
    0x9D24ED0D15C2C6F3n,
  );
  assert.equal(
    deriveScientificStreamSeed(2026, RNG_DOMAINS.controller, 1),
    0x90AA42631D02B494n,
  );

  const initialization = ScientificRng.forDomain(2026, RNG_DOMAINS.initialization, 0);
  assert.deepEqual(
    [initialization.nextU64(), initialization.nextU64(), initialization.nextU64()],
    [0xDB9C559891948D23n, 0x78BC927DED35455Dn, 0xAAD71E75CDE2B88En],
  );

  const sensing = ScientificRng.forDomain(2026, RNG_DOMAINS.sensing, 0);
  assert.deepEqual(
    [sensing.nextU64(), sensing.nextU64(), sensing.nextU64()],
    [0xACB00A4D94376943n, 0xD1950AA56F146E6Cn, 0xA1739EB99746500Bn],
  );

  for (const vector of [
    "0x47FDC51ABF391476",
    "0xACB00A4D94376943",
    "0x9D24ED0D15C2C6F3",
    "0x90AA42631D02B494",
  ]) {
    assert.match(rust, new RegExp(vector.slice(2), "i"));
    assert.match(doc, new RegExp(vector.slice(2), "i"));
  }
});

test("#305 initialization remains bit-for-bit compatible for existing seeded experiments", () => {
  const config = compileConfig(`
SEED = 2026
N = 1
ARENA_SIZE = 2.0
`);
  const source = `def initialize(config, rng, place):
    x = rng.uniform(-1.0, 1.0)
    y = rng.uniform(-1.0, 1.0)
    theta = rng.uniform(0.0, TAU)
    place(0, x, y, theta)
`;
  const result = compileInitializer(source, config);
  assert.equal(result.state[0].x, 0.7157084460224363);
  assert.equal(result.state[0].y, -0.05674523211708582);
  assert.equal(result.state[0].heading, 4.19305201743496);
});

test("#305 scientific domains and controller stream indices are independent", () => {
  const sensing = ScientificRng.forDomain(2026, RNG_DOMAINS.sensing, 0);
  const controller0a = ScientificRng.forDomain(2026, RNG_DOMAINS.controller, 0);
  const controller1 = ScientificRng.forDomain(2026, RNG_DOMAINS.controller, 1);
  const expected = controller0a.nextU64();
  for (let index = 0; index < 1000; index += 1) sensing.nextU64();
  const controller0b = ScientificRng.forDomain(2026, RNG_DOMAINS.controller, 0);
  assert.equal(controller0b.nextU64(), expected);
  assert.notEqual(controller1.nextU64(), expected);
});

test("#305 kernel exposes the active RNG contract without exposing raw streams", () => {
  assert.match(rust, /pub const RNG_CONTRACT_VERSION: &str = "vlab\.rng\/splitmix64-domain\/1"/);
  assert.match(worker, /rngContractVersion: wasm\.rng_contract_version\(\)/);
  assert.doesNotMatch(worker, /next_u64|derive_scientific_stream_seed|ScientificRng/);
  assert.match(doc, /Rendering, UI behavior, transport, metrics presentation/);
  assert.match(doc, /controller.*reserved/i);
});
