export class InitializerCompileError extends Error {
  constructor(message, line = null) {
    super(line == null ? message : `line ${line}: ${message}`);
    this.name = "InitializerCompileError";
    this.line = line;
  }
}

const MASK64 = (1n << 64n) - 1n;
const SPLITMIX_GAMMA = 0x9E3779B97F4A7C15n;
const SPLITMIX_MUL1 = 0xBF58476D1CE4E5B9n;
const SPLITMIX_MUL2 = 0x94D049BB133111EBn;
const TWO_POW_53 = 9007199254740992;

class SimulatorRng {
  constructor(seed) {
    if (!Number.isInteger(seed) || seed < 0) throw new InitializerCompileError("SEED must be a non-negative integer");
    this.state = BigInt(seed) & MASK64;
  }

  nextU64() {
    this.state = (this.state + SPLITMIX_GAMMA) & MASK64;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * SPLITMIX_MUL1) & MASK64;
    z = ((z ^ (z >> 27n)) * SPLITMIX_MUL2) & MASK64;
    return (z ^ (z >> 31n)) & MASK64;
  }

  unit() {
    return Number(this.nextU64() >> 11n) / TWO_POW_53;
  }

  uniform(a, b) {
    if (!Number.isFinite(a) || !Number.isFinite(b)) throw new InitializerCompileError("rng.uniform bounds must be finite");
    return a + (b - a) * this.unit();
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

function meaningful(source) {
  return source.split(/\r?\n/).map((raw, index) => {
    const withoutComment = stripComment(raw);
    const leading = withoutComment.match(/^[ ]*/)?.[0] ?? "";
    if (/^\s*\t/.test(raw)) throw new InitializerCompileError("tabs are not supported; use spaces", index + 1);
    return { line: index + 1, indent: leading.length, text: withoutComment.trim() };
  }).filter((entry) => entry.text);
}

function tokenize(text, line) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) { i += 1; continue; }
    const two = text.slice(i, i + 2);
    if (["//", "==", "!=", "<=", ">="].includes(two)) {
      tokens.push({ type: two, value: two, column: i + 1 }); i += 2; continue;
    }
    const number = text.slice(i).match(/^(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?/);
    if (number) { tokens.push({ type: "number", value: number[0], column: i + 1 }); i += number[0].length; continue; }
    const ident = text.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (ident) { tokens.push({ type: "ident", value: ident[0], column: i + 1 }); i += ident[0].length; continue; }
    if (c === '"' || c === "'") {
      const quote = c; let j = i + 1; let value = "";
      while (j < text.length && text[j] !== quote) {
        if (text[j] === "\\" && j + 1 < text.length) { value += text[j + 1]; j += 2; }
        else { value += text[j]; j += 1; }
      }
      if (j >= text.length) throw new InitializerCompileError("unterminated string literal", line);
      tokens.push({ type: "string", value, column: i + 1 }); i = j + 1; continue;
    }
    if ("+-*/%(),.<>".includes(c)) { tokens.push({ type: c, value: c, column: i + 1 }); i += 1; continue; }
    throw new InitializerCompileError(`unsupported token '${c}'`, line);
  }
  tokens.push({ type: "eof", value: "", column: text.length + 1 });
  return tokens;
}

