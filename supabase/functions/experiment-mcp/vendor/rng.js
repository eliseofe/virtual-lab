export const RNG_CONTRACT_VERSION = "vlab.rng/splitmix64-domain/1";

export const RNG_DOMAINS = Object.freeze({
  initialization: "initialization",
  sensing: "sensing",
  controller: "controller",
});

const MASK64 = (1n << 64n) - 1n;
const SPLITMIX_GAMMA = 0x9E3779B97F4A7C15n;
const SPLITMIX_MUL1 = 0xBF58476D1CE4E5B9n;
const SPLITMIX_MUL2 = 0x94D049BB133111EBn;
const FNV1A_OFFSET = 0xCBF29CE484222325n;
const FNV1A_PRIME = 0x100000001B3n;
const TWO_POW_53 = 9007199254740992;

function assertRootSeed(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xFFFFFFFF) {
    throw new RangeError("scientific RNG root seed must be an unsigned 32-bit integer");
  }
}

function assertStreamIndex(streamIndex) {
  if (!Number.isSafeInteger(streamIndex) || streamIndex < 0) {
    throw new RangeError("scientific RNG stream index must be a non-negative safe integer");
  }
}

function asciiFNV1a64(label) {
  if (typeof label !== "string" || !/^[\x20-\x7E]+$/.test(label)) {
    throw new RangeError("scientific RNG domain must be a non-empty printable ASCII string");
  }
  let hash = FNV1A_OFFSET;
  for (let index = 0; index < label.length; index += 1) {
    hash ^= BigInt(label.charCodeAt(index));
    hash = (hash * FNV1A_PRIME) & MASK64;
  }
  return hash;
}

function splitmix64Finalizer(value) {
  let z = value & MASK64;
  z = ((z ^ (z >> 30n)) * SPLITMIX_MUL1) & MASK64;
  z = ((z ^ (z >> 27n)) * SPLITMIX_MUL2) & MASK64;
  return (z ^ (z >> 31n)) & MASK64;
}

export function deriveScientificStreamSeed(rootSeed, domain, streamIndex = 0) {
  assertRootSeed(rootSeed);
  assertStreamIndex(streamIndex);

  const root = BigInt(rootSeed) & MASK64;

  // v1 deliberately preserves the historical initialization stream bit-for-bit.
  // Other domains are separated from initialization and from each other.
  if (domain === RNG_DOMAINS.initialization && streamIndex === 0) return root;

  const domainTag = asciiFNV1a64(domain);
  const streamTag = (BigInt(streamIndex) * SPLITMIX_GAMMA) & MASK64;
  return splitmix64Finalizer((root ^ domainTag ^ streamTag) & MASK64);
}

export class ScientificRng {
  constructor(seedState) {
    if (typeof seedState !== "bigint" || seedState < 0n || seedState > MASK64) {
      throw new RangeError("scientific RNG seed state must be an unsigned 64-bit bigint");
    }
    this.state = seedState;
  }

  static forDomain(rootSeed, domain, streamIndex = 0) {
    return new ScientificRng(deriveScientificStreamSeed(rootSeed, domain, streamIndex));
  }

  nextU64() {
    this.state = (this.state + SPLITMIX_GAMMA) & MASK64;
    return splitmix64Finalizer(this.state);
  }

  unit() {
    return Number(this.nextU64() >> 11n) / TWO_POW_53;
  }

  signed() {
    return this.unit() * 2.0 - 1.0;
  }

  uniform(a, b) {
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      throw new RangeError("scientific RNG uniform bounds must be finite");
    }
    return a + (b - a) * this.unit();
  }
}
