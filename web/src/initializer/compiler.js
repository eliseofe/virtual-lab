export class InitializerCompileError extends Error {
  constructor(message, line = null) {
    super(line == null ? message : `line ${line}: ${message}`);
    this.name = "InitializerCompileError";
    this.line = line;
  }
}

const HELPERS = {
  HexagonPerturbed: { method: "hexagon_perturbed", args: ["spacing", "jitter"] },
  RandomUniform: { method: "random_uniform", args: ["extent"] },
};

function meaningful(source) {
  return source.split(/\r?\n/).map((raw, index) => ({
    line: index + 1,
    indent: raw.match(/^ */)?.[0].length ?? 0,
    text: raw.trim(),
  })).filter((entry) => entry.text && !entry.text.startsWith("#"));
}

function resolveArg(text, config, line) {
  const value = text.trim();
  const configRef = value.match(/^config\.([A-Za-z_][A-Za-z0-9_]*)$/);
  if (configRef) {
    const name = configRef[1];
    if (!Object.prototype.hasOwnProperty.call(config.values, name)) {
      throw new InitializerCompileError(`unknown config parameter '${name}'`, line);
    }
    const resolved = config.values[name];
    if (typeof resolved !== "number" || !Number.isFinite(resolved)) {
      throw new InitializerCompileError(`initializer argument '${name}' must be numeric`, line);
    }
    return resolved;
  }
  if (/^[+-]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?$/.test(value)) return Number(value);
  throw new InitializerCompileError(`unsupported initializer argument '${value}'`, line);
}

function parseReturn(text, config, line) {
  const match = text.match(/^return\s+([A-Za-z_][A-Za-z0-9_]*)\((.*)\)$/);
  if (!match) throw new InitializerCompileError("expected return Helper(...)", line);
  const helper = HELPERS[match[1]];
  if (!helper) throw new InitializerCompileError(`unsupported initializer helper '${match[1]}'`, line);
  const args = match[2].trim() ? match[2].split(",").map((arg) => resolveArg(arg, config, line)) : [];
  if (args.length !== helper.args.length) {
    throw new InitializerCompileError(`${match[1]} expects ${helper.args.length} arguments, got ${args.length}`, line);
  }
  return Object.fromEntries([["method", helper.method], ...helper.args.map((name, index) => [name, args[index]])]);
}

export function compileInitializer(source, config) {
  const lines = meaningful(source);
  if (!lines.length || lines[0].text !== "def initialize(config):" || lines[0].indent !== 0) {
    throw new InitializerCompileError("initializer must start with 'def initialize(config):'", lines[0]?.line ?? 1);
  }

  const branches = [];
  let index = 1;
  while (index < lines.length) {
    const branch = lines[index];
    const match = branch.text.match(/^if\s+config\.([A-Za-z_][A-Za-z0-9_]*)\s*==\s*(["'])(.*?)\2\s*:\s*$/);
    if (!match || branch.indent !== 4) throw new InitializerCompileError("expected 'if config.NAME == \"value\":'", branch.line);
    const returned = lines[index + 1];
    if (!returned || returned.indent !== 8) throw new InitializerCompileError("initializer branch requires one indented return", branch.line);
    branches.push({ key: match[1], value: match[3], spec: parseReturn(returned.text, config, returned.line) });
    index += 2;
  }

  for (const branch of branches) {
    if (config.values[branch.key] === branch.value) {
      return { version: "vlab.initializer-ir/0.1", ...branch.spec };
    }
  }
  const choices = branches.map((branch) => `${branch.key}=${JSON.stringify(branch.value)}`).join(", ");
  throw new InitializerCompileError(`no initializer branch matches the current config (${choices})`);
}
