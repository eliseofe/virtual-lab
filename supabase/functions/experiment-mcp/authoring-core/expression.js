// Shared tokenizer and expression parser for the authoring languages (#576).
//
// Every code artifact (Initialization, the environment field, Controller,
// Metrics) parses expressions with the same precedence structure:
//
//   or > and > not > comparison > additive > multiplicative > unary > power > primary
//
// A language supplies its grammar: which operators exist, where an expression
// starts (the environment field has no comparisons; Initialization has no
// boolean operators), the nodes it builds, its error type, and a hook that
// resolves names and calls. The core owns the mechanics, so a syntax fix is
// made once. The behaviour of every language is pinned by
// web/tests/authoring-equivalence.test.mjs.

const NUMBER = /^(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*/;

// Splits one line of expression text into tokens { type, value, column }.
// `operators` lists every operator and punctuation token the language accepts
// (two-character operators are matched before single characters). `strings`
// enables quoted string literals. `fail(kind, detail)` throws the language's
// error: kind "unsupported" with { character, column }, or "unterminated".
export function tokenize(text, { operators, strings = false, fail }) {
  const pairs = operators.filter((operator) => operator.length === 2);
  const singles = operators.filter((operator) => operator.length === 1);
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) { i += 1; continue; }
    const rest = text.slice(i);
    const number = rest.match(NUMBER);
    if (number) {
      tokens.push({ type: "number", value: number[0], column: i + 1 });
      i += number[0].length;
      continue;
    }
    const pair = pairs.find((operator) => rest.startsWith(operator));
    if (pair) {
      tokens.push({ type: pair, value: pair, column: i + 1 });
      i += 2;
      continue;
    }
    const identifier = rest.match(IDENTIFIER);
    if (identifier) {
      tokens.push({ type: "ident", value: identifier[0], column: i + 1 });
      i += identifier[0].length;
      continue;
    }
    if (strings && (c === '"' || c === "'")) {
      let j = i + 1;
      let value = "";
      while (j < text.length && text[j] !== c) {
        if (text[j] === "\\" && j + 1 < text.length) { value += text[j + 1]; j += 2; }
        else { value += text[j]; j += 1; }
      }
      if (j >= text.length) fail("unterminated", { column: i + 1 });
      tokens.push({ type: "string", value, column: i + 1 });
      i = j + 1;
      continue;
    }
    if (singles.includes(c)) {
      tokens.push({ type: c, value: c, column: i + 1 });
      i += 1;
      continue;
    }
    fail("unsupported", { character: c, column: i + 1 });
  }
  tokens.push({ type: "eof", value: "", column: text.length + 1 });
  return tokens;
}

// Precedence parser over the tokens of one line.
//
// grammar:
//   start            "or" | "comparison" | "additive": the level an expression
//                    (and every parenthesised or argument expression) starts at
//   comparisons      comparison operators (one comparison, not chained)
//   multiplicative   multiplicative operators, e.g. ["*", "/"]
//   unary            prefix operators, e.g. ["-"] or ["+", "-"]
//   nodes            { binary, compare, bool, not, unary, power } node builders;
//                    each receives (…operands, line)
//   error(message, token)       the language's syntax error
//   primary(parser, token)      optional: literals other than identifiers
//                               (numbers, strings); returns a node or undefined
//   identifier(parser, first)   resolves a name, a dotted path or a call after
//                               the first identifier token was taken
//   unexpected(token)           the error when no expression starts here
export class ExpressionParser {
  constructor(tokens, line, grammar) {
    this.tokens = tokens;
    this.index = 0;
    this.line = line;
    this.grammar = grammar;
  }

  current() { return this.tokens[this.index]; }
  peek(type) { return this.current().type === type; }
  peekKeyword(value) {
    const token = this.current();
    return token.type === "ident" && token.value === value;
  }
  take(type) {
    const token = this.current();
    if (token.type !== type) throw this.grammar.error(`expected '${type}', found '${token.value || "end of expression"}'`, token);
    this.index += 1;
    return token;
  }
  takeKeyword(value) {
    const token = this.current();
    if (token.type !== "ident" || token.value !== value) throw this.grammar.error(`expected '${value}', found '${token.value || "end of expression"}'`, token);
    this.index += 1;
    return token;
  }

  parse() {
    const node = this.expression();
    this.take("eof");
    return node;
  }

  expression() {
    const { start } = this.grammar;
    if (start === "or") return this.booleanOr();
    if (start === "comparison") return this.comparison();
    return this.additive();
  }

  booleanOr() {
    let left = this.booleanAnd();
    while (this.peekKeyword("or")) {
      this.takeKeyword("or");
      left = this.grammar.nodes.bool("or", left, this.booleanAnd(), this.line);
    }
    return left;
  }

  booleanAnd() {
    let left = this.booleanNot();
    while (this.peekKeyword("and")) {
      this.takeKeyword("and");
      left = this.grammar.nodes.bool("and", left, this.booleanNot(), this.line);
    }
    return left;
  }

  booleanNot() {
    if (this.peekKeyword("not")) {
      this.takeKeyword("not");
      return this.grammar.nodes.not(this.booleanNot(), this.line);
    }
    return this.comparison();
  }