class ExprParser {
  constructor(text, line) { this.tokens = tokenize(text, line); this.index = 0; this.line = line; }
  current() { return this.tokens[this.index]; }
  peek(type) { return this.current().type === type; }
  take(type) {
    const token = this.current();
    if (token.type !== type) throw new InitializerCompileError(`expected '${type}', found '${token.value || "end of expression"}'`, this.line);
    this.index += 1; return token;
  }
  parse() { const expr = this.comparison(); this.take("eof"); return expr; }
  comparison() {
    let left = this.additive();
    if (["==", "!=", "<", "<=", ">", ">="].includes(this.current().type)) {
      const op = this.current().type; this.index += 1; return { kind: "binary", op, left, right: this.additive(), line: this.line };
    }
    return left;
  }
  additive() {
    let left = this.multiplicative();
    while (this.peek("+") || this.peek("-")) { const op = this.current().type; this.index += 1; left = { kind: "binary", op, left, right: this.multiplicative(), line: this.line }; }
    return left;
  }
  multiplicative() {
    let left = this.unary();
    while (["*", "/", "//", "%"].includes(this.current().type)) { const op = this.current().type; this.index += 1; left = { kind: "binary", op, left, right: this.unary(), line: this.line }; }
    return left;
  }
  unary() {
    if (this.peek("+") || this.peek("-")) { const op = this.current().type; this.index += 1; return { kind: "unary", op, value: this.unary(), line: this.line }; }
    return this.primary();
  }
  primary() {
    if (this.peek("number")) return { kind: "literal", value: Number(this.take("number").value), line: this.line };
    if (this.peek("string")) return { kind: "literal", value: this.take("string").value, line: this.line };
    if (this.peek("(")) { this.take("("); const expr = this.comparison(); this.take(")"); return expr; }
    if (!this.peek("ident")) throw new InitializerCompileError(`expected expression, found '${this.current().value || "end"}'`, this.line);
    const parts = [this.take("ident").value];
    while (this.peek(".")) { this.take("."); parts.push(this.take("ident").value); }
    if (this.peek("(")) {
      this.take("("); const args = [];
      if (!this.peek(")")) {
        do { args.push(this.comparison()); if (!this.peek(",")) break; this.take(","); } while (!this.peek(")"));
      }
      this.take(")"); return { kind: "call", path: parts.join("."), args, line: this.line };
    }
    return { kind: "load", path: parts.join("."), line: this.line };
  }
}

function parseExpr(text, line) { return new ExprParser(text, line).parse(); }

function parseBlock(lines, start, indent) {
  const body = [];
  let i = start;
  while (i < lines.length) {
    const entry = lines[i];
    if (entry.indent < indent) break;
    if (entry.indent > indent) throw new InitializerCompileError("unexpected indentation", entry.line);
    if (/^(elif\b|else:)/.test(entry.text)) break;

    const forMatch = entry.text.match(/^for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+(.+):$/);
    if (forMatch) {
      const next = lines[i + 1];
      if (!next || next.indent <= indent) throw new InitializerCompileError("for loop requires an indented body", entry.line);
      const nested = parseBlock(lines, i + 1, next.indent);
      body.push({ kind: "for", variable: forMatch[1], iterable: parseExpr(forMatch[2], entry.line), body: nested.body, line: entry.line });
      i = nested.next; continue;
    }

    const ifMatch = entry.text.match(/^if\s+(.+):$/);
    if (ifMatch) {
      const next = lines[i + 1];
      if (!next || next.indent <= indent) throw new InitializerCompileError("if requires an indented body", entry.line);
      const first = parseBlock(lines, i + 1, next.indent);
      const branches = [{ condition: parseExpr(ifMatch[1], entry.line), body: first.body, line: entry.line }];
      i = first.next;
      let otherwise = null;
      while (i < lines.length && lines[i].indent === indent) {
        const elifMatch = lines[i].text.match(/^elif\s+(.+):$/);
        if (elifMatch) {
          const branchLine = lines[i]; const child = lines[i + 1];
          if (!child || child.indent <= indent) throw new InitializerCompileError("elif requires an indented body", branchLine.line);
          const parsed = parseBlock(lines, i + 1, child.indent);
          branches.push({ condition: parseExpr(elifMatch[1], branchLine.line), body: parsed.body, line: branchLine.line });
          i = parsed.next; continue;
        }
        if (lines[i].text === "else:") {
          const branchLine = lines[i]; const child = lines[i + 1];
          if (!child || child.indent <= indent) throw new InitializerCompileError("else requires an indented body", branchLine.line);
          const parsed = parseBlock(lines, i + 1, child.indent);
          otherwise = parsed.body; i = parsed.next;
        }
        break;
      }
      body.push({ kind: "if", branches, otherwise, line: entry.line });
      continue;
    }

    const augMatch = entry.text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\+=\s*(.+)$/);
    if (augMatch) { body.push({ kind: "aug", name: augMatch[1], value: parseExpr(augMatch[2], entry.line), line: entry.line }); i += 1; continue; }
    const assignMatch = entry.text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (assignMatch) { body.push({ kind: "assign", name: assignMatch[1], value: parseExpr(assignMatch[2], entry.line), line: entry.line }); i += 1; continue; }
    if (entry.text === "return") { body.push({ kind: "return", value: null, line: entry.line }); i += 1; continue; }
    const returnMatch = entry.text.match(/^return\s+(.+)$/);
    if (returnMatch) { body.push({ kind: "return", value: parseExpr(returnMatch[1], entry.line), line: entry.line }); i += 1; continue; }
    body.push({ kind: "expr", value: parseExpr(entry.text, entry.line), line: entry.line }); i += 1;
  }
  return { body, next: i };
}

