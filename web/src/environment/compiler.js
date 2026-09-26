import { stripComment } from "../authoring-core/lines.js";
import { ExpressionParser, tokenize } from "../authoring-core/expression.js";
import { parseStatementBlock } from "../authoring-core/statements.js";

export class EnvironmentCompileError extends Error {
  constructor(message, line = null, category = "initializer") {
    super(line == null ? message : `line ${line}: ${message}`);
    this.name = "EnvironmentCompileError";
    this.category = category;
    this.line = line;
  }
}

const INTRINSICS = Object.freeze({
  abs: 1,
  sqrt: 1,
  exp: 1,
  log: 1,
  sin: 1,
  cos: 1,
  tan: 1,
  asin: 1,
  acos: 1,
  atan: 1,
  atan2: 2,
  floor: 1,
  ceil: 1,
  pow: 2,
  min: 2,
  max: 2,
});

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

  const lines = [];
  for (let i = start + 1; i < rawLines.length; i += 1) {
    const withoutComment = stripComment(rawLines[i]);
    if (!withoutComment.trim()) continue;
    const indent = withoutComment.match(/^[ ]*/)?.[0].length ?? 0;
    if (/^\s*\t/.test(rawLines[i])) throw new EnvironmentCompileError("tabs are not supported; use spaces", i + 1);
    if (indent === 0 && /^def\s+/.test(withoutComment.trim())) break;
    if (indent === 0) throw new EnvironmentCompileError("environmental_scalar body must be indented", i + 1);
    lines.push({ text: withoutComment.trim(), indent, line: i + 1 });
  }
  if (!lines.length) throw new EnvironmentCompileError("environmental_scalar body must return a scalar expression", headerLine, "unsupported-feature");
  return { lines, line: headerLine };
}

// The environment field's expression grammar on the shared core (#576, #577):
// arithmetic (including // and %), unary +/- and ** over x, y, locals,
// constants, config values and scalar intrinsics; comparisons and
// and/or/not for conditions. Plain names are resolved by the checker below.
function parseScalarExpression(text, line, config) {
  const tokens = tokenize(text, {
    operators: ["**", "//", "<=", ">=", "==", "!=", "<", ">", "+", "-", "*", "/", "%", "(", ")", ",", "."],
    fail: (_kind, { character }) => { throw new EnvironmentCompileError(`unsupported token '${character}' in environmental_scalar`, line, "unsupported-feature"); },
  });
  return new ExpressionParser(tokens, line, {
    start: "or",
    comparisons: ["<", "<=", ">", ">=", "==", "!="],
    multiplicative: ["*", "/", "//", "%"],
    unary: ["+", "-"],
    nodes: {
      binary: (op, left, right) => ({ kind: "binary", op, left, right }),
      compare: (op, left, right) => ({ kind: "compare", op, left, right }),
      bool: (op, left, right) => ({ kind: "bool_op", op, left, right }),
      not: (value) => ({ kind: "not", value }),
      unary: (op, value) => (op === "+" ? value : { kind: "unary", op: "-", value }),
      power: (left, right) => ({ kind: "call", name: "pow", args: [left, right] }),
    },
    error: (message) => new EnvironmentCompileError(message, line),
    unexpected: (token) => new EnvironmentCompileError(`expected scalar expression, found '${token.value || "end"}'`, line),
    primary(parser) {
      if (!parser.peek("number")) return undefined;
      const value = Number(parser.take("number").value);
      if (!Number.isFinite(value)) throw new EnvironmentCompileError("environment scalar constants must be finite", line);
      return { kind: "const", value };
    },
    identifier(parser, first) {
      const parts = parser.dotted(first);
      const path = parts.join(".");
      if (parser.peek("(")) {
        if (parts.length !== 1 || INTRINSICS[parts[0]] === undefined) {
          throw new EnvironmentCompileError(`call '${path}' is not available to environmental_scalar`, line, "unsupported-feature");
        }
        const args = parser.callArguments();
        const arity = INTRINSICS[parts[0]];
        if (args.length !== arity) throw new EnvironmentCompileError(`${parts[0]} expects ${arity} arguments`, line);
        return { kind: "call", name: parts[0], args };
      }
      if (path === "x" || path === "y") return { kind: path };
      if (path === "TAU") return { kind: "const", value: Math.PI * 2 };
      if (path === "SQRT3_OVER_2") return { kind: "const", value: Math.sqrt(3) / 2 };
      if (path === "True" || path === "False") return { kind: "bool_const", value: path === "True" };
      if (path.startsWith("config.")) {
        const name = path.slice(7);
        const value = config.values[name];
        if (typeof value !== "number" || !Number.isFinite(value)) {
          throw new EnvironmentCompileError(`environmental_scalar config parameter '${name}' must be a finite numeric value`, line);
        }
        return { kind: "const", value };
      }
      if (parts.length === 1) return { kind: "name", name: path, line };
      throw new EnvironmentCompileError(`identifier '${path}' is not available to environmental_scalar`, line, "forbidden-capability");
    },
  }).parse();
}

const RESERVED = new Set(["x", "y", "config", "TAU", "SQRT3_OVER_2", "True", "False", ...Object.keys(INTRINSICS)]);

