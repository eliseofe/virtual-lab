import { parseStatementBlock } from "../authoring-core/statements.js";
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

// Initialization's expression grammar on the shared core (#576): boolean
// and/or/not (#577), arithmetic including // and %, unary +/-, one comparison,
// strings.
const INITIALIZER_GRAMMAR = {
  start: "or",
  comparisons: ["==", "!=", "<", "<=", ">", ">="],
  multiplicative: ["*", "/", "//", "%"],
  unary: ["+", "-"],
  nodes: {
    binary: (op, left, right, line) => ({ kind: "binary", op, left, right, line }),
    compare: (op, left, right, line) => ({ kind: "binary", op, left, right, line }),
    bool: (op, left, right, line) => ({ kind: "bool_op", op, left, right, line }),
    not: (value, line) => ({ kind: "unary", op: "not", value, line }),
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

// Initialization's statements on the shared parser (#577): the same if/for/
// assignment rules as the Controller and Metrics, plus call statements and a
// bare return.
const STATEMENTS = {
  error: (_category, message, line) => new InitializerCompileError(message, line),
  expression: (text, line) => parseExpr(text, line),
  target(text, line) {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) return text;
    throw new InitializerCompileError(`assignment target '${text}' is not supported`, line);
  },
  unsupported: (text) => `statement '${text}' is not supported`,
  bareReturn: true,
  identifierTargets: true,
  expressionStatement: (text, line) => parseExpr(text, line),
};

function parseBlock(lines, start, indent) {
  return parseStatementBlock(lines, start, indent, STATEMENTS);
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

function booleanOperand(op, value, line) {
  if (typeof value !== "boolean") throw new InitializerCompileError(`'${op}' requires boolean operands`, line);
  return value;
}

function evaluate(expr, scope) {
  if (expr.kind === "literal") return expr.value;
  if (expr.kind === "unary") {
    const v = evaluate(expr.value, scope);
    if (expr.op === "not") return !booleanOperand("not", v, expr.line);
    return expr.op === "-" ? -v : +v;
  }
  // As in the Controller and Metrics, both sides are always evaluated (#577).
  if (expr.kind === "bool_op") {
    const left = booleanOperand(expr.op, evaluate(expr.left, scope), expr.line);
    const right = booleanOperand(expr.op, evaluate(expr.right, scope), expr.line);
    return expr.op === "and" ? left && right : left || right;
  }
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
    if (statement.kind === "assign") scope.locals.set(statement.target, evaluate(statement.value, scope));
    else if (statement.kind === "aug_assign") {
      if (!scope.locals.has(statement.target)) throw new InitializerCompileError(`'${statement.target}' must exist before +=`, statement.line);
      scope.locals.set(statement.target, scope.locals.get(statement.target) + evaluate(statement.value, scope));
    } else if (statement.kind === "expr") evaluate(statement.value, scope);
    else if (statement.kind === "for_each") {
      const iterable = evaluate(statement.iterable, scope);
      if (!Array.isArray(iterable)) throw new InitializerCompileError("for loop currently requires range(...)", statement.line);
      for (const value of iterable) { scope.locals.set(statement.variable, value); const result = executeBlock(statement.body, scope); if (result?.returned) return result; }
    } else if (statement.kind === "if") {
      let chosen = statement.else_body;
      for (const branch of statement.branches) { if (pythonTruthy(evaluate(branch.condition, scope))) { chosen = branch.body; break; } }
      const result = executeBlock(chosen, scope); if (result?.returned) return result;
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


// Static type checking of Initialization (#577, D-021), before it runs:
// the same rules as the Controller and Metrics. A name keeps one type, is
// assigned before use on every path, conditions are booleans, and calls take
// the right number and types of arguments. Helper functions are checked for
// the argument types they are called with, starting from initialize, so code
// that is never called is only parsed. The evaluator below is unchanged:
// a program that passes behaves exactly as before.
const SCALAR_INTRINSICS = new Map([
  ...["sqrt", "exp", "log", "sin", "cos", "tan", "asin", "acos", "atan", "ceil", "floor", "abs"].map((name) => [name, 1]),
  ["atan2", 2],
  ["pow", 2],
]);
const EFFECT_SIGNATURES = new Map([
  ["place", ["scalar", "scalar", "scalar", "scalar"]],
  ["set_agent_state", ["scalar", "string", "scalar"]],
  ["define_reference", ["string", "scalar", "scalar"]],
  ["set_agent_reference_sensor", ["scalar", "string", "scalar|none"]],
]);

function valueType(value) {
  if (typeof value === "number") return "scalar";
  if (typeof value === "boolean") return "bool";
  if (typeof value === "string") return "string";
  if (value === null || value === undefined) return "none";
  return "unknown";
}

function typeError(message, line) {
  return new InitializerCompileError(message, line);
}

function checkInitializerTypes(functions, config) {
  const instances = new Map();
  const active = new Set();

  function callFunction(name, argTypes, line) {
    const fn = functions.get(name);
    if (argTypes.length !== fn.params.length) throw typeError(`${name} expects ${fn.params.length} arguments, got ${argTypes.length}`, line);
    const key = `${name}(${argTypes.join(",")})`;
    if (instances.has(key)) return instances.get(key);
    if (active.has(name)) throw typeError(`recursive call to '${name}' is not supported`, line);
    active.add(name);
    const locals = new Map(fn.params.map((param, index) => [param, argTypes[index]]));
    const returns = new Set();
    const falls = checkBlock(fn.body, locals, returns);
    if (falls) returns.add("none");
    active.delete(name);
    if (returns.size > 1) throw typeError(`function '${name}' returns different types: ${[...returns].sort().join(", ")}`, fn.line);
    const result = [...returns][0] ?? "none";
    instances.set(key, result);
    return result;
  }

  // Returns true when execution can continue after the block.
  function checkBlock(body, locals, returns) {
    for (const statement of body) {
      if (statement.kind === "assign") {
        const type = expressionType(statement.value, locals);
        const previous = locals.get(statement.target);
        if (previous && previous !== type) throw typeError(`'${statement.target}' changes type from ${previous} to ${type}`, statement.line);
        locals.set(statement.target, type);
      } else if (statement.kind === "aug_assign") {
        const current = locals.get(statement.target);
        if (!current) throw typeError(`'${statement.target}' must exist before +=`, statement.line);
        const result = binaryType("+", current, expressionType(statement.value, locals), statement.line);
        if (result !== current) throw typeError(`'${statement.target}' changes type from ${current} to ${result}`, statement.line);
      } else if (statement.kind === "expr") {
        expressionType(statement.value, locals);
      } else if (statement.kind === "for_each") {
        const iterable = expressionType(statement.iterable, locals);
        if (iterable !== "range") throw typeError("for loop currently requires range(...)", statement.line);
        const nested = new Map(locals);
        const previous = nested.get(statement.variable);
        if (previous && previous !== "scalar") throw typeError(`'${statement.variable}' changes type from ${previous} to scalar`, statement.line);
        nested.set(statement.variable, "scalar");
        checkBlock(statement.body, nested, returns);
        for (const [name, type] of nested) {
          if (locals.has(name) && locals.get(name) !== type) throw typeError(`loop changes '${name}' type`, statement.line);
        }
      } else if (statement.kind === "if") {
        const continuing = [];
        for (const branch of statement.branches) {
          const condition = expressionType(branch.condition, locals);
          if (condition !== "bool") throw typeError(`if/elif condition must be bool, got ${condition}`, branch.line);
          const nested = new Map(locals);
          if (checkBlock(branch.body, nested, returns)) continuing.push(nested);
        }
        const nested = new Map(locals);
        if (checkBlock(statement.else_body, nested, returns)) continuing.push(nested);
        if (!continuing.length) return false;
        // Names assigned on every continuing path, with one type, stay defined.
        for (const [name, type] of continuing[0]) {
          if (locals.has(name)) continue;
          if (continuing.every((scope) => scope.get(name) === type)) locals.set(name, type);
        }
      } else if (statement.kind === "return") {
        returns.add(statement.value ? expressionType(statement.value, locals) : "none");
        return false;
      }
    }
    return true;
  }

  function binaryType(op, left, right, line) {
    if (left === "scalar" && right === "scalar") return "scalar";
    if (op === "+" && left === "string" && right === "string") return "string";
    throw typeError(`operator '${op}' cannot combine ${left} and ${right}`, line);
  }

  function expressionType(expr, locals) {
    if (expr.kind === "literal") return valueType(expr.value);
    if (expr.kind === "unary") {
      const type = expressionType(expr.value, locals);
      if (expr.op === "not") {
        if (type !== "bool") throw typeError(`'not' requires bool, got ${type}`, expr.line);
        return "bool";
      }
      if (type !== "scalar") throw typeError(`unary '${expr.op}' cannot apply to ${type}`, expr.line);
      return "scalar";
    }
    if (expr.kind === "bool_op") {
      for (const side of [expr.left, expr.right]) {
        const type = expressionType(side, locals);
        if (type !== "bool") throw typeError(`'${expr.op}' requires bool, got ${type}`, expr.line);
      }
      return "bool";
    }
    if (expr.kind === "binary") {
      const left = expressionType(expr.left, locals);
      const right = expressionType(expr.right, locals);
      if (["==", "!="].includes(expr.op)) {
        if (left !== right && left !== "none" && right !== "none") throw typeError(`'${expr.op}' cannot compare ${left} and ${right}`, expr.line);
        return "bool";
      }
      if (["<", "<=", ">", ">="].includes(expr.op)) {
        if (left !== "scalar" || right !== "scalar") throw typeError(`'${expr.op}' cannot compare ${left} and ${right}`, expr.line);
        return "bool";
      }
      return binaryType(expr.op, left, right, expr.line);
    }
    if (expr.kind === "load") {
      if (expr.path === "TAU" || expr.path === "SQRT3_OVER_2") return "scalar";
      if (expr.path === "True" || expr.path === "False") return "bool";
      if (expr.path === "None") return "none";
      if (expr.path.startsWith("config.")) {
        const name = expr.path.slice(7);
        if (!Object.prototype.hasOwnProperty.call(config.values, name)) throw typeError(`unknown config parameter '${name}'`, expr.line);
        return valueType(config.values[name]);
      }
      if (locals.has(expr.path)) return locals.get(expr.path);
      if (expr.path === "config" || expr.path === "rng" || expr.path === "place") return expr.path;
      throw typeError(`unknown identifier '${expr.path}'`, expr.line);
    }
    if (expr.kind === "call") {
      const args = expr.args.map((arg) => expressionType(arg, locals));
      const expect = (types) => {
        if (args.length !== types.length) throw typeError(`${expr.path} expects ${types.length} arguments, got ${args.length}`, expr.line);
        types.forEach((type, index) => {
          if (!type.split("|").includes(args[index])) throw typeError(`${expr.path} argument ${index + 1} must be ${type.replace("|", " or ")}, got ${args[index]}`, expr.line);
        });
      };
      if (SCALAR_INTRINSICS.has(expr.path)) { expect(Array(SCALAR_INTRINSICS.get(expr.path)).fill("scalar")); return "scalar"; }
      if (expr.path === "min" || expr.path === "max") {
        if (!args.length) throw typeError(`${expr.path} expects at least one argument`, expr.line);
        expect(Array(args.length).fill("scalar"));
        return "scalar";
      }
      if (expr.path === "range") {
        if (args.length < 1 || args.length > 3) throw typeError("range expects 1, 2 or 3 arguments", expr.line);
        expect(Array(args.length).fill("scalar"));
        return "range";
      }
      if (expr.path === "rng.uniform") { expect(["scalar", "scalar"]); return "scalar"; }
      if (EFFECT_SIGNATURES.has(expr.path)) { expect(EFFECT_SIGNATURES.get(expr.path)); return "none"; }
      if (functions.has(expr.path)) return callFunction(expr.path, args, expr.line);
      throw typeError(`unsupported call '${expr.path}'`, expr.line);
    }
    throw typeError(`unknown expression node '${expr.kind}'`, expr.line);
  }

  callFunction("initialize", ["config", "rng", "place"], functions.get("initialize").line);
}

export function compileInitializer(source, config) {
  const functions = parseProgram(source);
  checkInitializerTypes(functions, config);
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
