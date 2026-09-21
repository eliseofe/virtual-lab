import { IMPLEMENTED_CAPABILITY_BINDINGS } from "../capability-bindings.js";

const SECURITY_FORBIDDEN_ROOTS = new Set(["filesystem", "network"]);

const LANGUAGE_CALL_SIGNATURES = {
  Vec2: { args: ["scalar", "scalar"], result: "vec2" },
  dot: { args: ["vec2", "vec2"], result: "scalar" },
  perpendicular: { args: ["vec2"], result: "vec2" },
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

const CONTROLLER_CAPABILITY_SURFACES = IMPLEMENTED_CAPABILITY_BINDINGS.flatMap((binding) =>
  binding.surfaces
    .filter((surface) => surface.artifact === "controller")
    .map((surface) => ({ ...surface, capability_key: binding.capability_key }))
);

const OBSERVATION_TYPES = new Map(
  CONTROLLER_CAPABILITY_SURFACES
    .filter((surface) => surface.kind === "observation" && surface.symbol.startsWith("obs."))
    .map((surface) => [surface.symbol, surface.value_type]),
);

const NEIGHBOUR_FIELD_TYPES = new Map(
  CONTROLLER_CAPABILITY_SURFACES
    .filter((surface) => surface.kind === "observation" && surface.symbol.startsWith("neighbour."))
    .map((surface) => [surface.symbol.slice("neighbour.".length), surface.value_type]),
);

const CAPABILITY_CALL_SIGNATURES = Object.fromEntries(
  CONTROLLER_CAPABILITY_SURFACES
    .filter((surface) => surface.signature)
    .map((surface) => [surface.symbol, surface.signature]),
);

const PRIVATE_SCALAR_STATE_ENABLED = CONTROLLER_CAPABILITY_SURFACES.some(
  (surface) => surface.kind === "private_state" && surface.value_type === "scalar",
);

const CALL_SIGNATURES = {
  ...LANGUAGE_CALL_SIGNATURES,
  ...CAPABILITY_CALL_SIGNATURES,
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
      const power = text.slice(i).match(/^\*\*/);
      if (power) {
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
      throw new ControllerCompileError("syntax", `unsupported token '${c}'`, this.line, i + 1);
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
      throw new ControllerCompileError("syntax", `expected '${value}', found '${token.value || "end of expression"}'`, this.line, token.column);
    }
    this.index += 1;
    return token;
  }
  take(type) {
    const token = this.tokens[this.index];
    if (token.type !== type) {
      throw new ControllerCompileError("syntax", `expected '${type}', found '${token.value || "end of expression"}'`, this.line, token.column);
    }
    this.index += 1;
    return token;
  }

  parse() {
    const node = this.booleanOr();
    this.take("eof");
    return node;
  }

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
    if (this.peek("-")) {
      this.take("-");
      return { kind: "unary", op: "-", value: this.unary(), line: this.line };
    }
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
      if (!Number.isFinite(value)) throw new ControllerCompileError("syntax", "numeric constants must be finite", this.line, token.column);
      return { kind: "const", value, line: this.line };
    }
    if (this.peek("(")) {
      this.take("(");
      const node = this.booleanOr();
      this.take(")");
      return node;
    }
    if (!this.peek("ident")) {
      const token = this.tokens[this.index];
      throw new ControllerCompileError("syntax", `expected expression, found '${token.value || "end of expression"}'`, this.line, token.column);
    }

    const first = this.take("ident").value;
    if (first === "True" || first === "False") {
      return { kind: "bool_const", value: first === "True", line: this.line };
    }
    const parts = [first];
    while (this.peek(".")) {
      this.take(".");
      parts.push(this.take("ident").value);
    }
    const path = parts.join(".");
    if (SECURITY_FORBIDDEN_ROOTS.has(parts[0])) {
      throw new ControllerCompileError("forbidden-capability", `'${parts[0]}' is outside the controller security boundary`, this.line);
    }

    if (this.peek("(")) {
      if (!CALL_SIGNATURES[path]) {
        const category = parts.length > 1 ? "unsupported-capability" : "unsupported-feature";
        throw new ControllerCompileError(category, `call '${path}' is not available in python-vlab/0.1`, this.line);
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
      return { kind: "call", name: path, args, line: this.line };
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

    const ifMatch = entry.text.match(/^if\s+(.+):$/);
    if (ifMatch) {
      const branches = [];
      let elseBody = [];
      let headerIndex = i;
      let conditionText = ifMatch[1];
      const statementLine = entry.line;

      for (;;) {
        const header = lines[headerIndex];
        const next = lines[headerIndex + 1];
        if (!next || next.indent <= blockIndent) {
          throw new ControllerCompileError("syntax", "if/elif requires an indented body", header.line);
        }
        const nested = parseStatements(lines, headerIndex + 1, next.indent);
        branches.push({
          condition: parseExpr(conditionText, header.line),
          body: nested.body,
          line: header.line,
        });

        let cursor = nested.next;
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
          const elseFirst = lines[cursor + 1];
          if (!elseFirst || elseFirst.indent <= blockIndent) {
            throw new ControllerCompileError("syntax", "else requires an indented body", continuation.line);
          }
          const parsedElse = parseStatements(lines, cursor + 1, elseFirst.indent);
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
  if (expr.kind === "bool_const") return "bool";
  if (expr.kind === "unary") {
    const type = inferExpression(expr.value, scope);
    if (expr.op === "not") {
      if (type !== "bool") throw new ControllerCompileError("type", `'not' requires bool, got ${type}`, expr.line);
      return "bool";
    }
    if (expr.op !== "-") throw new ControllerCompileError("type", `unsupported unary operator '${expr.op}'`, expr.line);
    if (type !== "scalar" && type !== "vec2") throw new ControllerCompileError("type", `unary '-' does not accept ${type}`, expr.line);
    return type;
  }
  if (expr.kind === "compare") {
    const left = inferExpression(expr.left, scope);
    const right = inferExpression(expr.right, scope);
    if (left !== "scalar" || right !== "scalar") {
      throw new ControllerCompileError("type", `comparison '${expr.op}' requires scalar operands, got ${left} and ${right}`, expr.line);
    }
    return "bool";
  }
  if (expr.kind === "bool_op") {
    const left = inferExpression(expr.left, scope);
    const right = inferExpression(expr.right, scope);
    if (left !== "bool" || right !== "bool") {
      throw new ControllerCompileError("type", `boolean '${expr.op}' requires bool operands, got ${left} and ${right}`, expr.line);
    }
    return "bool";
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
    if (OBSERVATION_TYPES.has(expr.path)) return OBSERVATION_TYPES.get(expr.path);
    if (expr.path.startsWith("obs.")) {
      throw new ControllerCompileError("invalid-observation-field", `observation capability '${expr.path}' is not implemented`, expr.line);
    }
    if (expr.path.startsWith("self.")) {
      const name = expr.path.slice(5);
      const type = scope.state.get(name);
      if (!type) throw new ControllerCompileError("invalid-private-state", `private state '${name}' was not declared on the class`, expr.line);
      return type;
    }
    const pieces = expr.path.split(".");
    if (pieces.length === 2 && scope.loopVariables.get(pieces[0]) === "neighbour") {
      const fieldType = NEIGHBOUR_FIELD_TYPES.get(pieces[1]);
      if (fieldType) return fieldType;
      throw new ControllerCompileError("invalid-observation-field", `neighbour observation capability '${pieces[1]}' is not implemented`, expr.line);
    }
    if (pieces.length > 1) {
      throw new ControllerCompileError("unsupported-capability", `controller capability surface '${expr.path}' is not implemented`, expr.line);
    }
    if (scope.locals.has(expr.path)) return scope.locals.get(expr.path);
    if (scope.parameters.has(expr.path)) return scope.parameters.get(expr.path);
    if (SECURITY_FORBIDDEN_ROOTS.has(expr.path)) {
      throw new ControllerCompileError("forbidden-capability", `'${expr.path}' is outside the controller security boundary`, expr.line);
    }
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

function intersectLocalTypes(scopes) {
  if (!scopes.length) return new Map();
  const merged = new Map(scopes[0].locals);
  for (const [name, type] of [...merged]) {
    if (!scopes.every((scope) => scope.locals.get(name) === type)) merged.delete(name);
  }
  return merged;
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
      checkStatements(statement.body, nested);
      for (const [name, type] of scope.locals) {
        if (nested.locals.has(name) && nested.locals.get(name) !== type) throw new ControllerCompileError("type", `loop changes '${name}' type`, statement.line);
      }
    } else if (statement.kind === "if") {
      const continuingScopes = [];
      let allBranchesReturn = statement.else_body.length > 0;

      for (const branch of statement.branches) {
        const conditionType = inferExpression(branch.condition, scope);
        if (conditionType !== "bool") throw new ControllerCompileError("type", `if/elif condition must be bool, got ${conditionType}`, branch.line ?? statement.line);
        const nested = {
          parameters: scope.parameters,
          state: scope.state,
          locals: new Map(scope.locals),
          loopVariables: new Map(scope.loopVariables),
        };
        const branchReturns = checkStatements(branch.body, nested);
        if (!branchReturns) continuingScopes.push(nested);
        allBranchesReturn &&= branchReturns;
      }

      if (statement.else_body.length) {
        const nested = {
          parameters: scope.parameters,
          state: scope.state,
          locals: new Map(scope.locals),
          loopVariables: new Map(scope.loopVariables),
        };
        const elseReturns = checkStatements(statement.else_body, nested);
        if (!elseReturns) continuingScopes.push(nested);
        allBranchesReturn &&= elseReturns;
      } else {
        continuingScopes.push({
          parameters: scope.parameters,
          state: scope.state,
          locals: new Map(scope.locals),
          loopVariables: new Map(scope.loopVariables),
        });
      }

      if (continuingScopes.length) scope.locals = intersectLocalTypes(continuingScopes);
      returnsAction ||= allBranchesReturn;
    } else if (statement.kind === "return") {
      const type = inferExpression(statement.value, scope);
      if (type !== "action") throw new ControllerCompileError("type", "step method must return a Motion/action");
      returnsAction = true;
    }
  }
  return returnsAction;
}

function statementsGuaranteeReturn(body) {
  for (const statement of body) {
    if (statement.kind === "return") return true;
    if (statement.kind === "if" && statement.else_body.length > 0) {
      const allBranches = statement.branches.every((branch) => statementsGuaranteeReturn(branch.body));
      if (allBranches && statementsGuaranteeReturn(statement.else_body)) return true;
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

function lowerNeighbourIterableAliasesWithState(body, initialAliases = new Set()) {
  let aliases = new Set(initialAliases);
  const lowered = [];

  for (const statement of body) {
    if (statement.kind === "assign") {
      const source = statement.value?.kind === "load" ? statement.value.path : null;
      if (!statement.target.startsWith("self.") && (source === "obs.neighbours" || aliases.has(source))) {
        aliases.add(statement.target);
        continue;
      }
      aliases.delete(statement.target);
      lowered.push(statement);
      continue;
    }

    if (statement.kind === "aug_assign") {
      aliases.delete(statement.target);
      lowered.push(statement);
      continue;
    }

    if (statement.kind === "for_each") {
      const source = statement.iterable?.kind === "load" ? statement.iterable.path : null;
      const nestedAliases = new Set(aliases);
      nestedAliases.delete(statement.variable);
      const nested = lowerNeighbourIterableAliasesWithState(statement.body, nestedAliases);
      lowered.push({
        ...statement,
        iterable: source === "obs.neighbours" || aliases.has(source)
          ? { kind: "load", path: "obs.neighbours", line: statement.iterable.line ?? statement.line }
          : statement.iterable,
        body: nested.body,
      });
      continue;
    }

    if (statement.kind === "if") {
      const branchResults = statement.branches.map((branch) => ({
        ...branch,
        lowered: lowerNeighbourIterableAliasesWithState(branch.body, aliases),
      }));
      const elseResult = statement.else_body.length
        ? lowerNeighbourIterableAliasesWithState(statement.else_body, aliases)
        : null;

      const continuing = [];
      if (!statement.else_body.length) continuing.push(new Set(aliases));
      for (const branch of branchResults) {
        if (!statementsGuaranteeReturn(branch.body)) continuing.push(branch.lowered.aliases);
      }
      if (elseResult && !statementsGuaranteeReturn(statement.else_body)) continuing.push(elseResult.aliases);
      if (continuing.length) aliases = intersectAliasSets(continuing);

      lowered.push({
        ...statement,
        branches: branchResults.map(({ lowered: result, ...branch }) => ({ ...branch, body: result.body })),
        else_body: elseResult?.body ?? [],
      });
      continue;
    }

    lowered.push(statement);
  }

  return { body: lowered, aliases };
}

function lowerNeighbourIterableAliases(body, aliases = new Set()) {
  return lowerNeighbourIterableAliasesWithState(body, aliases).body;
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

  if (parsedState.state.length > 0 && !PRIVATE_SCALAR_STATE_ENABLED) {
    throw new ControllerCompileError("unsupported-capability", "controller private scalar state is not implemented");
  }
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
    body: lowerNeighbourIterableAliases(parsed.body),
  };
}
