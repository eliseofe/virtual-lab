const FORBIDDEN_ROOTS = new Set([
  "random", "rng", "seed", "controller", "world", "simulator", "environment",
  "filesystem", "network", "actions", "actuators",
]);

const CALL_SIGNATURES = {
  Vec2: { args: ["scalar", "scalar"], result: "vec2" },
  dot: { args: ["vec2", "vec2"], result: "scalar" },
  cross2: { args: ["vec2", "vec2"], result: "scalar" },
  norm: { args: ["vec2"], result: "scalar" },
  abs: { args: ["scalar"], result: "scalar" },
  sqrt: { args: ["scalar"], result: "scalar" },
  exp: { args: ["scalar"], result: "scalar" },
  log: { args: ["scalar"], result: "scalar" },
  sin: { args: ["scalar"], result: "scalar" },
  cos: { args: ["scalar"], result: "scalar" },
  tan: { args: ["scalar"], result: "scalar" },
  asin: { args: ["scalar"], result: "scalar" },
  acos: { args: ["scalar"], result: "scalar" },
  atan: { args: ["scalar"], result: "scalar" },
  atan2: { args: ["scalar", "scalar"], result: "scalar" },
  floor: { args: ["scalar"], result: "scalar" },
  ceil: { args: ["scalar"], result: "scalar" },
  pow: { args: ["scalar", "scalar"], result: "scalar" },
  min: { args: ["scalar", "scalar"], result: "scalar" },
  max: { args: ["scalar", "scalar"], result: "scalar" },
};

export const METRICS_LANGUAGE = "python-vlab-metrics/0.1";
export const METRICS_IR_SCHEMA = "vlab.metrics-ir/0.1";
export const METRIC_MEASUREMENT_PHASE = "post-physics-wrapped-state/1";

export class MetricsCompileError extends Error {
  constructor(category, message, line = null, column = null) {
    const location = line == null ? "" : `line ${line}${column == null ? "" : `:${column}`}: `;
    super(`${location}${category}: ${message}`);
    this.name = "MetricsCompileError";
    this.category = category;
    this.line = line;
    this.column = column;
  }
}

function indentation(raw, line) {
  const leading = raw.match(/^[\t ]*/)?.[0] ?? "";
  if (leading.includes("\t")) throw new MetricsCompileError("syntax", "tabs are not supported; use spaces", line, 1);
  return leading.length;
}

function sourceLines(source) {
  return source.split(/\r?\n/).map((raw, index) => ({
    raw,
    line: index + 1,
    indent: indentation(raw, index + 1),
    text: raw.trim(),
  }));
}

function meaningful(lines) {
  return lines.filter((entry) => entry.text && !entry.text.startsWith("#"));
}

