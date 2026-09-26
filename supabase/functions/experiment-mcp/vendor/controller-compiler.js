import { checkRangeCall, isRangeCall } from "../authoring-core/ranges.js";
import { indentedLines, intersectSets } from "../authoring-core/lines.js";
import { parseStatementBlock } from "../authoring-core/statements.js";
import { parseTypedExpression } from "../authoring-core/expression.js";
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

// Configuration values that describe the world or the experiment rather than
// the robot (#577, D-022). They stay supplied to the simulator (Metrics may
// read them) but a Controller cannot name them.
export const HIDDEN_FROM_ROBOTS = new Set(["N", "ARENA_SIZE", "EXPERIMENT_DURATION"]);

const CALL_SIGNATURES = {
  ...LANGUAGE_CALL_SIGNATURES,
  ...CAPABILITY_CALL_SIGNATURES,
};

export function controllerCompletionItems({ parameters = {}, references = [] } = {}) {
  const referenceItems = references.flatMap((name) => [
    { value: `obs.references.${name}.available`, caption: `obs.references.${name}.available`, score: 1000, meta: "reference observation" },
    { value: `obs.references.${name}.relative_position`, caption: `obs.references.${name}.relative_position`, score: 1000, meta: "reference observation" },
  ]);
  const items = [
    ...Object.keys(CALL_SIGNATURES).map((value) => ({ value, caption: value, score: 900, meta: "supported function" })),
    ...[...OBSERVATION_TYPES.keys()].map((value) => ({ value, caption: value, score: 1000, meta: "observation" })),
    ...referenceItems,
    ...Object.keys(parameters).filter((value) => !HIDDEN_FROM_ROBOTS.has(value)).map((value) => ({ value, caption: value, score: 800, meta: "parameter" })),
  ];
  return [...new Map(items.map((item) => [item.value, item])).values()];
}

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

// Controller expressions on the shared core (#576).
function parseExpr(text, line) {
  return parseTypedExpression(text, line, {
    error: (category, message, column) => new ControllerCompileError(category, message, line, column),
    finiteMessage: "numeric constants must be finite",
    identifier(parser, parts) {
      const path = parts.join(".");
      if (SECURITY_FORBIDDEN_ROOTS.has(parts[0])) {
        throw new ControllerCompileError("forbidden-capability", `'${parts[0]}' is outside the controller security boundary`, line);
      }
      if (parser.peek("(")) {
        if (!CALL_SIGNATURES[path] && path !== "range") {
          const category = parts.length > 1 ? "unsupported-capability" : "unsupported-feature";
          throw new ControllerCompileError(category, `call '${path}' is not available in python-vlab/0.1`, line);
        }
        return { kind: "call", name: path, args: parser.callArguments(), line };
      }
      return { kind: "load", path, line };
    },
  });
}

function parseTarget(text, line) {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(text)) return text;
  if (/^self\.[A-Za-z_][A-Za-z0-9_]*$/.test(text)) return text;
  throw new ControllerCompileError("unsupported-feature", `assignment target '${text}' is not supported`, line);
}

function meaningfulLines(source) {
  return indentedLines(source, (line) => new ControllerCompileError("syntax", "tabs are not supported; use spaces", line, 1))
    .filter((entry) => entry.text && !entry.text.startsWith("#"));
}