  comparison() {
    const left = this.additive();
    const token = this.current();
    if (!this.grammar.comparisons.includes(token.type)) return left;
    this.index += 1;
    return this.grammar.nodes.compare(token.type, left, this.additive(), this.line);
  }

  additive() {
    let left = this.multiplicative();
    while (this.peek("+") || this.peek("-")) {
      const op = this.current().type;
      this.index += 1;
      left = this.grammar.nodes.binary(op, left, this.multiplicative(), this.line);
    }
    return left;
  }

  multiplicative() {
    let left = this.unary();
    while (this.grammar.multiplicative.includes(this.current().type)) {
      const op = this.current().type;
      this.index += 1;
      left = this.grammar.nodes.binary(op, left, this.unary(), this.line);
    }
    return left;
  }

  unary() {
    const op = this.current().type;
    if (this.grammar.unary.includes(op)) {
      this.index += 1;
      return this.grammar.nodes.unary(op, this.unary(), this.line);
    }
    return this.power();
  }

  power() {
    const left = this.primary();
    if (!this.peek("**")) return left;
    this.take("**");
    return this.grammar.nodes.power(left, this.unary(), this.line);
  }

  primary() {
    const literal = this.grammar.primary?.(this, this.current());
    if (literal !== undefined) return literal;
    if (this.peek("(")) {
      this.take("(");
      const node = this.expression();
      this.take(")");
      return node;
    }
    if (!this.peek("ident")) throw this.grammar.unexpected(this.current());
    return this.grammar.identifier(this, this.take("ident").value);
  }

  // After a first identifier: the remaining ".name" parts of a dotted path.
  dotted(first) {
    const parts = [first];
    while (this.peek(".")) {
      this.take(".");
      parts.push(this.take("ident").value);
    }
    return parts;
  }

  // At "(": arguments that may end with keyword arguments NAME=EXPR (#577;
  // only where the language's tokenizer produces "="). Returns { args,
  // keywords }, keywords as [{ name, value }] in written order.
  callArgumentsWithKeywords() {
    this.take("(");
    const args = [];
    const keywords = [];
    if (!this.peek(")")) {
      do {
        const next = this.tokens[this.index + 1];
        if (this.peek("ident") && next?.type === "=") {
          const name = this.take("ident");
          this.take("=");
          if (keywords.some((keyword) => keyword.name === name.value)) throw this.grammar.error(`keyword argument '${name.value}' repeated`, name);
          keywords.push({ name: name.value, value: this.expression() });
        } else {
          if (keywords.length) throw this.grammar.error("positional argument follows keyword argument", this.current());
          args.push(this.expression());
        }
        if (!this.peek(",")) break;
        this.take(",");
      } while (!this.peek(")"));
    }
    this.take(")");
    return { args, keywords };
  }

  // At "(": a parenthesised, comma-separated argument list.
  callArguments() {
    this.take("(");
    const args = [];
    if (!this.peek(")")) {
      do {
        args.push(this.expression());
        if (!this.peek(",")) break;
        this.take(",");
      } while (!this.peek(")"));
    }
    this.take(")");
    return args;
  }
}

// The typed expression grammar shared by the Controller and Metrics
// (python-vlab): boolean and/or/not, one comparison, + - * / // %, unary -,
// ** (as pow), True/False; no strings. The language supplies:
//   error(category, message, column)   its error for (category, message)
//   finiteMessage                      the message for a non-finite constant
//   identifier(parser, parts)          resolves a dotted path or a call
export function parseTypedExpression(text, line, { error, finiteMessage, identifier }) {
  const tokens = tokenize(text, {
    operators: ["**", "//", "<=", ">=", "==", "!=", "<", ">", "+", "-", "*", "/", "%", "(", ")", ",", "."],
    fail: (_kind, { character, column }) => { throw error("syntax", `unsupported token '${character}'`, column); },
  });
  return new ExpressionParser(tokens, line, {
    start: "or",
    comparisons: ["<", "<=", ">", ">=", "==", "!="],
    multiplicative: ["*", "/", "//", "%"],
    unary: ["-"],
    nodes: {
      binary: (op, left, right) => ({ kind: "binary", op, left, right, line }),
      compare: (op, left, right) => ({ kind: "compare", op, left, right, line }),
      bool: (op, left, right) => ({ kind: "bool_op", op, left, right, line }),
      not: (value) => ({ kind: "unary", op: "not", value, line }),
      unary: (op, value) => ({ kind: "unary", op, value, line }),
      power: (left, right) => ({ kind: "call", name: "pow", args: [left, right], line }),
    },
    error: (message, token) => error("syntax", message, token.column),
    unexpected: (token) => error("syntax", `expected expression, found '${token.value || "end of expression"}'`, token.column),
    primary(parser) {
      if (!parser.peek("number")) return undefined;
      const token = parser.take("number");
      const value = Number(token.value);
      if (!Number.isFinite(value)) throw error("syntax", finiteMessage, token.column);
      return { kind: "const", value, line };
    },
    identifier(parser, first) {
      if (first === "True" || first === "False") return { kind: "bool_const", value: first === "True", line };
      return identifier(parser, parser.dotted(first));
    },
  }).parse();
}
