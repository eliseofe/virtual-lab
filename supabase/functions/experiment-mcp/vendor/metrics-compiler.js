import { checkRangeCall, isRangeCall } from "../authoring-core/ranges.js";
import { indentedLines, intersectSets } from "../authoring-core/lines.js";
import { parseStatementBlock } from "../authoring-core/statements.js";
import { parseTypedExpression } from "../authoring-core/expression.js";
import { IMPLEMENTED_CAPABILITY_BINDINGS } from "../capability-bindings.js";

const FORBIDDEN_ROOTS = new Set([
  "random", "rng", "seed", "controller", "world", "simulator", "environment",
  "filesystem", "network", "actions", "actuators",
]);

const LANGUAGE_CALL_SIGNATURES = {
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

const METRICS_CAPABILITY_SURFACES = IMPLEMENTED_CAPABILITY_BINDINGS.flatMap((binding) =>
  binding.surfaces
    .filter((surface) => surface.artifact === "metrics")
    .map((surface) => ({ ...surface, capability_key: binding.capability_key }))
);

const STATIC_SNAPSHOT_TYPES = new Map(
  METRICS_CAPABILITY_SURFACES
    .filter((surface) => surface.kind === "snapshot" && !surface.symbol.includes("<"))
    .map((surface) => [surface.symbol, surface.value_type]),
);

const AGENT_FIELD_TYPES = new Map(
  METRICS_CAPABILITY_SURFACES
    .filter((surface) => surface.kind === "snapshot_field" && surface.symbol.startsWith("agent."))
    .map((surface) => [surface.symbol.slice("agent.".length), surface.value_type]),
);

const SNAPSHOT_INTRINSIC_SURFACES = new Map(
  METRICS_CAPABILITY_SURFACES
    .filter((surface) => surface.kind === "snapshot_intrinsic" && surface.signature)
    .map((surface) => [surface.symbol, surface]),
);

const CALL_SIGNATURES = {
  ...LANGUAGE_CALL_SIGNATURES,
  ...Object.fromEntries([...SNAPSHOT_INTRINSIC_SURFACES].map(([name, surface]) => [name, surface.signature])),
};

export const METRICS_LANGUAGE = "python-vlab-metrics/0.1";
export const METRICS_IR_SCHEMA = "vlab.metrics-ir/0.1";
export const METRIC_MEASUREMENT_PHASE = "post-physics-wrapped-state/1";

export const METRIC_OBSERVATION_FIELDS = Object.freeze([
  ...[...STATIC_SNAPSHOT_TYPES.keys()],
  ...[...AGENT_FIELD_TYPES.keys()].map((field) => `snapshot.agents[].${field}`),
]);

export function metricsCompletionItems({
  parameters = {},
  references = [],
  agentState = {},
  runtimeCapabilities = [],
} = {}) {
  const available = new Set(runtimeCapabilities);
  const intrinsicItems = [...SNAPSHOT_INTRINSIC_SURFACES]
    .filter(([, surface]) => !surface.availability || available.has(surface.availability))
    .map(([value]) => ({ value, caption: value, score: 900, meta: "snapshot function" }));
  const items = [
    ...Object.keys(LANGUAGE_CALL_SIGNATURES).map((value) => ({ value, caption: value, score: 900, meta: "supported function" })),
    ...intrinsicItems,
    ...[...STATIC_SNAPSHOT_TYPES.keys()]
      .map((value) => ({ value, caption: value, score: 1000, meta: "snapshot field" })),
    ...[...AGENT_FIELD_TYPES.keys()].map((field) => ({
      value: `agent.${field}`,
      caption: `agent.${field}`,
      score: 950,
      meta: "agent snapshot field",
    })),
    ...Object.keys(agentState).map((name) => ({
      value: `agent.private_state.${name}`,
      caption: `agent.private_state.${name}`,
      score: 950,
      meta: "agent scientific state",
    })),
    ...Object.keys(parameters).map((name) => ({
      value: `snapshot.config.${name}`,
      caption: `snapshot.config.${name}`,
      score: 900,
      meta: "configuration snapshot",
    })),
    ...references.map((name) => ({
      value: `snapshot.references.${name}.position`,
      caption: `snapshot.references.${name}.position`,
      score: 1000,
      meta: "reference snapshot",
    })),
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

function sourceLines(source) {
  return indentedLines(source, (line) => new MetricsCompileError("syntax", "tabs are not supported; use spaces", line, 1));
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

// Metrics expressions on the shared core (#576).
function parseExpr(text, line) {
  return parseTypedExpression(text, line, {
    error: (category, message, column) => new MetricsCompileError(category, message, line, column),
    finiteMessage: "metric constants must be finite",
    identifier(parser, parts) {
      const path = parts.join(".");
      if (FORBIDDEN_ROOTS.has(parts[0])) {
        throw new MetricsCompileError("forbidden-capability", `'${parts[0]}' is outside the metric read-only information boundary`, line);
      }
      if (parser.peek("(")) {
        if (parts.length !== 1 || (!CALL_SIGNATURES[parts[0]] && parts[0] !== "range")) {
          throw new MetricsCompileError("unsupported-feature", `call '${path}' is not in ${METRICS_LANGUAGE}`, line);
        }
        return { kind: "call", name: parts[0], args: parser.callArguments(), line };
      }
      return { kind: "load", path, line };
    },
  });
}

function parseTarget(text, line) {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) return text;
  throw new MetricsCompileError("unsupported-feature", `assignment target '${text}' is not supported`, line);
}

// Statement blocks on the shared core (#576).
const STATEMENTS = {
  error: (category, message, line) => new MetricsCompileError(category, message, line),
  expression: (text, line) => parseExpr(text, line),
  target: (text, line) => parseTarget(text, line),
  unsupported: (text) => `statement '${text}' is not in ${METRICS_LANGUAGE}`,
};

function parseStatements(lines, start, blockIndent) {
  return parseStatementBlock(lines, start, blockIndent, STATEMENTS);
}

function binaryType(op, left, right, line) {
  if ((op === "+" || op === "-") && left === right && (left === "scalar" || left === "vec2")) return left;
  if (op === "*" && left === "scalar" && right === "scalar") return "scalar";
  if (op === "*" && ((left === "scalar" && right === "vec2") || (left === "vec2" && right === "scalar"))) return "vec2";
  if (op === "/" && left === "scalar" && right === "scalar") return "scalar";
  if (op === "/" && left === "vec2" && right === "scalar") return "vec2";
  if ((op === "//" || op === "%") && left === "scalar" && right === "scalar") return "scalar";
  throw new MetricsCompileError("type", `operator '${op}' cannot combine ${left} and ${right}`, line);
}

function loadType(path, locals, parameters, context, line) {
  if (Object.hasOwn(locals, path)) return locals[path];
  if (Object.hasOwn(parameters, path)) return parameters[path];
  if (STATIC_SNAPSHOT_TYPES.has(path)) return STATIC_SNAPSHOT_TYPES.get(path);
  if (path.startsWith("snapshot.config.")) {
    const name = path.slice("snapshot.config.".length);
    if (Object.hasOwn(parameters, name)) return parameters[name];
    throw new MetricsCompileError("type", `unknown configuration snapshot field '${name}'`, line);
  }
  const pieces = path.split(".");
  const root = pieces[0];
  if (locals[root] === "agent") {
    const field = pieces.slice(1).join(".");
    if (AGENT_FIELD_TYPES.has(field)) return AGENT_FIELD_TYPES.get(field);
    if (field.startsWith("private_state.")) {
      const name = field.slice("private_state.".length);
      if (Object.hasOwn(context.agentState, name)) return context.agentState[name];
      throw new MetricsCompileError("type", `unknown agent private scientific state '${name}'`, line);
    }
    throw new MetricsCompileError("invalid-observation-field", `unknown agent snapshot field '${field}'`, line);
  }
  if (path === "snapshot" || path.startsWith("snapshot.")) {
    throw new MetricsCompileError("invalid-observation-field", `unknown metric snapshot field '${path}'`, line);
  }
  throw new MetricsCompileError("type", `unknown scalar/vector name '${path}'`, line);
}

function expressionType(node, locals, parameters, context) {
  if (node.kind === "const") return "scalar";
  if (node.kind === "bool_const") return "bool";
  if (node.kind === "load") return loadType(node.path, locals, parameters, context, node.line);
  if (node.kind === "unary") {
    const type = expressionType(node.value, locals, parameters, context);
    if (node.op === "not") {
      if (type !== "bool") throw new MetricsCompileError("type", `'not' requires bool, got ${type}`, node.line);
      return "bool";
    }
    if (node.op !== "-") throw new MetricsCompileError("type", `unsupported unary operator '${node.op}'`, node.line);
    if (type !== "scalar" && type !== "vec2") throw new MetricsCompileError("type", `unary '-' cannot apply to ${type}`, node.line);
    return type;
  }
  if (node.kind === "compare") {
    const left = expressionType(node.left, locals, parameters, context);
    const right = expressionType(node.right, locals, parameters, context);
    if (left !== "scalar" || right !== "scalar") {
      throw new MetricsCompileError("type", `comparison '${node.op}' requires scalar operands, got ${left} and ${right}`, node.line);
    }
    return "bool";
  }
  if (node.kind === "bool_op") {
    const left = expressionType(node.left, locals, parameters, context);
    const right = expressionType(node.right, locals, parameters, context);
    if (left !== "bool" || right !== "bool") {
      throw new MetricsCompileError("type", `boolean '${node.op}' requires bool operands, got ${left} and ${right}`, node.line);
    }
    return "bool";
  }
  if (node.kind === "binary") return binaryType(node.op, expressionType(node.left, locals, parameters, context), expressionType(node.right, locals, parameters, context), node.line);
  if (node.kind === "call") {
    if (isRangeCall(node)) throw new MetricsCompileError("type", "range(...) is only available as a for loop iterable", node.line);
    const signature = CALL_SIGNATURES[node.name];
    const surface = SNAPSHOT_INTRINSIC_SURFACES.get(node.name);
    if (surface?.availability && !context.runtimeCapabilities.has(surface.availability)) {
      throw new MetricsCompileError("type", `snapshot function '${node.name}' is unavailable for this Experiment`, node.line);
    }
    if (node.args.length !== signature.args.length) throw new MetricsCompileError("type", `${node.name} expects ${signature.args.length} arguments`, node.line);
    node.args.forEach((arg, index) => {
      const actual = expressionType(arg, locals, parameters, context);
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

function checkStatements(body, locals, parameters, context) {
  let returned = false;
  for (const statement of body) {
    if (statement.kind === "assign") {
      locals[statement.target] = expressionType(statement.value, locals, parameters, context);
    } else if (statement.kind === "aug_assign") {
      if (!Object.hasOwn(locals, statement.target)) throw new MetricsCompileError("type", `cannot update unknown local '${statement.target}'`, statement.line);
      const result = binaryType(statement.op, locals[statement.target], expressionType(statement.value, locals, parameters, context), statement.line);
      if (result !== locals[statement.target]) throw new MetricsCompileError("type", `update changes '${statement.target}' type`, statement.line);
    } else if (statement.kind === "for_each" && isRangeCall(statement.iterable)) {
      checkRangeCall(statement.iterable, statement.line, {
        isParameter: (path) => !Object.hasOwn(locals, path)
          && (Object.hasOwn(parameters, path) || (path.startsWith("snapshot.config.") && Object.hasOwn(parameters, path.slice("snapshot.config.".length)))),
        argumentType: (node) => expressionType(node, locals, parameters, context),
        error: (message, line) => new MetricsCompileError("type", message, line),
      });
      const nested = { ...locals, [statement.variable]: "scalar" };
      checkStatements(statement.body, nested, parameters, context);
      for (const [name, type] of Object.entries(locals)) {
        if (Object.hasOwn(nested, name) && nested[name] !== type) throw new MetricsCompileError("type", `loop changes '${name}' type`, statement.line);
      }
    } else if (statement.kind === "for_each") {
      const iterable = expressionType(statement.iterable, locals, parameters, context);
      if (iterable !== "sequence<agent>") throw new MetricsCompileError("type", "metric loops currently require 'snapshot.agents'", statement.line);
      const nested = { ...locals, [statement.variable]: "agent" };
      checkStatements(statement.body, nested, parameters, context);
    } else if (statement.kind === "if") {
      const continuing = [];
      let allReturn = statement.else_body.length > 0;

      for (const branch of statement.branches) {
        const conditionType = expressionType(branch.condition, locals, parameters, context);
        if (conditionType !== "bool") throw new MetricsCompileError("type", `if/elif condition must be bool, got ${conditionType}`, branch.line ?? statement.line);
        const nested = { ...locals };
        const branchReturns = checkStatements(branch.body, nested, parameters, context);
        if (!branchReturns) continuing.push(nested);
        allReturn &&= branchReturns;
      }

      if (statement.else_body.length) {
        const nested = { ...locals };
        const elseReturns = checkStatements(statement.else_body, nested, parameters, context);
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
      const result = expressionType(statement.value, locals, parameters, context);
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
        collectionAliases = intersectSets(continuingCollections);
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

function parseMetricFunctions(source, parameters, context) {
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
    if (!checkStatements(parsed.body, locals, parameters, context)) {
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

export function compileMetrics(source, {
  parameters = {},
  references = [],
  agentState = {},
  runtimeCapabilities = [],
} = {}) {
  if (typeof source !== "string") throw new MetricsCompileError("syntax", "Metrics source must be a string");
  const parameterTypes = {};
  for (const [name, type] of Object.entries(parameters)) {
    if (type !== "scalar") throw new MetricsCompileError("type", `metric parameter '${name}' must be scalar`);
    parameterTypes[name] = "scalar";
  }
  const referenceNames = [...references];
  const uniqueReferences = new Set(referenceNames);
  if (uniqueReferences.size !== referenceNames.length) throw new MetricsCompileError("type", "world reference names must be unique");
  for (const name of referenceNames) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new MetricsCompileError("type", `invalid world reference name '${name}'`);
    parameterTypes[`snapshot.references.${name}.position`] = "vec2";
  }
  const context = {
    agentState: { ...agentState },
    runtimeCapabilities: new Set(runtimeCapabilities),
  };
  for (const [name, type] of Object.entries(context.agentState)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || type !== "scalar") {
      throw new MetricsCompileError("type", `agent private scientific state '${name}' must be a scalar identifier`);
    }
  }
  const metrics = parseMetricFunctions(source, parameterTypes, context);
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
      fields: [
        ...METRIC_OBSERVATION_FIELDS.filter((field) => field !== "snapshot.agents"),
        ...Object.keys(parameters).map((name) => `snapshot.config.${name}`),
        ...Object.keys(context.agentState).map((name) => `snapshot.agents[].private_state.${name}`),
        ...referenceNames.map((name) => `snapshot.references.${name}.position`),
      ],
      intrinsics: [...SNAPSHOT_INTRINSIC_SURFACES]
        .filter(([, surface]) => !surface.availability || context.runtimeCapabilities.has(surface.availability))
        .map(([name]) => name),
    },
    references: referenceNames,
    metrics,
  };
}