// Statement blocks on the shared core (#576).
const STATEMENTS = {
  error: (category, message, line) => new ControllerCompileError(category, message, line),
  expression: (text, line) => parseExpr(text, line),
  target: (text, line) => parseTarget(text, line),
  unsupported: (text) => `statement '${text}' is not in python-vlab/0.1`,
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
    if (isRangeCall(expr)) throw new ControllerCompileError("type", "range(...) is only available as a for loop iterable", expr.line);
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
    const referenceMatch = expr.path.match(/^obs\.references\.([A-Za-z_][A-Za-z0-9_]*)\.(available|relative_position)$/);
    if (referenceMatch) {
      if (!scope.references.has(referenceMatch[1])) {
        throw new ControllerCompileError("invalid-observation-field", `unknown world reference '${referenceMatch[1]}'`, expr.line);
      }
      return referenceMatch[2] === "available" ? "bool" : "vec2";
    }
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
    if (scope.parameters.has(expr.path)) {
      if (HIDDEN_FROM_ROBOTS.has(expr.path)) {
        throw new ControllerCompileError("forbidden-capability", `'${expr.path}' is not available to robots: a robot knows only its own sensors and state, not the swarm size, the arena or the run length (D-022)`, expr.line);
      }
      return scope.parameters.get(expr.path);
    }
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
    if (scope.traits.has(name)) throw new ControllerCompileError("forbidden-capability", `trait '${name}' is read-only: it is set per group by the experimenter (set_trait); keep a separate variable if the robot must change it`, line);
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
    } else if (statement.kind === "for_each" && isRangeCall(statement.iterable)) {
      checkRangeCall(statement.iterable, statement.line, {
        isParameter: (path) => scope.parameters.has(path) && !scope.locals.has(path),
        argumentType: (node) => inferExpression(node, scope),
        error: (message, line) => new ControllerCompileError("type", message, line),
      });
      const nested = {
        parameters: scope.parameters,
        references: scope.references,
        state: scope.state,
        traits: scope.traits,
        locals: new Map([...scope.locals, [statement.variable, "scalar"]]),
        loopVariables: scope.loopVariables,
      };
      checkStatements(statement.body, nested);
      for (const [name, type] of scope.locals) {
        if (nested.locals.has(name) && nested.locals.get(name) !== type) throw new ControllerCompileError("type", `loop changes '${name}' type`, statement.line);
      }
    } else if (statement.kind === "for_each") {
      const iterableType = inferExpression(statement.iterable, scope);
      if (iterableType !== "neighbours") throw new ControllerCompileError("type", `for loop requires neighbours, got ${iterableType}`, statement.line);
      if (scope.loopVariables.size) throw new ControllerCompileError("unsupported-feature", "nested neighbour loops are not in python-vlab/0.1", statement.line);
      const nested = {
        parameters: scope.parameters,
        references: scope.references,
        state: scope.state,
        traits: scope.traits,
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
          references: scope.references,
          state: scope.state,
          traits: scope.traits,
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
          references: scope.references,
          state: scope.state,
          traits: scope.traits,
          locals: new Map(scope.locals),
          loopVariables: new Map(scope.loopVariables),
        };
        const elseReturns = checkStatements(statement.else_body, nested);
        if (!elseReturns) continuingScopes.push(nested);
        allBranchesReturn &&= elseReturns;
      } else {
        continuingScopes.push({
          parameters: scope.parameters,
          references: scope.references,
          state: scope.state,
          traits: scope.traits,
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
      if (continuing.length) aliases = intersectSets(continuing);

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
    // #577 (D-023): NAME = number is the robot's own memory; NAME = trait(default)
    // is set per group by the experimenter (set_trait) and is read-only here.
    const number = "-?(?:\\d+\\.\\d*|\\.\\d+|\\d+)(?:[eE][+-]?\\d+)?";
    const memory = entry.text.match(new RegExp(`^([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*(${number})$`));
    const trait = entry.text.match(new RegExp(`^([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*trait\\(\\s*(${number}|True|False)\\s*\\)$`));
    if (memory) state.push({ name: memory[1], type: "scalar", initial: Number(memory[2]), line: entry.line });
    else if (trait) {
      const boolean = trait[2] === "True" || trait[2] === "False";
      state.push({ name: trait[1], type: boolean ? "bool" : "scalar", initial: boolean ? trait[2] === "True" : Number(trait[2]), trait: true, line: entry.line });
    } else {
      throw new ControllerCompileError("unsupported-feature", "class attributes must be NAME = number (the robot's memory) or NAME = trait(default) (set per group by the experimenter, read-only)", entry.line);
    }
    i += 1;
  }
  return { state, next: i };
}

export function controllerStructure(source) {
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

  return {
    language: "python-vlab/0.1",
    symbols: [
      { kind: "class", name: classMatch[1], line: lines[0].line },
      ...parsedState.state.map((entry) => ({ kind: "state", name: entry.name, line: entry.line })),
      { kind: "method", name: "step", line: method.line },
    ],
  };
}

export function compileController(source, options = {}) {
  const parameterObject = options.parameters ?? {};
  const parameters = new Map(Object.entries(parameterObject));
  const referenceNames = [...(options.references ?? [])];
  const references = new Set(referenceNames);
  if (references.size !== referenceNames.length) throw new ControllerCompileError("configuration", "world reference names must be unique");
  for (const name of references) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new ControllerCompileError("configuration", `invalid world reference name '${name}'`);
  }
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
  const traits = new Set(parsedState.state.filter((entry) => entry.trait).map((entry) => entry.name));
  const scope = { parameters, references, state: stateMap, traits, locals: new Map(), loopVariables: new Map() };
  if (!checkStatements(parsed.body, scope)) throw new ControllerCompileError("type", "step method must return a Motion/action");

  return {
    schema: "vlab.controller-ir/0.1",
    language: "python-vlab/0.1",
    controller: classMatch[1],
    entry: "step",
    parameters: Object.fromEntries(parameters),
    references: referenceNames,
    state: parsedState.state.map(({ name, type, initial, trait }) => ({ name, type, initial, ...(trait ? { trait: true } : {}) })),
    body: lowerNeighbourIterableAliases(parsed.body),
  };
}
