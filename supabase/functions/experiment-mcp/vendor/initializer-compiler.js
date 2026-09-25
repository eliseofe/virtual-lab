import { stripComment } from "../authoring-core/lines.js";
import { ExpressionParser, tokenize } from "../authoring-core/expression.js";
import { RNG_DOMAINS, ScientificRng } from "./rng.js";

export class InitializerCompileError extends Error {
  constructor(message, line = null) {
    super(line == null ? message : `line ${line}: ${message}`);
    this.name = "InitializerCompileError";
    this.line = line;
  }
}

function meaningful(source) {
  return source.split(/\r?\n/).map((raw, index) => {
    const withoutComment = stripComment(raw);
    const leading = withoutComment.match(/^[ ]*/)?.[0] ?? "";
    if (/^\s*\t/.test(raw)) throw new InitializerCompileError("tabs are not supported; use spaces", index + 1);
    return { line: index + 1, indent: leading.length, text: withoutComment.trim() };
  }).filter((entry) => entry.text);
}

// Initialization's expression grammar on the shared core (#576): arithmetic
// including // and %, unary +/-, one comparison, strings; no boolean operators.
const INITIALIZER_GRAMMAR = {
  start: "comparison",
  comparisons: ["==", "!=", "<", "<=", ">", ">="],
  multiplicative: ["*", "/", "//", "%"],
  unary: ["+", "-"],
  nodes: {
    binary: (op, left, right, line) => ({ kind: "binary", op, left, right, line }),
    compare: (op, left, right, line) => ({ kind: "binary", op, left, right, line }),
    unary: (op, value, line) => ({ kind: "unary", op, value, line }),
    power: (left, right, line) => ({ kind: "binary", op: "**", left, right, line }),
  },
};

function parseExpr(text, line) {
  const tokens = tokenize(text, {
    operators: ["**", "//", "==", "!=", "<=", ">=", "+", "-", "*", "/", "%", "(", ")", ",", ".", "<", ">"],
    strings: true,
    fail: (kind, detail) => {
      throw new InitializerCompileError(kind === "unterminated" ? "unterminated string literal" : `unsupported token '${detail.character}'`, line);
    },
  });
  return new ExpressionParser(tokens, line, {
    ...INITIALIZER_GRAMMAR,
    error: (message) => new InitializerCompileError(message, line),
    unexpected: (token) => new InitializerCompileError(`expected expression, found '${token.value || "end"}'`, line),
    primary(parser) {
      if (parser.peek("number")) {
        const value = Number(parser.take("number").value);
        if (!Number.isFinite(value)) throw new InitializerCompileError("numeric constants must be finite", line);
        return { kind: "literal", value, line };
      }
      if (parser.peek("string")) return { kind: "literal", value: parser.take("string").value, line };
      return undefined;
    },
    identifier(parser, first) {
      const path = parser.dotted(first).join(".");
      if (parser.peek("(")) return { kind: "call", path, args: parser.callArguments(), line };
      return { kind: "load", path, line };
    },
  }).parse();
}

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

export function initializerStructure(source) {
  const functions = parseProgram(source);
  return {
    language: "python-vlab-initializer/0.1",
    symbols: [...functions.values()].map((fn) => ({
      kind: "function",
      name: fn.name,
      line: fn.line,
      params: [...fn.params],
    })),
  };
}

function pythonTruthy(value) { return Boolean(value); }

