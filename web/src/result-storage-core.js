export const RUN_LOG_SCHEMA = "vlab.run-log/0.1";
export const PORTABLE_RUN_SCHEMA = "vlab.portable-run/0.1";
export const DEFAULT_FLUSH_INTERVAL_MS = 5000;
export const PENDING_SAMPLE_LIMIT = 524288;

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

export function sanitizePathSegment(value, fallback = "Experiment") {
  let text = String(value ?? "").normalize("NFKC");
  text = text.replace(/[\u0000-\u001f\u007f/\\?%*:|"<>]/g, "-");
  text = text.replace(/\s+/g, " ").trim().replace(/[. ]+$/g, "");
  if (!text || text === "." || text === "..") text = fallback;
  if (WINDOWS_RESERVED.test(text)) text = `_${text}`;
  return text.slice(0, 96).trim() || fallback;
}

export function formatRunNumber(value) {
  const number = Math.max(1, Math.trunc(Number(value) || 0));
  return String(number).padStart(6, "0");
}

export function metricFileName(metricId, runNumber) {
  const id = String(metricId ?? "");
  if (!/^[a-z][a-z0-9_.-]*$/.test(id)) throw new Error(`invalid stable metric id '${id}'`);
  return `${id}_${formatRunNumber(runNumber)}.csv`;
}

export function nextRunNumberFromNames(names) {
  let max = 0;
  for (const name of names ?? []) {
    const match = String(name).match(/_(\d{6})\.csv$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

export function nextRunNumberFromLogText(text) {
  let max = 0;
  for (const line of String(text ?? "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const value = Number(JSON.parse(line).run_number);
      if (Number.isInteger(value) && value > 0) max = Math.max(max, value);
    } catch {}
  }
  return max + 1;
}

function csvNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error("metric CSV requires finite numeric samples");
  return String(number);
}

export function samplesToCsv(samples, { includeHeader = true } = {}) {
  let text = includeHeader ? "scientific_time,value\n" : "";
  for (const sample of samples ?? []) {
    text += `${csvNumber(sample.t ?? sample.scientific_time)},${csvNumber(sample.value)}\n`;
  }
  return text;
}

function crc32Table() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
}
const CRC32_TABLE = crc32Table();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(view, offset, value) { view.setUint16(offset, value, true); }
function u32(view, offset, value) { view.setUint32(offset, value >>> 0, true); }

export function buildStoredZip(entries) {
  const encoder = new TextEncoder();
  const normalized = [...(entries ?? [])].map((entry) => {
    const name = String(entry.name ?? "").replace(/^\/+/, "");
    if (!name || name.includes("..") || name.includes("\\")) throw new Error(`invalid ZIP entry name '${name}'`);
    const nameBytes = encoder.encode(name);
    const data = entry.bytes instanceof Uint8Array ? entry.bytes : encoder.encode(String(entry.text ?? ""));
    return { name, nameBytes, data, crc: crc32(data), offset: 0 };
  });

  let localSize = 0;
  for (const entry of normalized) localSize += 30 + entry.nameBytes.length + entry.data.length;
  let centralSize = 0;
  for (const entry of normalized) centralSize += 46 + entry.nameBytes.length;
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let cursor = 0;

  for (const entry of normalized) {
    entry.offset = cursor;
    u32(view, cursor, 0x04034b50); u16(view, cursor + 4, 20); u16(view, cursor + 6, 0x0800);
    u16(view, cursor + 8, 0); u16(view, cursor + 10, 0); u16(view, cursor + 12, 0);
    u32(view, cursor + 14, entry.crc); u32(view, cursor + 18, entry.data.length); u32(view, cursor + 22, entry.data.length);
    u16(view, cursor + 26, entry.nameBytes.length); u16(view, cursor + 28, 0);
    cursor += 30; out.set(entry.nameBytes, cursor); cursor += entry.nameBytes.length;
    out.set(entry.data, cursor); cursor += entry.data.length;
  }

  const centralOffset = cursor;
  for (const entry of normalized) {
    u32(view, cursor, 0x02014b50); u16(view, cursor + 4, 20); u16(view, cursor + 6, 20); u16(view, cursor + 8, 0x0800);
    u16(view, cursor + 10, 0); u16(view, cursor + 12, 0); u16(view, cursor + 14, 0);
    u32(view, cursor + 16, entry.crc); u32(view, cursor + 20, entry.data.length); u32(view, cursor + 24, entry.data.length);
    u16(view, cursor + 28, entry.nameBytes.length); u16(view, cursor + 30, 0); u16(view, cursor + 32, 0);
    u16(view, cursor + 34, 0); u16(view, cursor + 36, 0); u32(view, cursor + 38, 0); u32(view, cursor + 42, entry.offset);
    cursor += 46; out.set(entry.nameBytes, cursor); cursor += entry.nameBytes.length;
  }

  const centralLength = cursor - centralOffset;
  u32(view, cursor, 0x06054b50); u16(view, cursor + 4, 0); u16(view, cursor + 6, 0);
  u16(view, cursor + 8, normalized.length); u16(view, cursor + 10, normalized.length);
  u32(view, cursor + 12, centralLength); u32(view, cursor + 16, centralOffset); u16(view, cursor + 20, 0);
  return out;
}
