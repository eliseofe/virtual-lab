import { stripComment } from "../authoring-core/lines.js";
export class ConfigCompileError extends Error {
  constructor(message, line = null) {
    super(line == null ? message : `line ${line}: ${message}`);
    this.name = "ConfigCompileError";
    this.line = line;
  }
}

function parseValue(text, line, values) {
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
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    if (!Object.prototype.hasOwnProperty.call(values, value)) {
      throw new ConfigCompileError(`unknown parameter alias '${value}'`, line);
    }
    return values[value];
  }
  throw new ConfigCompileError("values must be Python scalar literals or aliases to an earlier parameter", line);
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
    values[name] = parseValue(match[2], line, values);
  }
  if (!Object.keys(values).length) throw new ConfigCompileError("configuration is empty");
  return { version: "vlab.config/0.2", values };
}

export function configStructure(source) {
  const compiled = compileConfig(source);
  const lines = source.split(/\r?\n/);
  const symbols = [];
  for (const name of Object.keys(compiled.values)) {
    const pattern = new RegExp("^\\s*" + name + "\\s*=");
    const index = lines.findIndex((line) => pattern.test(stripComment(line)));
    if (index >= 0) symbols.push({ kind: "parameter", name, line: index + 1 });
  }
  return { language: "python-vlab-config/0.2", symbols };
}

export function numericParameters(config) {
  return Object.fromEntries(Object.entries(config.values).filter(([, value]) => typeof value === "number" && Number.isFinite(value)));
}