function binary(op, a, b, line) {
  switch (op) {
    case "+": return a + b; case "-": return a - b; case "*": return a * b; case "/": return a / b; case "**": return Math.pow(a, b);
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
    if (expr.path === "exp") return Math.exp(args[0]);
    if (expr.path === "log") return Math.log(args[0]);
    if (expr.path === "sin") return Math.sin(args[0]);
    if (expr.path === "cos") return Math.cos(args[0]);
    if (expr.path === "tan") return Math.tan(args[0]);
    if (expr.path === "asin") return Math.asin(args[0]);
    if (expr.path === "acos") return Math.acos(args[0]);
    if (expr.path === "atan") return Math.atan(args[0]);
    if (expr.path === "atan2") return Math.atan2(args[0], args[1]);
    if (expr.path === "ceil") return Math.ceil(args[0]);
    if (expr.path === "floor") return Math.floor(args[0]);
    if (expr.path === "abs") return Math.abs(args[0]);
    if (expr.path === "pow") return Math.pow(args[0], args[1]);
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
      try {
        return scope.rng.uniform(args[0], args[1]);
      } catch (error) {
        throw new InitializerCompileError(error instanceof Error ? error.message : String(error), expr.line);
      }
    }
    if (expr.path === "place") { scope.place(...args); return null; }
    if (expr.path === "set_agent_state") { scope.setAgentState(...args); return null; }
    if (expr.path === "define_reference") { scope.defineReference(...args); return null; }
    if (expr.path === "set_agent_reference_sensor") { scope.setAgentReferenceSensor(...args); return null; }
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
  let rng;
  try {
    rng = ScientificRng.forDomain(seed, RNG_DOMAINS.initialization);
  } catch (error) {
    throw new InitializerCompileError(error instanceof Error ? error.message : String(error));
  }
  const state = new Array(n);
  const privateState = Array.from({ length: n }, () => new Map());
  const references = new Map();
  const referenceSensors = Array.from({ length: n }, () => new Map());
  const place = (index, x, y, heading) => {
    if (!Number.isInteger(index) || index < 0 || index >= n) throw new InitializerCompileError(`place index ${index} is outside [0, N)`);
    if ([x, y, heading].some((value) => typeof value !== "number" || !Number.isFinite(value))) throw new InitializerCompileError("place coordinates and heading must be finite numbers");
    if (state[index] !== undefined) throw new InitializerCompileError(`agent ${index} was placed more than once`);
    state[index] = { x, y, heading };
  };
  const setAgentState = (index, name, value) => {
    if (!Number.isInteger(index) || index < 0 || index >= n) throw new InitializerCompileError(`set_agent_state index ${index} is outside [0, N)`);
    if (typeof name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new InitializerCompileError("set_agent_state field name must be an identifier string");
    if (typeof value !== "number" || !Number.isFinite(value)) throw new InitializerCompileError("set_agent_state value must be a finite scalar");
    if (privateState[index].has(name)) throw new InitializerCompileError(`agent ${index} private state '${name}' was assigned more than once`);
    privateState[index].set(name, value);
  };
  const defineReference = (name, x, y) => {
    if (typeof name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new InitializerCompileError("define_reference name must be an identifier string");
    }
    if ([x, y].some((value) => typeof value !== "number" || !Number.isFinite(value))) {
      throw new InitializerCompileError("define_reference coordinates must be finite numbers");
    }
    const arenaSize = Number(config.values.ARENA_SIZE);
    if (Number.isFinite(arenaSize) && arenaSize > 0 && (Math.abs(x) > arenaSize / 2 || Math.abs(y) > arenaSize / 2)) {
      throw new InitializerCompileError(`reference '${name}' must fit inside ARENA_SIZE=${arenaSize}`);
    }
    if (references.has(name)) throw new InitializerCompileError(`reference '${name}' was defined more than once`);
    references.set(name, { x, y });
  };
  const setAgentReferenceSensor = (index, name, maxRange) => {
    if (!Number.isInteger(index) || index < 0 || index >= n) {
      throw new InitializerCompileError(`set_agent_reference_sensor index ${index} is outside [0, N)`);
    }
    if (typeof name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new InitializerCompileError("set_agent_reference_sensor reference name must be an identifier string");
    }
    if (maxRange !== null && (typeof maxRange !== "number" || !Number.isFinite(maxRange) || maxRange <= 0)) {
      throw new InitializerCompileError("set_agent_reference_sensor max_range must be None or a finite positive scalar");
    }
    if (referenceSensors[index].has(name)) {
      throw new InitializerCompileError(`agent ${index} reference sensor '${name}' was assigned more than once`);
    }
    referenceSensors[index].set(name, maxRange);
  };
  const root = {
    functions,
    config,
    rng,
    place,
    setAgentState,
    defineReference,
    setAgentReferenceSensor,
    locals: new Map(),
  };
  executeFunction("initialize", [config, rng, place], root);
  const missing = state.findIndex((entry) => entry === undefined);
  if (missing !== -1) throw new InitializerCompileError(`initializer did not place agent ${missing}; all N agents must be placed`);
  for (let agentIndex = 0; agentIndex < referenceSensors.length; agentIndex += 1) {
    for (const name of referenceSensors[agentIndex].keys()) {
      if (!references.has(name)) {
        throw new InitializerCompileError(`agent ${agentIndex} reference sensor '${name}' names an undefined reference`);
      }
    }
  }
  const compiledState = state.map((agent, index) => privateState[index].size
    ? { ...agent, private_state: Object.fromEntries(privateState[index]) }
    : agent);
  const compareNames = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  const worldReferences = {
    schema: "vlab.world-references/0.1",
    references: [...references.entries()]
      .sort(([a], [b]) => compareNames(a, b))
      .map(([name, position]) => ({ name, ...position })),
    sensors: referenceSensors.flatMap((sensors, agent_index) =>
      [...sensors.entries()]
        .sort(([a], [b]) => compareNames(a, b))
        .map(([name, max_range]) => ({ agent_index, name, max_range }))),
  };
  return {
    version: "vlab.initializer-state/0.4",
    method: String(config.values.INITIALIZATION_METHOD ?? ""),
    state: compiledState,
    world_references: worldReferences,
  };
}

export function validateInitializerControllerPrivateState(initializer, controller) {
  const declarations = new Map((controller?.state ?? []).map((entry) => [entry.name, entry.type]));
  for (let index = 0; index < (initializer?.state ?? []).length; index += 1) {
    const profile = initializer.state[index]?.private_state;
    if (profile === undefined) continue;
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
      throw new InitializerCompileError(`agent ${index} private_state must be an object`);
    }
    for (const [name, value] of Object.entries(profile)) {
      if (!declarations.has(name)) {
        const error = new InitializerCompileError(`agent ${index} assigns undeclared controller private state '${name}'`);
        error.category = "invalid-private-state";
        throw error;
      }
      if (declarations.get(name) !== "scalar") {
        const error = new InitializerCompileError(`agent ${index} private state '${name}' is not scalar`);
        error.category = "invalid-private-state";
        throw error;
      }
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new InitializerCompileError(`agent ${index} private state '${name}' must be a finite scalar`);
      }
    }
  }
  return initializer;
}