function parseProgram(source) {
  const lines = meaningful(source);
  const functions = new Map();
  let i = 0;
  while (i < lines.length) {
    const entry = lines[i];
    const match = entry.text.match(/^def\s+([A-Za-z_][A-Za-z0-9_]*)\(([^)]*)\):$/);
    if (!match || entry.indent !== 0) throw new InitializerCompileError("top-level initializer source must contain function definitions", entry.line);
    const params = match[2].split(",").map((part) => part.trim()).filter(Boolean);
    if (functions.has(match[1])) throw new InitializerCompileError(`duplicate function '${match[1]}'`, entry.line);
    const next = lines[i + 1];
    if (!next || next.indent <= 0) throw new InitializerCompileError(`function '${match[1]}' requires a body`, entry.line);
    const parsed = parseBlock(lines, i + 1, next.indent);
    functions.set(match[1], { name: match[1], params, body: parsed.body, line: entry.line });
    i = parsed.next;
  }
  if (!functions.has("initialize")) throw new InitializerCompileError("initializer source must define initialize(config, rng, place)");
  return functions;
}

function pythonTruthy(value) { return Boolean(value); }

function binary(op, a, b, line) {
  switch (op) {
    case "+": return a + b; case "-": return a - b; case "*": return a * b; case "/": return a / b;
    case "//": return Math.floor(a / b); case "%": return ((a % b) + b) % b;
    case "==": return a === b; case "!=": return a !== b; case "<": return a < b; case "<=": return a <= b; case ">": return a > b; case ">=": return a >= b;
    default: throw new InitializerCompileError(`unsupported operator '${op}'`, line);
  }
}

function evaluate(expr, scope) {
  if (expr.kind === "literal") return expr.value;
  if (expr.kind === "unary") { const v = evaluate(expr.value, scope); return expr.op === "-" ? -v : +v; }
  if (expr.kind === "binary") return binary(expr.op, evaluate(expr.left, scope), evaluate(expr.right, scope), expr.line);
  if (expr.kind === "load") {
    if (expr.path === "TAU") return Math.PI * 2;
    if (expr.path === "SQRT3_OVER_2") return Math.sqrt(3) / 2;
    if (expr.path === "True") return true;
    if (expr.path === "False") return false;
    if (expr.path === "None") return null;
    if (expr.path.startsWith("config.")) {
      const name = expr.path.slice(7);
      if (!Object.prototype.hasOwnProperty.call(scope.config.values, name)) throw new InitializerCompileError(`unknown config parameter '${name}'`, expr.line);
      return scope.config.values[name];
    }
    if (scope.locals.has(expr.path)) return scope.locals.get(expr.path);
    if (expr.path === "config") return scope.config;
    if (expr.path === "rng") return scope.rng;
    if (expr.path === "place") return scope.place;
    throw new InitializerCompileError(`unknown identifier '${expr.path}'`, expr.line);
  }
  if (expr.kind === "call") {
    const args = expr.args.map((arg) => evaluate(arg, scope));
    if (expr.path === "sqrt") return Math.sqrt(args[0]);
    if (expr.path === "ceil") return Math.ceil(args[0]);
    if (expr.path === "floor") return Math.floor(args[0]);
    if (expr.path === "abs") return Math.abs(args[0]);
    if (expr.path === "max") return Math.max(...args);
    if (expr.path === "min") return Math.min(...args);
    if (expr.path === "range") {
      let start = 0, stop, step = 1;
      if (args.length === 1) [stop] = args;
      else if (args.length === 2) [start, stop] = args;
      else if (args.length === 3) [start, stop, step] = args;
      else throw new InitializerCompileError("range expects 1, 2 or 3 arguments", expr.line);
      if (![start, stop, step].every(Number.isInteger) || step === 0) throw new InitializerCompileError("range arguments must be integers and step must be nonzero", expr.line);
      const result = [];
      if (step > 0) for (let v = start; v < stop; v += step) result.push(v);
      else for (let v = start; v > stop; v += step) result.push(v);
      return result;
    }
    if (expr.path === "rng.uniform") {
      if (args.length !== 2) throw new InitializerCompileError("rng.uniform expects two arguments", expr.line);
      return scope.rng.uniform(args[0], args[1]);
    }
    if (expr.path === "place") { scope.place(...args); return null; }
    if (scope.functions.has(expr.path)) return executeFunction(expr.path, args, scope);
    throw new InitializerCompileError(`unsupported call '${expr.path}'`, expr.line);
  }
  throw new InitializerCompileError(`unknown expression node '${expr.kind}'`, expr.line);
}

