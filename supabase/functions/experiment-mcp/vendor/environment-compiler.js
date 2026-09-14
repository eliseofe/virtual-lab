export class EnvironmentCompileError extends Error {
  constructor(message, line = null, category = "initializer") {
    super(line == null ? message : `line ${line}: ${message}`);
    this.name = "EnvironmentCompileError";
    this.category = category;
    this.line = line;
  }
}

const INTRINSICS = Object.freeze({
  sqrt: 1,
  abs: 1,
  sin: 1,
  cos: 1,
  exp: 1,
  pow: 2,
  min: 2,
  max: 2,
});

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

function environmentFunction(source) {
  const rawLines = source.split(/\r?\n/);
  let start = -1;
  let headerLine = null;
  for (let i = 0; i < rawLines.length; i += 1) {
    const raw = stripComment(rawLines[i]);
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (/^def\s+environmental_scalar\s*\(/.test(trimmed)) {
      if (raw.length !== raw.trimStart().length) {
        throw new EnvironmentCompileError("environmental_scalar must be a top-level function", i + 1);
      }
      if (start !== -1) throw new EnvironmentCompileError("environmental_scalar may be defined only once", i + 1);
      const match = trimmed.match(/^def\s+environmental_scalar\s*\(([^)]*)\)\s*:\s*$/);
      if (!match) throw new EnvironmentCompileError("environmental_scalar must use signature environmental_scalar(x, y, config)", i + 1);
      const params = match[1].split(",").map((item) => item.trim()).filter(Boolean);
      if (params.length !== 3 || params[0] !== "x" || params[1] !== "y" || params[2] !== "config") {
        throw new EnvironmentCompileError("environmental_scalar must use signature environmental_scalar(x, y, config)", i + 1);
      }
      start = i;
      headerLine = i + 1;
    }
  }
  if (start === -1) return null;

  const body = [];
  let bodyIndent = null;
  for (let i = start + 1; i < rawLines.length; i += 1) {
    const withoutComment = stripComment(rawLines[i]);
    if (!withoutComment.trim()) continue;
    const indent = withoutComment.match(/^[ ]*/)?.[0].length ?? 0;
    if (/^\s*\t/.test(rawLines[i])) throw new EnvironmentCompileError("tabs are not supported; use spaces", i + 1);
    if (indent === 0 && /^def\s+/.test(withoutComment.trim())) break;
    if (indent === 0) throw new EnvironmentCompileError("environmental_scalar body must be indented", i + 1);
    if (bodyIndent == null) bodyIndent = indent;
    if (indent !== bodyIndent) {
      throw new EnvironmentCompileError("environmental_scalar currently requires a single return expression with one indentation level", i + 1, "unsupported-feature");
    }
    body.push({ text: withoutComment.trim(), line: i + 1 });
  }
  if (body.length !== 1) {
    throw new EnvironmentCompileError(
      "environmental_scalar currently requires exactly one 'return <expression>' statement",
      headerLine,
      "unsupported-feature",
    );
  }
  const match = body[0].text.match(/^return\s+(.+)$/);
  if (!match) {
    throw new EnvironmentCompileError("environmental_scalar body must return a scalar expression", body[0].line, "unsupported-feature");
  }
  return { expression: match[1], line: body[0].line };
}

function tokenize(text, line) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) { i += 1; continue; }
    const number = text.slice(i).match(/^(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?/);
    if (number) {
      tokens.push({ type: "number", value: number[0] });
      i += number[0].length;
      continue;
    }
    const ident = text.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (ident) {
      tokens.push({ type: "ident", value: ident[0] });
      i += ident[0].length;
      continue;
    }
    if ("+-*/(),.".includes(c)) {
      tokens.push({ type: c, value: c });
      i += 1;
      continue;
    }
    throw new EnvironmentCompileError(`unsupported token '${c}' in environmental_scalar`, line, "unsupported-feature");
  }
  tokens.push({ type: "eof", value: "" });
  return tokens;
}

