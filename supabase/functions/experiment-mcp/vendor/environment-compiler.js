import { stripComment } from "../authoring-core/lines.js";
import { ExpressionParser, tokenize } from "../authoring-core/expression.js";

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

// The environment field's expression grammar on the shared core (#576):
// arithmetic, unary +/- and ** over x, y, constants, config values and
// scalar intrinsics; no comparisons.
function parseScalarExpression(text, line, config) {
  const tokens = tokenize(text, {
    operators: ["**", "+", "-", "*", "/", "(", ")", ",", "."],
    fail: (_kind, { character }) => { throw new EnvironmentCompileError(`unsupported token '${character}' in environmental_scalar`, line, "unsupported-feature"); },
  });
  return new ExpressionParser(tokens, line, {
    start: "additive",
    comparisons: [],
    multiplicative: ["*", "/"],
    unary: ["+", "-"],
    nodes: {
      binary: (op, left, right) => ({ kind: "binary", op, left, right }),
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
      if (path.startsWith("config.")) {
        const name = path.slice(7);
        const value = config.values[name];
        if (typeof value !== "number" || !Number.isFinite(value)) {
          throw new EnvironmentCompileError(`environmental_scalar config parameter '${name}' must be a finite numeric value`, line);
        }
        return { kind: "const", value };
      }
      throw new EnvironmentCompileError(`identifier '${path}' is not available to environmental_scalar`, line, "forbidden-capability");
    },
  }).parse();
}

export function compileEnvironmentScalar(initializerSource, config) {
  const definition = environmentFunction(initializerSource);
  if (!definition) return null;
  return {
    schema: "vlab.environment-scalar-ir/0.1",
    language: "python-vlab/0.1",
    entry: "environmental_scalar(x, y, config)",
    expression: parseScalarExpression(definition.expression, definition.line, config),
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