function executeBlock(body, scope) {
  for (const statement of body) {
    if (statement.kind === "assign") scope.locals.set(statement.name, evaluate(statement.value, scope));
    else if (statement.kind === "aug") {
      if (!scope.locals.has(statement.name)) throw new InitializerCompileError(`'${statement.name}' must exist before +=`, statement.line);
      scope.locals.set(statement.name, scope.locals.get(statement.name) + evaluate(statement.value, scope));
    } else if (statement.kind === "expr") evaluate(statement.value, scope);
    else if (statement.kind === "for") {
      const iterable = evaluate(statement.iterable, scope);
      if (!Array.isArray(iterable)) throw new InitializerCompileError("for loop currently requires range(...)", statement.line);
      for (const value of iterable) { scope.locals.set(statement.variable, value); const result = executeBlock(statement.body, scope); if (result?.returned) return result; }
    } else if (statement.kind === "if") {
      let chosen = statement.otherwise;
      for (const branch of statement.branches) { if (pythonTruthy(evaluate(branch.condition, scope))) { chosen = branch.body; break; } }
      if (chosen) { const result = executeBlock(chosen, scope); if (result?.returned) return result; }
    } else if (statement.kind === "return") return { returned: true, value: statement.value ? evaluate(statement.value, scope) : null };
  }
  return null;
}

function executeFunction(name, args, parent) {
  const fn = parent.functions.get(name);
  if (!fn) throw new InitializerCompileError(`unknown function '${name}'`);
  if (args.length !== fn.params.length) throw new InitializerCompileError(`${name} expects ${fn.params.length} arguments, got ${args.length}`, fn.line);
  const locals = new Map(fn.params.map((param, index) => [param, args[index]]));
  const scope = { ...parent, locals };
  const result = executeBlock(fn.body, scope);
  return result?.value ?? null;
}

export function compileInitializer(source, config) {
  const functions = parseProgram(source);
  const n = config.values.N;
  const seed = config.values.SEED;
  if (!Number.isInteger(n) || n <= 0) throw new InitializerCompileError("N must be a positive integer");
  const rng = new SimulatorRng(seed);
  const state = new Array(n);
  const place = (index, x, y, heading) => {
    if (!Number.isInteger(index) || index < 0 || index >= n) throw new InitializerCompileError(`place index ${index} is outside [0, N)`);
    if ([x, y, heading].some((value) => typeof value !== "number" || !Number.isFinite(value))) throw new InitializerCompileError("place coordinates and heading must be finite numbers");
    if (state[index] !== undefined) throw new InitializerCompileError(`agent ${index} was placed more than once`);
    state[index] = { x, y, heading };
  };
  const root = { functions, config, rng, place, locals: new Map() };
  executeFunction("initialize", [config, rng, place], root);
  const missing = state.findIndex((entry) => entry === undefined);
  if (missing !== -1) throw new InitializerCompileError(`initializer did not place agent ${missing}; all N agents must be placed`);
  return { version: "vlab.initializer-state/0.2", method: String(config.values.INITIALIZATION_METHOD ?? ""), state };
}
