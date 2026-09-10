const FORBIDDEN_ROOTS = new Set([
  "random",
  "rng",
  "seed",
  "world",
  "simulator",
  "environment",
  "agents",
  "filesystem",
  "network",
]);

const ALLOWED_CALLS = new Set(["Vec2", "dot", "perpendicular", "spring", "Motion"]);

export class ControllerCompileError extends Error {
  constructor(message, line = null, column = null) {
    super(line == null ? message : `line ${line}${column == null ? "" : `:${column}`}: ${message}`);
    this.name = "ControllerCompileError";
    this.line = line;
    this.column = column;
  }
}

function indentation(raw) {
  const match = raw.match(/^ */);
  const spaces = match ? match[0].length : 0;
  if (raw.slice(0, spaces).includes("\t")) throw new ControllerCompileError("tabs are not supported");
  return spaces;
}

function meaningfulLines(source) {
  return source.split(/\r?\n/).map((raw, index) => ({
    raw,
    line: index + 1,
    indent: indentation(raw),
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
      throw new ControllerCompileError(`unsupported token '${c}'`, this.line, i + 1);
    }
    tokens.push({ type: "eof", value: "", column: text.length + 1 });
    return tokens;
  }

  peek(type) { return this.tokens[this.index].type === type; }
  take(type) {
    const token = this.tokens[this.index];
    if (token.type !== type) throw new ControllerCompileError(`expected '${type}', found '${token.value || "end of expression"}'`, this.line, token.column);
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
      left = { kind: "binary", op, left, right: this.multiplicative() };
    }
    return left;
  }

  multiplicative() {
    let left = this.unary();
    while (this.peek("*") || this.peek("/")) {
      const op = this.tokens[this.index++].type;
      left = { kind: "binary", op, left, right: this.unary() };
    }
    return left;
  }

  unary() {
    if (this.peek("-")) {
      this.take("-");
      return { kind: "unary", op: "-", value: this.unary() };
    }
    return this.primary();
  }

  primary() {
    if (this.peek("number")) return { kind: "const", value: Number(this.take("number").value) };
    if (this.peek("(")) {
      this.take("(");
      const node = this.additive();
      this.take(")");
      return node;
    }
    if (!this.peek("ident")) {
      const token = this.tokens[this.index];
      throw new ControllerCompileError(`expected expression, found '${token.value || "end of expression"}'`, this.line, token.column);
    }

    const parts = [this.take("ident").value];
    while (this.peek(".")) {
      this.take(".");
      parts.push(this.take("ident").value);
    }
    const path = parts.join(".");
    if (FORBIDDEN_ROOTS.has(parts[0])) throw new ControllerCompileError(`'${parts[0]}' is outside the controller information boundary`, this.line);

    if (this.peek("(")) {
      if (parts.length !== 1 || !ALLOWED_CALLS.has(parts[0])) throw new ControllerCompileError(`call '${path}' is not in python-vlab/0.1`, this.line);
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
      return { kind: "call", name: parts[0], args };
    }
    return { kind: "load", path };
  }
}

function parseExpr(text, line) {
  return new ExprParser(text, line).parse();
}

function parseStatements(lines, start, blockIndent) {
  const body = [];
  let i = start;
  while (i < lines.length) {
    const entry = lines[i];
    if (entry.indent < blockIndent) break;
    if (entry.indent > blockIndent) throw new ControllerCompileError("unexpected indentation", entry.line);

    const forMatch = entry.text.match(/^for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+(.+):$/);
    if (forMatch) {
      const next = lines[i + 1];
      if (!next || next.indent <= blockIndent) throw new ControllerCompileError("for loop requires an indented body", entry.line);
      const nested = parseStatements(lines, i + 1, next.indent);
      body.push({ kind: "for_each", variable: forMatch[1], iterable: parseExpr(forMatch[2], entry.line), body: nested.body });
      i = nested.next;
      continue;
    }

    const returnMatch = entry.text.match(/^return\s+(.+)$/);
    if (returnMatch) {
      body.push({ kind: "return", value: parseExpr(returnMatch[1], entry.line) });
      i += 1;
      continue;
    }

    const augMatch = entry.text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\+=\s*(.+)$/);
    if (augMatch) {
      body.push({ kind: "aug_assign", target: augMatch[1], op: "+", value: parseExpr(augMatch[2], entry.line) });
      i += 1;
      continue;
    }

    const assignMatch = entry.text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (assignMatch) {
      body.push({ kind: "assign", target: assignMatch[1], value: parseExpr(assignMatch[2], entry.line) });
      i += 1;
      continue;
    }

    throw new ControllerCompileError(`unsupported statement '${entry.text}'`, entry.line);
  }
  return { body, next: i };
}

export function compileController(source) {
  const lines = meaningfulLines(source);
  if (lines.length < 3) throw new ControllerCompileError("controller requires class, step method, and body");

  const classMatch = lines[0].text.match(/^class\s+([A-Za-z_][A-Za-z0-9_]*)\(Agent\):$/);
  if (!classMatch || lines[0].indent !== 0) throw new ControllerCompileError("controller must start with 'class Name(Agent):'", lines[0].line);

  const method = lines[1];
  if (method.indent <= lines[0].indent || method.text !== "def step(self, obs):") {
    throw new ControllerCompileError("controller entry point must be 'def step(self, obs):'", method.line);
  }

  const firstStatement = lines[2];
  if (firstStatement.indent <= method.indent) throw new ControllerCompileError("step method requires an indented body", firstStatement.line);
  const parsed = parseStatements(lines, 2, firstStatement.indent);
  if (parsed.next !== lines.length) throw new ControllerCompileError("unexpected content after step body", lines[parsed.next].line);
  if (!parsed.body.some((statement) => statement.kind === "return")) throw new ControllerCompileError("step method must return an action");

  return {
    schema: "vlab.controller-ir/0.1",
    language: "python-vlab/0.1",
    controller: classMatch[1],
    entry: "step",
    parameters: ["obs"],
    body: parsed.body,
  };
}