// Types, definite assignment and definite return (#577). The field is a pure
// function: locals are scalars or booleans, conditions are booleans, and every
// path returns a scalar. Plain names become { kind: "local" } nodes.
function checkExpression(node, locals, line) {
  switch (node.kind) {
    case "const": case "x": case "y": return "scalar";
    case "bool_const": return "bool";
    case "name": {
      const type = locals.get(node.name);
      if (!type) throw new EnvironmentCompileError(`identifier '${node.name}' is not available to environmental_scalar`, node.line ?? line, "forbidden-capability");
      delete node.line;
      node.kind = "local";
      return type;
    }
    case "unary": {
      if (checkExpression(node.value, locals, line) !== "scalar") throw new EnvironmentCompileError("unary '-' requires a number", line);
      return "scalar";
    }
    case "not": {
      if (checkExpression(node.value, locals, line) !== "bool") throw new EnvironmentCompileError("'not' requires True/False", line);
      return "bool";
    }
    case "binary": {
      if (checkExpression(node.left, locals, line) !== "scalar" || checkExpression(node.right, locals, line) !== "scalar") throw new EnvironmentCompileError(`operator '${node.op}' requires numbers`, line);
      return "scalar";
    }
    case "compare": {
      if (checkExpression(node.left, locals, line) !== "scalar" || checkExpression(node.right, locals, line) !== "scalar") throw new EnvironmentCompileError(`comparison '${node.op}' requires numbers`, line);
      return "bool";
    }
    case "bool_op": {
      if (checkExpression(node.left, locals, line) !== "bool" || checkExpression(node.right, locals, line) !== "bool") throw new EnvironmentCompileError(`'${node.op}' requires True/False operands`, line);
      return "bool";
    }
    case "call": {
      for (const arg of node.args) if (checkExpression(arg, locals, line) !== "scalar") throw new EnvironmentCompileError(`${node.name} requires numbers`, line);
      return "scalar";
    }
    default: throw new EnvironmentCompileError(`unsupported expression '${node.kind}'`, line);
  }
}

// Returns the locals definitely assigned after the block, or null when every
// path has returned.
function checkBlock(body, locals) {
  let current = new Map(locals);
  for (const statement of body) {
    if (current === null) throw new EnvironmentCompileError("statement after return is never reached", statement.line);
    if (statement.kind === "assign") {
      if (RESERVED.has(statement.target)) throw new EnvironmentCompileError(`'${statement.target}' cannot be assigned`, statement.line);
      const type = checkExpression(statement.value, current, statement.line);
      const previous = current.get(statement.target);
      if (previous && previous !== type) throw new EnvironmentCompileError(`assignment changes '${statement.target}' from ${previous} to ${type}`, statement.line);
      current.set(statement.target, type);
    } else if (statement.kind === "aug_assign") {
      if (current.get(statement.target) !== "scalar") throw new EnvironmentCompileError(`'${statement.target}' must be a number assigned before '+='`, statement.line);
      if (checkExpression(statement.value, current, statement.line) !== "scalar") throw new EnvironmentCompileError("'+=' requires a number", statement.line);
    } else if (statement.kind === "return") {
      if (statement.value === null || checkExpression(statement.value, current, statement.line) !== "scalar") throw new EnvironmentCompileError("environmental_scalar must return a number", statement.line);
      current = null;
    } else if (statement.kind === "if") {
      const outcomes = [];
      for (const branch of statement.branches) {
        if (checkExpression(branch.condition, current, branch.line) !== "bool") throw new EnvironmentCompileError("if/elif condition must be True/False, e.g. a comparison", branch.line);
        outcomes.push(checkBlock(branch.body, current));
      }
      outcomes.push(checkBlock(statement.else_body, current));
      const continuing = outcomes.filter((outcome) => outcome !== null);
      if (!continuing.length) current = null;
      else {
        const merged = new Map();
        for (const [name, type] of continuing[0]) if (continuing.every((outcome) => outcome.get(name) === type)) merged.set(name, type);
        current = merged;
      }
    } else {
      throw new EnvironmentCompileError("environmental_scalar supports assignments, +=, if/elif/else and return", statement.line, "unsupported-feature");
    }
  }
  return current;
}

function stripLines(body) {
  for (const statement of body) {
    delete statement.line;
    if (statement.kind === "if") {
      for (const branch of statement.branches) { delete branch.line; stripLines(branch.body); }
      stripLines(statement.else_body);
    }
  }
  return body;
}

export function compileEnvironmentScalar(initializerSource, config) {
  const definition = environmentFunction(initializerSource);
  if (!definition) return null;
  const { body } = parseStatementBlock(definition.lines, 0, definition.lines[0].indent, {
    error: (category, message, line) => new EnvironmentCompileError(message, line, category === "syntax" ? "initializer" : category),
    expression: (text, line) => parseScalarExpression(text, line, config),
    target(text, line) {
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) return text;
      throw new EnvironmentCompileError(`assignment target '${text}' is not supported`, line);
    },
    unsupported: (text) => `statement '${text}' is not supported in environmental_scalar`,
    identifierTargets: true,
  });
  if (body.some((statement) => statement.kind === "for_each")) {
    throw new EnvironmentCompileError("loops are not available in environmental_scalar", body.find((statement) => statement.kind === "for_each").line, "unsupported-feature");
  }
  if (checkBlock(body, new Map()) !== null) {
    throw new EnvironmentCompileError("environmental_scalar must return a number on every path", definition.line, "unsupported-feature");
  }
  const base = { language: "python-vlab/0.1", entry: "environmental_scalar(x, y, config)" };
  // A single return keeps the original IR, so such fields compile to the same
  // simulator input as before #577 release 5.
  if (body.length === 1 && body[0].kind === "return") {
    return { schema: "vlab.environment-scalar-ir/0.1", ...base, expression: body[0].value };
  }
  return { schema: "vlab.environment-scalar-ir/0.2", ...base, body: stripLines(body) };
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