function splitTopLevel(text, line) {
  const parts = [];
  let current = "";
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quote) {
      current += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth < 0) throw new MetricsCompileError("syntax", "unbalanced ')' in metric declaration", line);
    if (char === "," && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (quote) throw new MetricsCompileError("syntax", "unterminated string in metric declaration", line);
  if (depth !== 0) throw new MetricsCompileError("syntax", "unbalanced parentheses in metric declaration", line);
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseString(text, line, field) {
  const match = text.match(/^(["'])(.*)\1$/);
  if (!match) throw new MetricsCompileError("syntax", `${field} must be a quoted string`, line);
  try {
    if (match[1] === '"') return JSON.parse(text);
    return match[2].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  } catch {
    throw new MetricsCompileError("syntax", `invalid ${field} string`, line);
  }
}

function parseSampling(text, line) {
  const every = text.match(/^every\((.+)\)$/);
  if (every) {
    const seconds = Number(every[1].trim());
    if (!Number.isFinite(seconds) || seconds <= 0) {
      throw new MetricsCompileError("sampling", "every(seconds) requires a finite positive interval", line);
    }
    return { kind: "periodic", interval_seconds: seconds };
  }
  if (/^final\(\)$/.test(text)) return { kind: "final" };
  throw new MetricsCompileError("sampling", "sampling must be every(<positive seconds>) or final()", line);
}

function parseDecorator(text, line) {
  const match = text.match(/^@metric\((.*)\)$/);
  if (!match) throw new MetricsCompileError("syntax", "expected @metric(...) declaration", line);
  const values = {};
  for (const part of splitTopLevel(match[1], line)) {
    const assignment = part.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (!assignment) throw new MetricsCompileError("syntax", `metric argument '${part}' must use name=value`, line);
    const [, key, raw] = assignment;
    if (Object.hasOwn(values, key)) throw new MetricsCompileError("syntax", `duplicate metric argument '${key}'`, line);
    values[key] = raw.trim();
  }
  for (const required of ["id", "name", "sampling"]) {
    if (!Object.hasOwn(values, required)) throw new MetricsCompileError("syntax", `metric declaration requires '${required}'`, line);
  }
  const id = parseString(values.id, line, "id");
  if (!/^[a-z][a-z0-9_.-]*$/.test(id)) {
    throw new MetricsCompileError("metric-id", "metric id must start with a lowercase letter and contain only lowercase letters, digits, '.', '_' or '-'", line);
  }
  const name = parseString(values.name, line, "name");
  if (!name.trim()) throw new MetricsCompileError("metric-name", "metric name must not be empty", line);
  let unit = null;
  if (Object.hasOwn(values, "unit")) {
    unit = values.unit === "None" ? null : parseString(values.unit, line, "unit");
  }
  const unknown = Object.keys(values).filter((key) => !["id", "name", "unit", "sampling"].includes(key));
  if (unknown.length) throw new MetricsCompileError("unsupported-feature", `unsupported metric metadata '${unknown[0]}'`, line);
  return { id, name, unit, sampling: parseSampling(values.sampling, line), line };
}

class ExprParser {
  constructor(text, line) {
    this.text = text;
    this.line = line;
    this.tokens = this.tokenize(text);
    this.index = 0;
  }

  tokenize(text) {
    const tokens = [];
    let i = 0;
    while (i < text.length) {
      const c = text[i];
      if (/\s/.test(c)) { i += 1; continue; }
      const number = text.slice(i).match(/^(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?/);
      if (number) {
        tokens.push({ type: "number", value: number[0], column: i + 1 });
        i += number[0].length;
        continue;
      }
      if (text.slice(i, i + 2) === "**") {
        tokens.push({ type: "**", value: "**", column: i + 1 });
        i += 2;
        continue;
      }
      const ident = text.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
      if (ident) {
        tokens.push({ type: "ident", value: ident[0], column: i + 1 });
        i += ident[0].length;
        continue;
      }
      if ("+-*/(),.".includes(c)) {
        tokens.push({ type: c, value: c, column: i + 1 });
        i += 1;
        continue;
      }
      throw new MetricsCompileError("syntax", `unsupported token '${c}'`, this.line, i + 1);
    }
    tokens.push({ type: "eof", value: "", column: text.length + 1 });
    return tokens;
  }

  peek(type) { return this.tokens[this.index].type === type; }
  take(type) {
    const token = this.tokens[this.index];
    if (token.type !== type) {
      throw new MetricsCompileError("syntax", `expected '${type}', found '${token.value || "end of expression"}'`, this.line, token.column);
    }
    this.index += 1;
    return token;
  }
  parse() { const node = this.additive(); this.take("eof"); return node; }
  additive() {
    let left = this.multiplicative();
    while (this.peek("+") || this.peek("-")) {
      const op = this.tokens[this.index++].type;
      left = { kind: "binary", op, left, right: this.multiplicative(), line: this.line };
    }
    return left;
  }
  multiplicative() {
    let left = this.unary();
    while (this.peek("*") || this.peek("/")) {
      const op = this.tokens[this.index++].type;
      left = { kind: "binary", op, left, right: this.unary(), line: this.line };
    }
    return left;
  }
  unary() {
    if (this.peek("-")) { this.take("-"); return { kind: "unary", op: "-", value: this.unary(), line: this.line }; }
    return this.power();
  }
  power() {
    const left = this.primary();
    if (!this.peek("**")) return left;
    this.take("**");
    return { kind: "call", name: "pow", args: [left, this.unary()], line: this.line };
  }
  primary() {
    if (this.peek("number")) {
      const token = this.take("number");
      const value = Number(token.value);
      if (!Number.isFinite(value)) throw new MetricsCompileError("syntax", "metric constants must be finite", this.line, token.column);
      return { kind: "const", value, line: this.line };
    }
    if (this.peek("(")) { this.take("("); const node = this.additive(); this.take(")"); return node; }
    if (!this.peek("ident")) {
      const token = this.tokens[this.index];
      throw new MetricsCompileError("syntax", `expected expression, found '${token.value || "end of expression"}'`, this.line, token.column);
    }
    const parts = [this.take("ident").value];
    while (this.peek(".")) { this.take("."); parts.push(this.take("ident").value); }
    const path = parts.join(".");
    if (FORBIDDEN_ROOTS.has(parts[0])) {
      throw new MetricsCompileError("forbidden-capability", `'${parts[0]}' is outside the metric read-only information boundary`, this.line);
    }
    if (this.peek("(")) {
      if (parts.length !== 1 || !CALL_SIGNATURES[parts[0]]) {
        throw new MetricsCompileError("unsupported-feature", `call '${path}' is not in ${METRICS_LANGUAGE}`, this.line);
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
      return { kind: "call", name: parts[0], args, line: this.line };
    }
    return { kind: "load", path, line: this.line };
  }
}

function parseExpr(text, line) { return new ExprParser(text, line).parse(); }

function parseTarget(text, line) {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) return text;
  throw new MetricsCompileError("unsupported-feature", `assignment target '${text}' is not supported`, line);
}

function parseStatements(lines, start, blockIndent) {
  const body = [];
  let i = start;
  while (i < lines.length) {
    const entry = lines[i];
    if (!entry.text || entry.text.startsWith("#")) { i += 1; continue; }
    if (entry.indent < blockIndent) break;
    if (entry.indent > blockIndent) throw new MetricsCompileError("syntax", "unexpected indentation", entry.line);

    const forMatch = entry.text.match(/^for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+(.+):$/);
    if (forMatch) {
      let nextIndex = i + 1;
      while (nextIndex < lines.length && (!lines[nextIndex].text || lines[nextIndex].text.startsWith("#"))) nextIndex += 1;
      const next = lines[nextIndex];
      if (!next || next.indent <= blockIndent) throw new MetricsCompileError("syntax", "for loop requires an indented body", entry.line);
      const nested = parseStatements(lines, nextIndex, next.indent);
      body.push({ kind: "for_each", variable: forMatch[1], iterable: parseExpr(forMatch[2], entry.line), body: nested.body, line: entry.line });
      i = nested.next;
      continue;
    }

    const returnMatch = entry.text.match(/^return\s+(.+)$/);
    if (returnMatch) { body.push({ kind: "return", value: parseExpr(returnMatch[1], entry.line), line: entry.line }); i += 1; continue; }
    const augMatch = entry.text.match(/^(.+?)\s*\+=\s*(.+)$/);
    if (augMatch) { body.push({ kind: "aug_assign", target: parseTarget(augMatch[1].trim(), entry.line), op: "+", value: parseExpr(augMatch[2], entry.line), line: entry.line }); i += 1; continue; }
    const assignMatch = entry.text.match(/^(.+?)\s*=\s*(.+)$/);
    if (assignMatch) { body.push({ kind: "assign", target: parseTarget(assignMatch[1].trim(), entry.line), value: parseExpr(assignMatch[2], entry.line), line: entry.line }); i += 1; continue; }
    throw new MetricsCompileError("unsupported-feature", `statement '${entry.text}' is not in ${METRICS_LANGUAGE}`, entry.line);
  }
  return { body, next: i };
}

function binaryType(op, left, right, line) {
  if ((op === "+" || op === "-") && left === right && (left === "scalar" || left === "vec2")) return left;
  if (op === "*" && left === "scalar" && right === "scalar") return "scalar";
  if (op === "*" && ((left === "scalar" && right === "vec2") || (left === "vec2" && right === "scalar"))) return "vec2";
  if (op === "/" && left === "scalar" && right === "scalar") return "scalar";
  if (op === "/" && left === "vec2" && right === "scalar") return "vec2";
  throw new MetricsCompileError("type", `operator '${op}' cannot combine ${left} and ${right}`, line);
}

function loadType(path, locals, parameters, line) {
  if (Object.hasOwn(locals, path)) return locals[path];
  if (Object.hasOwn(parameters, path)) return parameters[path];
  if (path === "snapshot.scientific_time" || path === "snapshot.agent_count") return "scalar";
  if (path === "snapshot.agents") return "sequence<agent>";
  const [root, field] = path.split(".");
  if (locals[root] === "agent") {
    if (field === "position" || field === "heading") return "vec2";
    if (field === "heading_angle") return "scalar";
    throw new MetricsCompileError("invalid-observation-field", `unknown agent field '${field}'`, line);
  }
  if (path === "snapshot" || path.startsWith("snapshot.")) {
    throw new MetricsCompileError("invalid-observation-field", `unknown metric snapshot field '${path}'`, line);
  }
  throw new MetricsCompileError("type", `unknown scalar/vector name '${path}'`, line);
}

function expressionType(node, locals, parameters) {
  if (node.kind === "const") return "scalar";
  if (node.kind === "load") return loadType(node.path, locals, parameters, node.line);
  if (node.kind === "unary") {
    const type = expressionType(node.value, locals, parameters);
    if (type !== "scalar" && type !== "vec2") throw new MetricsCompileError("type", `unary '-' cannot apply to ${type}`, node.line);
    return type;
  }
  if (node.kind === "binary") return binaryType(node.op, expressionType(node.left, locals, parameters), expressionType(node.right, locals, parameters), node.line);
  if (node.kind === "call") {
    const signature = CALL_SIGNATURES[node.name];
    if (node.args.length !== signature.args.length) throw new MetricsCompileError("type", `${node.name} expects ${signature.args.length} arguments`, node.line);
    node.args.forEach((arg, index) => {
      const actual = expressionType(arg, locals, parameters);
      if (actual !== signature.args[index]) throw new MetricsCompileError("type", `${node.name} argument ${index + 1} must be ${signature.args[index]}, got ${actual}`, node.line);
    });
    return signature.result;
  }
  throw new MetricsCompileError("type", `unknown expression node '${node.kind}'`, node.line);
}

function checkStatements(body, locals, parameters) {
  let returned = false;
  for (const statement of body) {
    if (statement.kind === "assign") {
      locals[statement.target] = expressionType(statement.value, locals, parameters);
    } else if (statement.kind === "aug_assign") {
      if (!Object.hasOwn(locals, statement.target)) throw new MetricsCompileError("type", `cannot update unknown local '${statement.target}'`, statement.line);
      const result = binaryType(statement.op, locals[statement.target], expressionType(statement.value, locals, parameters), statement.line);
      if (result !== locals[statement.target]) throw new MetricsCompileError("type", `update changes '${statement.target}' type`, statement.line);
    } else if (statement.kind === "for_each") {
      const iterable = expressionType(statement.iterable, locals, parameters);
      if (iterable !== "sequence<agent>") throw new MetricsCompileError("type", "metric loops currently require 'snapshot.agents'", statement.line);
      const nested = { ...locals, [statement.variable]: "agent" };
      checkStatements(statement.body, nested, parameters);
    } else if (statement.kind === "return") {
      const result = expressionType(statement.value, locals, parameters);
      if (result !== "scalar") throw new MetricsCompileError("type", `metric return value must be scalar, got ${result}`, statement.line);
      returned = true;
    }
  }
  return returned;
}

function rewriteMetricAliasExpression(node, collectionAliases, agentAliases) {
  if (!node || typeof node !== "object") return node;

  if (node.kind === "load") {
    if (collectionAliases.has(node.path)) {
      return { ...node, path: "snapshot.agents" };
    }
    const pieces = node.path.split(".");
    const canonicalAgent = agentAliases.get(pieces[0]);
    if (canonicalAgent) {
      return { ...node, path: [canonicalAgent, ...pieces.slice(1)].join(".") };
    }
    return node;
  }

  if (node.kind === "unary") {
    return { ...node, value: rewriteMetricAliasExpression(node.value, collectionAliases, agentAliases) };
  }
  if (node.kind === "binary") {
    return {
      ...node,
      left: rewriteMetricAliasExpression(node.left, collectionAliases, agentAliases),
      right: rewriteMetricAliasExpression(node.right, collectionAliases, agentAliases),
    };
  }
  if (node.kind === "call") {
    return {
      ...node,
      args: node.args.map((arg) => rewriteMetricAliasExpression(arg, collectionAliases, agentAliases)),
    };
  }
  return node;
}

function lowerMetricIterableAliases(body, collectionAliases = new Set(), agentAliases = new Map()) {
  const lowered = [];

  for (const statement of body) {
    if (statement.kind === "assign") {
      const source = statement.value?.kind === "load" ? statement.value.path : null;
      if (source === "snapshot.agents" || collectionAliases.has(source)) {
        collectionAliases.add(statement.target);
        agentAliases.delete(statement.target);
        continue;
      }

      const canonicalAgent = source ? agentAliases.get(source) : null;
      if (canonicalAgent) {
        agentAliases.set(statement.target, canonicalAgent);
        collectionAliases.delete(statement.target);
        continue;
      }

      collectionAliases.delete(statement.target);
      agentAliases.delete(statement.target);
      lowered.push({
        ...statement,
        value: rewriteMetricAliasExpression(statement.value, collectionAliases, agentAliases),
      });
      continue;
    }

    if (statement.kind === "aug_assign") {
      collectionAliases.delete(statement.target);
      agentAliases.delete(statement.target);
      lowered.push({
        ...statement,
        value: rewriteMetricAliasExpression(statement.value, collectionAliases, agentAliases),
      });
      continue;
    }

    if (statement.kind === "for_each") {
      const rewrittenIterable = rewriteMetricAliasExpression(statement.iterable, collectionAliases, agentAliases);
      const nestedCollections = new Set(collectionAliases);
      const nestedAgents = new Map(agentAliases);
      nestedAgents.set(statement.variable, statement.variable);
      lowered.push({
        ...statement,
        iterable: rewrittenIterable.kind === "load" && rewrittenIterable.path === "snapshot.agents"
          ? { kind: "load", path: "snapshot.agents", line: rewrittenIterable.line ?? statement.line }
          : rewrittenIterable,
        body: lowerMetricIterableAliases(statement.body, nestedCollections, nestedAgents),
      });
      continue;
    }

    if (statement.kind === "return") {
      lowered.push({
        ...statement,
        value: rewriteMetricAliasExpression(statement.value, collectionAliases, agentAliases),
      });
      continue;
    }

    lowered.push(statement);
  }

  return lowered;
}

function parseMetricFunctions(source, parameters) {
  const lines = sourceLines(source);
  const metrics = [];
  let i = 0;
  while (i < lines.length) {
    const entry = lines[i];
    if (!entry.text || entry.text.startsWith("#")) { i += 1; continue; }
    if (entry.indent !== 0) throw new MetricsCompileError("syntax", "top-level metric declarations must not be indented", entry.line);
    const metadata = parseDecorator(entry.text, entry.line);
    let defIndex = i + 1;
    while (defIndex < lines.length && (!lines[defIndex].text || lines[defIndex].text.startsWith("#"))) defIndex += 1;
    const defEntry = lines[defIndex];
    if (!defEntry) throw new MetricsCompileError("syntax", "@metric must be followed by a metric function", entry.line);
    const defMatch = defEntry.text.match(/^def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*snapshot\s*\)\s*:\s*$/);
    if (!defMatch || defEntry.indent !== 0) throw new MetricsCompileError("syntax", "metric function must have form 'def name(snapshot):'", defEntry.line);
    let bodyIndex = defIndex + 1;
    while (bodyIndex < lines.length && (!lines[bodyIndex].text || lines[bodyIndex].text.startsWith("#"))) bodyIndex += 1;
    const firstBody = lines[bodyIndex];
    if (!firstBody || firstBody.indent <= 0) throw new MetricsCompileError("syntax", "metric function requires an indented body", defEntry.line);
    const parsed = parseStatements(lines, bodyIndex, firstBody.indent);
    const locals = {};
    if (!checkStatements(parsed.body, locals, parameters)) {
      throw new MetricsCompileError("type", `metric '${metadata.id}' must return a scalar`, defEntry.line);
    }
    metrics.push({
      id: metadata.id,
      name: metadata.name,
      unit: metadata.unit,
      sampling: metadata.sampling,
      function: defMatch[1],
      body: lowerMetricIterableAliases(parsed.body),
      source_line: entry.line,
    });
    i = parsed.next;
  }
  return metrics;
}

export function compileMetrics(source, { parameters = {} } = {}) {
  if (typeof source !== "string") throw new MetricsCompileError("syntax", "Metrics source must be a string");
  const parameterTypes = {};
  for (const [name, type] of Object.entries(parameters)) {
    if (type !== "scalar") throw new MetricsCompileError("type", `metric parameter '${name}' must be scalar`);
    parameterTypes[name] = "scalar";
  }
  const metrics = parseMetricFunctions(source, parameterTypes);
  const ids = new Set();
  const functions = new Set();
  for (const metric of metrics) {
    if (ids.has(metric.id)) throw new MetricsCompileError("metric-id", `duplicate metric id '${metric.id}'`, metric.source_line);
    if (functions.has(metric.function)) throw new MetricsCompileError("syntax", `duplicate metric function '${metric.function}'`, metric.source_line);
    ids.add(metric.id);
    functions.add(metric.function);
  }
  return {
    language: METRICS_LANGUAGE,
    schema: METRICS_IR_SCHEMA,
    measurement_phase: METRIC_MEASUREMENT_PHASE,
    observation_contract: {
      mode: "read-only-global-snapshot",
      fields: ["snapshot.scientific_time", "snapshot.agent_count", "snapshot.agents[].position", "snapshot.agents[].heading", "snapshot.agents[].heading_angle"],
    },
    metrics,
  };
}
