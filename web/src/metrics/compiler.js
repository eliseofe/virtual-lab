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

export const METRIC_OBSERVATION_FIELDS = [
  "snapshot.scientific_time",
  "snapshot.agent_count",
  "snapshot.agents",
  "snapshot.agents[].position",
  "snapshot.agents[].heading",
  "snapshot.agents[].heading_angle",
];

export function metricsCompletionItems({ parameters = {} } = {}) {
  const items = [
    ...Object.keys(CALL_SIGNATURES).map((value) => ({ value, caption: value, score: 900, meta: "supported function" })),
    ...METRIC_OBSERVATION_FIELDS.map((value) => ({ value, caption: value, score: 1000, meta: "snapshot field" })),
    ...Object.keys(parameters).map((value) => ({ value, caption: value, score: 800, meta: "parameter" })),
  ];
  return [...new Map(items.map((item) => [item.value, item])).values()];
}

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
      const comparison = text.slice(i).match(/^(?:<=|>=|==|!=|<|>)/);
      if (comparison) {
        tokens.push({ type: comparison[0], value: comparison[0], column: i + 1 });
        i += comparison[0].length;
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
  peekKeyword(value) {
    const token = this.tokens[this.index];
    return token.type === "ident" && token.value === value;
  }
  takeKeyword(value) {
    const token = this.tokens[this.index];
    if (token.type !== "ident" || token.value !== value) {
      throw new MetricsCompileError("syntax", `expected '${value}', found '${token.value || "end of expression"}'`, this.line, token.column);
    }
    this.index += 1;
    return token;
  }
  take(type) {
    const token = this.tokens[this.index];
    if (token.type !== type) {
      throw new MetricsCompileError("syntax", `expected '${type}', found '${token.value || "end of expression"}'`, this.line, token.column);
    }
    this.index += 1;
    return token;
  }
  parse() { const node = this.booleanOr(); this.take("eof"); return node; }
  booleanOr() {
    let left = this.booleanAnd();
    while (this.peekKeyword("or")) {
      this.takeKeyword("or");
      left = { kind: "bool_op", op: "or", left, right: this.booleanAnd(), line: this.line };
    }
    return left;
  }
  booleanAnd() {
    let left = this.booleanNot();
    while (this.peekKeyword("and")) {
      this.takeKeyword("and");
      left = { kind: "bool_op", op: "and", left, right: this.booleanNot(), line: this.line };
    }
    return left;
  }
  booleanNot() {
    if (this.peekKeyword("not")) {
      this.takeKeyword("not");
      return { kind: "unary", op: "not", value: this.booleanNot(), line: this.line };
    }
    return this.comparison();
  }
  comparison() {
    let left = this.additive();
    const operators = ["<", "<=", ">", ">=", "==", "!="];
    const token = this.tokens[this.index];
    if (operators.includes(token.type)) {
      this.index += 1;
      left = { kind: "compare", op: token.type, left, right: this.additive(), line: this.line };
    }
    return left;
  }
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
    if (this.peek("(")) { this.take("("); const node = this.booleanOr(); this.take(")"); return node; }
    if (!this.peek("ident")) {
      const token = this.tokens[this.index];
      throw new MetricsCompileError("syntax", `expected expression, found '${token.value || "end of expression"}'`, this.line, token.column);
    }
    const first = this.take("ident").value;
    if (first === "True" || first === "False") {
      return { kind: "bool_const", value: first === "True", line: this.line };
    }
    const parts = [first];
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
          args.push(this.booleanOr());
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

    const ifMatch = entry.text.match(/^if\s+(.+):$/);
    if (ifMatch) {
      const branches = [];
      let elseBody = [];
      let headerIndex = i;
      let conditionText = ifMatch[1];
      const statementLine = entry.line;

      for (;;) {
        const header = lines[headerIndex];
        let nextIndex = headerIndex + 1;
        while (nextIndex < lines.length && (!lines[nextIndex].text || lines[nextIndex].text.startsWith("#"))) nextIndex += 1;
        const next = lines[nextIndex];
        if (!next || next.indent <= blockIndent) {
          throw new MetricsCompileError("syntax", "if/elif requires an indented body", header.line);
        }
        const nested = parseStatements(lines, nextIndex, next.indent);
        branches.push({
          condition: parseExpr(conditionText, header.line),
          body: nested.body,
          line: header.line,
        });

        let cursor = nested.next;
        while (cursor < lines.length && (!lines[cursor].text || lines[cursor].text.startsWith("#"))) cursor += 1;
        const continuation = lines[cursor];
        const elifMatch = continuation?.indent === blockIndent
          ? continuation.text.match(/^elif\s+(.+):$/)
          : null;
        if (elifMatch) {
          headerIndex = cursor;
          conditionText = elifMatch[1];
          continue;
        }

        if (continuation?.indent === blockIndent && continuation.text === "else:") {
          let elseIndex = cursor + 1;
          while (elseIndex < lines.length && (!lines[elseIndex].text || lines[elseIndex].text.startsWith("#"))) elseIndex += 1;
          const elseFirst = lines[elseIndex];
          if (!elseFirst || elseFirst.indent <= blockIndent) {
            throw new MetricsCompileError("syntax", "else requires an indented body", continuation.line);
          }
          const parsedElse = parseStatements(lines, elseIndex, elseFirst.indent);
          elseBody = parsedElse.body;
          cursor = parsedElse.next;
        }

        body.push({ kind: "if", branches, else_body: elseBody, line: statementLine });
        i = cursor;
        break;
      }
      continue;
    }

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
  if (node.kind === "bool_const") return "bool";
  if (node.kind === "load") return loadType(node.path, locals, parameters, node.line);
  if (node.kind === "unary") {
    const type = expressionType(node.value, locals, parameters);
    if (node.op === "not") {
      if (type !== "bool") throw new MetricsCompileError("type", `'not' requires bool, got ${type}`, node.line);
      return "bool";
    }
    if (node.op !== "-") throw new MetricsCompileError("type", `unsupported unary operator '${node.op}'`, node.line);
    if (type !== "scalar" && type !== "vec2") throw new MetricsCompileError("type", `unary '-' cannot apply to ${type}`, node.line);
    return type;
  }
  if (node.kind === "compare") {
    const left = expressionType(node.left, locals, parameters);
    const right = expressionType(node.right, locals, parameters);
    if (left !== "scalar" || right !== "scalar") {
      throw new MetricsCompileError("type", `comparison '${node.op}' requires scalar operands, got ${left} and ${right}`, node.line);
    }
    return "bool";
  }
  if (node.kind === "bool_op") {
    const left = expressionType(node.left, locals, parameters);
    const right = expressionType(node.right, locals, parameters);
    if (left !== "bool" || right !== "bool") {
      throw new MetricsCompileError("type", `boolean '${node.op}' requires bool operands, got ${left} and ${right}`, node.line);
    }
    return "bool";
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

function sameTypeLocals(scopes) {
  if (!scopes.length) return {};
  const merged = { ...scopes[0] };
  for (const name of Object.keys(merged)) {
    if (!scopes.every((scope) => scope[name] === merged[name])) delete merged[name];
  }
  return merged;
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
    } else if (statement.kind === "if") {
      const continuing = [];
      let allReturn = statement.else_body.length > 0;

      for (const branch of statement.branches) {
        const conditionType = expressionType(branch.condition, locals, parameters);
        if (conditionType !== "bool") throw new MetricsCompileError("type", `if/elif condition must be bool, got ${conditionType}`, branch.line ?? statement.line);
        const nested = { ...locals };
        const branchReturns = checkStatements(branch.body, nested, parameters);
        if (!branchReturns) continuing.push(nested);
        allReturn &&= branchReturns;
      }

      if (statement.else_body.length) {
        const nested = { ...locals };
        const elseReturns = checkStatements(statement.else_body, nested, parameters);
        if (!elseReturns) continuing.push(nested);
        allReturn &&= elseReturns;
      } else {
        continuing.push({ ...locals });
      }

      if (continuing.length) {
        const merged = sameTypeLocals(continuing);
        for (const name of Object.keys(locals)) delete locals[name];
        Object.assign(locals, merged);
      }
      returned ||= allReturn;
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
  if (node.kind === "compare" || node.kind === "bool_op") {
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

function statementsGuaranteeMetricReturn(body) {
  for (const statement of body) {
    if (statement.kind === "return") return true;
    if (statement.kind === "if" && statement.else_body.length > 0) {
      const branchesReturn = statement.branches.every((branch) => statementsGuaranteeMetricReturn(branch.body));
      if (branchesReturn && statementsGuaranteeMetricReturn(statement.else_body)) return true;
    }
  }
  return false;
}

function intersectAliasSets(sets) {
  if (!sets.length) return new Set();
  const out = new Set(sets[0]);
  for (const value of [...out]) {
    if (!sets.every((set) => set.has(value))) out.delete(value);
  }
  return out;
}

function intersectAliasMaps(maps) {
  if (!maps.length) return new Map();
  const out = new Map(maps[0]);
  for (const [key, value] of [...out]) {
    if (!maps.every((map) => map.get(key) === value)) out.delete(key);
  }
  return out;
}

function lowerMetricIterableAliasesWithState(body, initialCollections = new Set(), initialAgents = new Map()) {
  let collectionAliases = new Set(initialCollections);
  let agentAliases = new Map(initialAgents);
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
      const nested = lowerMetricIterableAliasesWithState(statement.body, nestedCollections, nestedAgents);
      lowered.push({
        ...statement,
        iterable: rewrittenIterable.kind === "load" && rewrittenIterable.path === "snapshot.agents"
          ? { kind: "load", path: "snapshot.agents", line: rewrittenIterable.line ?? statement.line }
          : rewrittenIterable,
        body: nested.body,
      });
      continue;
    }

    if (statement.kind === "if") {
      const branchResults = statement.branches.map((branch) => {
        const result = lowerMetricIterableAliasesWithState(
          branch.body,
          new Set(collectionAliases),
          new Map(agentAliases),
        );
        return {
          branch: {
            ...branch,
            condition: rewriteMetricAliasExpression(branch.condition, collectionAliases, agentAliases),
            body: result.body,
          },
          result,
        };
      });
      const elseResult = statement.else_body.length
        ? lowerMetricIterableAliasesWithState(
            statement.else_body,
            new Set(collectionAliases),
            new Map(agentAliases),
          )
        : null;

      const continuingCollections = [];
      const continuingAgents = [];
      if (!statement.else_body.length) {
        continuingCollections.push(new Set(collectionAliases));
        continuingAgents.push(new Map(agentAliases));
      }
      for (const { branch, result } of branchResults) {
        if (!statementsGuaranteeMetricReturn(branch.body)) {
          continuingCollections.push(result.collectionAliases);
          continuingAgents.push(result.agentAliases);
        }
      }
      if (elseResult && !statementsGuaranteeMetricReturn(statement.else_body)) {
        continuingCollections.push(elseResult.collectionAliases);
        continuingAgents.push(elseResult.agentAliases);
      }
      if (continuingCollections.length) {
        collectionAliases = intersectAliasSets(continuingCollections);
        agentAliases = intersectAliasMaps(continuingAgents);
      }

      lowered.push({
        ...statement,
        branches: branchResults.map(({ branch }) => branch),
        else_body: elseResult?.body ?? [],
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

  return { body: lowered, collectionAliases, agentAliases };
}

function lowerMetricIterableAliases(body, collectionAliases = new Set(), agentAliases = new Map()) {
  return lowerMetricIterableAliasesWithState(body, collectionAliases, agentAliases).body;
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

export function metricsStructure(source) {
  if (typeof source !== "string") throw new MetricsCompileError("syntax", "Metrics source must be a string");
  const lines = sourceLines(source);
  const symbols = [];
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
    symbols.push({
      kind: "metric",
      name: metadata.name || metadata.id,
      id: metadata.id,
      function: defMatch[1],
      line: defEntry.line,
      metadataLine: entry.line,
    });
    i = parsed.next;
  }
  return { language: METRICS_LANGUAGE, symbols };
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
      fields: [...METRIC_OBSERVATION_FIELDS.filter((field) => field !== "snapshot.agents")],
    },
    metrics,
  };
}
