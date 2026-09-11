const FORBIDDEN_ROOTS = new Set([
  "random", "rng", "seed", "world", "simulator", "environment", "agents", "filesystem", "network",
]);

const CALL_SIGNATURES = {
  Vec2: { args: ["scalar", "scalar"], result: "vec2" },
  dot: { args: ["vec2", "vec2"], result: "scalar" },
  perpendicular: { args: ["vec2"], result: "vec2" },
  norm: { args: ["vec2"], result: "scalar" },
  pow: { args: ["scalar", "scalar"], result: "scalar" },
  Motion: { args: ["scalar", "scalar"], result: "action" },
};

export class ControllerCompileError extends Error {
  constructor(category, message, line = null, column = null) {
    const location = line == null ? "" : `line ${line}${column == null ? "" : `:${column}`}: `;
    super(`${location}${category}: ${message}`);
    this.name = "ControllerCompileError";
    this.category = category;
    this.line = line;
    this.column = column;
  }
}

function indentation(raw, line) {
  const leading = raw.match(/^[\t ]*/)?.[0] ?? "";
  if (leading.includes("\t")) throw new ControllerCompileError("syntax", "tabs are not supported; use spaces", line, 1);
  return leading.length;
}

function meaningfulLines(source) {
  return source.split(/\r?\n/).map((raw, index) => ({
    raw,
    line: index + 1,
    indent: indentation(raw, index + 1),
    text: raw.trim(),
  })).filter((entry) => entry.text && !entry.text.startsWith("#"));
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
      throw new ControllerCompileError("syntax", `unsupported token '${c}'`, this.line, i + 1);
    }
    tokens.push({ type: "eof", value: "", column: text.length + 1 });
    return tokens;
  }

  peek(type) { return this.tokens[this.index].type === type; }
  take(type) {
    const token = this.tokens[this.index];
    if (token.type !== type) {
      throw new ControllerCompileError("syntax", `expected '${type}', found '${token.value || "end of expression"}'`, this.line, token.column);
    }
    this.index += 1;
    return token;
  }

  parse() {
    const node = this.additive();
    this.take("eof");
    return node;
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
    if (this.peek("-")) {
      this.take("-");
      return { kind: "unary", op: "-", value: this.unary(), line: this.line };
    }
    return this.primary();
  }

  primary() {
    if (this.peek("number")) return { kind: "const", value: Number(this.take("number").value), line: this.line };
    if (this.peek("(")) {
      this.take("(");
      const node = this.additive();
      this.take(")");
      return node;
    }
    if (!this.peek("ident")) {
      const token = this.tokens[this.index];
      throw new ControllerCompileError("syntax", `expected expression, found '${token.value || "end of expression"}'`, this.line, token.column);
    }

    const parts = [this.take("ident").value];
    while (this.peek(".")) {
      this.take(".");
      parts.push(this.take("ident").value);
    }
    const path = parts.join(".");
    if (FORBIDDEN_ROOTS.has(parts[0])) {
      throw new ControllerCompileError("forbidden-capability", `'${parts[0]}' is outside the controller information boundary`, this.line);
    }

    if (this.peek("(")) {
      if (parts.length !== 1 || !CALL_SIGNATURES[parts[0]]) {
        throw new ControllerCompileError("unsupported-feature", `call '${path}' is not in python-vlab/0.1`, this.line);
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
  if (/^self\.[A-Za-z_][A-Za-z0-9_]*$/.test(text)) return text;
  throw new ControllerCompileError("unsupported-feature", `assignment target '${text}' is not supported`, line);
}

function parseStatements(lines, start, blockIndent) {
  const body = [];
  let i = start;
  while (i < lines.length) {
    const entry = lines[i];
    if (entry.indent < blockIndent) break;
    if (entry.indent > blockIndent) throw new ControllerCompileError("syntax", "unexpected indentation", entry.line);

    const forMatch = entry.text.match(/^for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+(.+):$/);
    if (forMatch) {
      const next = lines[i + 1];
      if (!next || next.indent <= blockIndent) throw new ControllerCompileError("syntax", "for loop requires an indented body", entry.line);
      const nested = parseStatements(lines, i + 1, next.indent);
      body.push({ kind: "for_each", variable: forMatch[1], iterable: parseExpr(forMatch[2], entry.line), body: nested.body, line: entry.line });
      i = nested.next;
      continue;
    }

    const returnMatch = entry.text.match(/^return\s+(.+)$/);
    if (returnMatch) {
      body.push({ kind: "return", value: parseExpr(returnMatch[1], entry.line), line: entry.line });
      i += 1;
      continue;
    }

    const augMatch = entry.text.match(/^(.+?)\s*\+=\s*(.+)$/);
    if (augMatch) {
      body.push({ kind: "aug_assign", target: parseTarget(augMatch[1].trim(), entry.line), op: "+", value: parseExpr(augMatch[2], entry.line), line: entry.line });
      i += 1;
      continue;
    }

    const assignMatch = entry.text.match(/^(.+?)\s*=\s*(.+)$/);
    if (assignMatch) {
      body.push({ kind: "assign", target: parseTarget(assignMatch[1].trim(), entry.line), value: parseExpr(assignMatch[2], entry.line), line: entry.line });
      i += 1;
      continue;
    }

    throw new ControllerCompileError("unsupported-feature", `statement '${entry.text}' is not in python-vlab/0.1`, entry.line);
  }
  return { body, next: i };
}

function binaryType(op, left, right, line) {
  if ((op === "+" || op === "-") && left === right && (left === "scalar" || left === "vec2")) return left;
  if (op === "*" && left === "scalar" && right === "scalar") return "scalar";
  if (op === "*" && ((left === "scalar" && right === "vec2") || (left === "vec2" && right === "scalar"))) return "vec2";
  if (op === "/" && left === "scalar" && right === "scalar") return "scalar";
  if (op === "/" && left === "vec2" && right === "scalar") return "vec2";
  throw new ControllerCompileError("type", `operator '${op}' cannot combine ${left} and ${right}`, line);
}

function inferExpression(expr, scope) {
  if (expr.kind === "const") return "scalar";
  if (expr.kind === "unary") {
    const type = inferExpression(expr.value, scope);
    if (type !== "scalar" && type !== "vec2") throw new ControllerCompileError("type", `unary '-' does not accept ${type}`, expr.line);
    return type;
  }
  if (expr.kind === "binary") return binaryType(expr.op, inferExpression(expr.left, scope), inferExpression(expr.right, scope), expr.line);
  if (expr.kind === "call") {
    const signature = CALL_SIGNATURES[expr.name];
    if (expr.args.length !== signature.args.length) {
      throw new ControllerCompileError("type", `${expr.name} expects ${signature.args.length} arguments, got ${expr.args.length}`, expr.line);
    }
    expr.args.forEach((arg, index) => {
      const actual = inferExpression(arg, scope);
      const expected = signature.args[index];
      if (actual !== expected) throw new ControllerCompileError("type", `${expr.name} argument ${index + 1} expects ${expected}, got ${actual}`, expr.line);
    });
    return signature.result;
  }
  if (expr.kind === "load") {
    if (expr.path === "obs.heading") return "vec2";
    if (expr.path === "obs.neighbours") return "neighbours";
    if (expr.path.startsWith("obs.")) throw new ControllerCompileError("invalid-observation-field", `unknown observation field '${expr.path}'`, expr.line);
    if (expr.path.startsWith("self.")) {
      const name = expr.path.slice(5);
      const type = scope.state.get(name);
      if (!type) throw new ControllerCompileError("invalid-private-state", `private state '${name}' was not declared on the class`, expr.line);
      return type;
    }
    const pieces = expr.path.split(".");
    if (pieces.length === 2 && scope.loopVariables.get(pieces[0]) === "neighbour") {
      if (pieces[1] === "relative_position") return "vec2";
      throw new ControllerCompileError("invalid-observation-field", `unknown neighbour field '${pieces[1]}'`, expr.line);
    }
    if (pieces.length > 1) throw new ControllerCompileError("invalid-observation-field", `field path '${expr.path}' is not available`, expr.line);
    if (scope.locals.has(expr.path)) return scope.locals.get(expr.path);
    if (scope.parameters.has(expr.path)) return scope.parameters.get(expr.path);
    if (FORBIDDEN_ROOTS.has(expr.path)) throw new ControllerCompileError("forbidden-capability", `'${expr.path}' is outside the controller information boundary`, expr.line);
    throw new ControllerCompileError("type", `unknown identifier '${expr.path}'`, expr.line);
  }
  throw new ControllerCompileError("internal", `unknown expression node '${expr.kind}'`, expr.line);
}

function targetType(target, scope, line, forAssignment = false) {
  if (target.startsWith("self.")) {
    const name = target.slice(5);
    const type = scope.state.get(name);
    if (!type) throw new ControllerCompileError("invalid-private-state", `private state '${name}' was not declared on the class`, line);
    return type;
  }
  if (scope.parameters.has(target) || target === "obs" || scope.loopVariables.has(target)) {
    throw new ControllerCompileError("forbidden-capability", `cannot assign to scientific input '${target}'`, line);
  }
  return scope.locals.get(target) ?? (forAssignment ? null : undefined);
}

function checkStatements(body, scope) {
  let returnsAction = false;
  for (const statement of body) {
    if (statement.kind === "assign") {
      const valueType = inferExpression(statement.value, scope);
      const current = targetType(statement.target, scope, statement.line, true);
      if (current && current !== valueType) throw new ControllerCompileError("type", `assignment to '${statement.target}' changes type from ${current} to ${valueType}`, statement.line);
      if (statement.target.startsWith("self.")) {
        if (current !== valueType) throw new ControllerCompileError("type", `private state '${statement.target}' expects ${current}, got ${valueType}`, statement.line);
      } else scope.locals.set(statement.target, valueType);
    } else if (statement.kind === "aug_assign") {
      const current = targetType(statement.target, scope, statement.line, false);
      if (!current) throw new ControllerCompileError("type", `augmented assignment target '${statement.target}' must already exist`, statement.line);
      const valueType = inferExpression(statement.value, scope);
      const result = binaryType(statement.op, current, valueType, statement.line);
      if (result !== current) throw new ControllerCompileError("type", `augmented assignment changes '${statement.target}' type`, statement.line);
    } else if (statement.kind === "for_each") {
      const iterableType = inferExpression(statement.iterable, scope);
      if (iterableType !== "neighbours") throw new ControllerCompileError("type", `for loop requires neighbours, got ${iterableType}`, statement.line);
      if (scope.loopVariables.size) throw new ControllerCompileError("unsupported-feature", "nested neighbour loops are not in python-vlab/0.1", statement.line);
      const nested = {
        parameters: scope.parameters,
        state: scope.state,
        locals: new Map(scope.locals),
        loopVariables: new Map([[statement.variable, "neighbour"]]),
      };
      const nestedReturns = checkStatements(statement.body, nested);
      for (const [name, type] of scope.locals) {
        if (nested.locals.has(name) && nested.locals.get(name) !== type) throw new ControllerCompileError("type", `loop changes '${name}' type`, statement.line);
      }
      returnsAction ||= nestedReturns;
    } else if (statement.kind === "return") {
      const type = inferExpression(statement.value, scope);
      if (type !== "action") throw new ControllerCompileError("type", `step must return Motion/action, got ${type}`, statement.line);
      returnsAction = true;
    }
  }
  return returnsAction;
}

function parseClassState(lines, start, classIndent) {
  const state = [];
  let i = start;
  while (i < lines.length && lines[i].text !== "def step(self, obs):") {
    const entry = lines[i];
    if (entry.indent !== classIndent) throw new ControllerCompileError("syntax", "class members must use one consistent indentation level", entry.line);
    const match = entry.text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(-?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?)$/);
    if (!match) throw new ControllerCompileError("unsupported-feature", "Round 1 private state declarations must be scalar numeric class attributes", entry.line);
    state.push({ name: match[1], type: "scalar", initial: Number(match[2]), line: entry.line });
    i += 1;
  }
  return { state, next: i };
}

export function compileController(source, options = {}) {
  const parameterObject = options.parameters ?? {};
  const parameters = new Map(Object.entries(parameterObject));
  for (const [name, type] of parameters) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new ControllerCompileError("configuration", `invalid parameter name '${name}'`);
    if (type !== "scalar") throw new ControllerCompileError("configuration", `python-vlab/0.1 parameter '${name}' must be scalar`);
  }

  const lines = meaningfulLines(source);
  if (lines.length < 3) throw new ControllerCompileError("syntax", "controller requires class, step method, and body");
  const classMatch = lines[0].text.match(/^class\s+([A-Za-z_][A-Za-z0-9_]*)\(Agent\):$/);
  if (!classMatch || lines[0].indent !== 0) throw new ControllerCompileError("syntax", "controller must start with 'class Name(Agent):'", lines[0].line);

  const classIndent = lines[1].indent;
  if (classIndent <= 0) throw new ControllerCompileError("syntax", "class body must be indented", lines[1].line);
  const parsedState = parseClassState(lines, 1, classIndent);
  const method = lines[parsedState.next];
  if (!method || method.indent !== classIndent || method.text !== "def step(self, obs):") {
    throw new ControllerCompileError("syntax", "controller entry point must be 'def step(self, obs):'", method?.line ?? lines.at(-1).line);
  }

  const firstStatement = lines[parsedState.next + 1];
  if (!firstStatement || firstStatement.indent <= method.indent) throw new ControllerCompileError("syntax", "step method requires an indented body", method.line);
  const parsed = parseStatements(lines, parsedState.next + 1, firstStatement.indent);
  if (parsed.next !== lines.length) throw new ControllerCompileError("syntax", "unexpected content after step body", lines[parsed.next].line);

  const stateMap = new Map(parsedState.state.map((entry) => [entry.name, entry.type]));
  if (stateMap.size !== parsedState.state.length) throw new ControllerCompileError("type", "private state names must be unique");
  const scope = { parameters, state: stateMap, locals: new Map(), loopVariables: new Map() };
  if (!checkStatements(parsed.body, scope)) throw new ControllerCompileError("type", "step method must return a Motion/action");

  return {
    schema: "vlab.controller-ir/0.1",
    language: "python-vlab/0.1",
    controller: classMatch[1],
    entry: "step",
    parameters: Object.fromEntries(parameters),
    state: parsedState.state.map(({ name, type, initial }) => ({ name, type, initial })),
    body: parsed.body,
  };
}