class Parser {
  constructor(text, line, config) {
    this.tokens = tokenize(text, line);
    this.index = 0;
    this.line = line;
    this.config = config;
  }
  current() { return this.tokens[this.index]; }
  peek(type) { return this.current().type === type; }
  take(type) {
    const token = this.current();
    if (token.type !== type) {
      throw new EnvironmentCompileError(`expected '${type}', found '${token.value || "end of expression"}'`, this.line);
    }
    this.index += 1;
    return token;
  }
  parse() {
    const expression = this.additive();
    this.take("eof");
    return expression;
  }
  additive() {
    let left = this.multiplicative();
    while (this.peek("+") || this.peek("-")) {
      const op = this.current().type;
      this.index += 1;
      left = { kind: "binary", op, left, right: this.multiplicative() };
    }
    return left;
  }
  multiplicative() {
    let left = this.unary();
    while (this.peek("*") || this.peek("/")) {
      const op = this.current().type;
      this.index += 1;
      left = { kind: "binary", op, left, right: this.unary() };
    }
    return left;
  }
  unary() {
    if (this.peek("+") || this.peek("-")) {
      const op = this.current().type;
      this.index += 1;
      const value = this.unary();
      return op === "+" ? value : { kind: "unary", op: "-", value };
    }
    return this.primary();
  }
  primary() {
    if (this.peek("number")) {
      const value = Number(this.take("number").value);
      if (!Number.isFinite(value)) throw new EnvironmentCompileError("environment scalar constants must be finite", this.line);
      return { kind: "const", value };
    }
    if (this.peek("(")) {
      this.take("(");
      const value = this.additive();
      this.take(")");
      return value;
    }
    if (!this.peek("ident")) {
      throw new EnvironmentCompileError(`expected scalar expression, found '${this.current().value || "end"}'`, this.line);
    }
    const parts = [this.take("ident").value];
    while (this.peek(".")) {
      this.take(".");
      parts.push(this.take("ident").value);
    }
    const path = parts.join(".");
    if (this.peek("(")) {
      if (parts.length !== 1 || INTRINSICS[parts[0]] === undefined) {
        throw new EnvironmentCompileError(`call '${path}' is not available to environmental_scalar`, this.line, "unsupported-feature");
      }
      this.take("(");
      const args = [];
      if (!this.peek(")")) {
        do {
          args.push(this.additive());
          if (!this.peek(",")) break;
          this.take(",");
        } while (!this.peek(")"));
      }
      this.take(")");
      const arity = INTRINSICS[parts[0]];
      if (args.length !== arity) throw new EnvironmentCompileError(`${parts[0]} expects ${arity} arguments`, this.line);
      return { kind: "call", name: parts[0], args };
    }
    if (path === "x" || path === "y") return { kind: path };
    if (path === "TAU") return { kind: "const", value: Math.PI * 2 };
    if (path === "SQRT3_OVER_2") return { kind: "const", value: Math.sqrt(3) / 2 };
    if (path.startsWith("config.")) {
      const name = path.slice(7);
      const value = this.config.values[name];
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new EnvironmentCompileError(`environmental_scalar config parameter '${name}' must be a finite numeric value`, this.line);
      }
      return { kind: "const", value };
    }
    throw new EnvironmentCompileError(`identifier '${path}' is not available to environmental_scalar`, this.line, "forbidden-capability");
  }
}

export function compileEnvironmentScalar(initializerSource, config) {
  const definition = environmentFunction(initializerSource);
  if (!definition) return null;
  return {
    schema: "vlab.environment-scalar-ir/0.1",
    language: "python-vlab/0.1",
    entry: "environmental_scalar(x, y, config)",
    expression: new Parser(definition.expression, definition.line, config).parse(),
  };
}

function expressionUsesPath(node, path) {
  if (!node || typeof node !== "object") return false;
  if (node.kind === "load" && node.path === path) return true;
  if (node.kind === "unary") return expressionUsesPath(node.value, path);
  if (node.kind === "binary") return expressionUsesPath(node.left, path) || expressionUsesPath(node.right, path);
  if (node.kind === "call") return node.args.some((arg) => expressionUsesPath(arg, path));
  return false;
}

function statementsUsePath(body, path) {
  return body.some((statement) => {
    if (statement.kind === "for_each") {
      return expressionUsesPath(statement.iterable, path) || statementsUsePath(statement.body, path);
    }
    return expressionUsesPath(statement.value, path);
  });
}

export function controllerUsesEnvironmentalScalar(controllerIr) {
  return Array.isArray(controllerIr?.body)
    && statementsUsePath(controllerIr.body, "obs.environmental_scalar");
}

export function validateEnvironmentControllerPair(environmentIr, controllerIr) {
  if (controllerUsesEnvironmentalScalar(controllerIr) && !environmentIr) {
    throw new EnvironmentCompileError(
      "controller reads obs.environmental_scalar but Initialization does not define environmental_scalar(x, y, config)",
      null,
      "unsupported-capability",
    );
  }
}
