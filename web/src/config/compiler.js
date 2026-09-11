export class ConfigCompileError extends Error {
  constructor(message, line = null) {
    super(line == null ? message : `line ${line}: ${message}`);
    this.name = "ConfigCompileError";
    this.line = line;
  }
}

function stripComment(raw) {
  let quote = null;
  for (let i = 0; i < raw.length; i += 1) {
    const c = raw[i];
    if (quote) {
      if (c === quote && raw[i - 1] !== "\\") quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "#") return raw.slice(0, i);
  }
  return raw;
}

function parseLiteral(text, line) {
  const value = text.trim();
  if (/^[+-]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?$/.test(value)) return Number(value);
  if (value === "True") return true;
  if (value === "False") return false;
  if (value === "None") return null;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    try {
      if (value.startsWith('"')) return JSON.parse(value);
      return value.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, "\\");
    } catch {
      throw new ConfigCompileError("invalid string literal", line);
    }
  }
  throw new ConfigCompileError("values must currently be Python scalar literals (number, string, True, False, or None)", line);
}

export function compileConfig(source) {
  const values = {};
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = index + 1;
    const text = stripComment(lines[index]).trim();
    if (!text) continue;
    const match = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (!match) throw new ConfigCompileError("expected NAME = value", line);
    const name = match[1];
    if (Object.prototype.hasOwnProperty.call(values, name)) throw new ConfigCompileError(`duplicate parameter '${name}'`, line);
    values[name] = parseLiteral(match[2], line);
  }
  if (!Object.keys(values).length) throw new ConfigCompileError("configuration is empty");
  return { version: "vlab.config/0.1", values };
}

export function numericParameters(config) {
  return Object.fromEntries(Object.entries(config.values).filter(([, value]) => typeof value === "number" && Number.isFinite(value)));
}
