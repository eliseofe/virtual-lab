// Shared statement parser for the typed authoring languages (#576): the
// indented blocks of the Controller's step and of Metrics functions.
//
// Statements: if/elif/else, for NAME in EXPR, return EXPR, TARGET += EXPR,
// TARGET = EXPR. Blank and comment lines inside a block are skipped. The
// language supplies:
//   error(category, message, line)   its error type
//   expression(text, line)           its expression parser
//   target(text, line)               its assignment-target rule
//   unsupported(text)                the message for any other statement

function skipBlank(lines, index) {
  while (index < lines.length && (!lines[index].text || lines[index].text.startsWith("#"))) index += 1;
  return index;
}

export function parseStatementBlock(lines, start, blockIndent, language) {
  const { error, expression, target, unsupported } = language;
  const body = [];
  let i = start;
  while (i < lines.length) {
    const entry = lines[i];
    if (!entry.text || entry.text.startsWith("#")) { i += 1; continue; }
    if (entry.indent < blockIndent) break;
    if (entry.indent > blockIndent) throw error("syntax", "unexpected indentation", entry.line);

    const ifMatch = entry.text.match(/^if\s+(.+):$/);
    if (ifMatch) {
      const branches = [];
      let elseBody = [];
      let headerIndex = i;
      let conditionText = ifMatch[1];
      const statementLine = entry.line;

      for (;;) {
        const header = lines[headerIndex];
        const nextIndex = skipBlank(lines, headerIndex + 1);
        const next = lines[nextIndex];
        if (!next || next.indent <= blockIndent) throw error("syntax", "if/elif requires an indented body", header.line);
        const nested = parseStatementBlock(lines, nextIndex, next.indent, language);
        branches.push({
          condition: expression(conditionText, header.line),
          body: nested.body,
          line: header.line,
        });

        let cursor = skipBlank(lines, nested.next);
        const continuation = lines[cursor];
        const elifMatch = continuation?.indent === blockIndent ? continuation.text.match(/^elif\s+(.+):$/) : null;
        if (elifMatch) {
          headerIndex = cursor;
          conditionText = elifMatch[1];
          continue;
        }

        if (continuation?.indent === blockIndent && continuation.text === "else:") {
          const elseIndex = skipBlank(lines, cursor + 1);
          const elseFirst = lines[elseIndex];
          if (!elseFirst || elseFirst.indent <= blockIndent) throw error("syntax", "else requires an indented body", continuation.line);
          const parsedElse = parseStatementBlock(lines, elseIndex, elseFirst.indent, language);
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
      const nextIndex = skipBlank(lines, i + 1);
      const next = lines[nextIndex];
      if (!next || next.indent <= blockIndent) throw error("syntax", "for loop requires an indented body", entry.line);
      const nested = parseStatementBlock(lines, nextIndex, next.indent, language);
      body.push({ kind: "for_each", variable: forMatch[1], iterable: expression(forMatch[2], entry.line), body: nested.body, line: entry.line });
      i = nested.next;
      continue;
    }

    const returnMatch = entry.text.match(/^return\s+(.+)$/);
    if (returnMatch) { body.push({ kind: "return", value: expression(returnMatch[1], entry.line), line: entry.line }); i += 1; continue; }
    const augMatch = entry.text.match(/^(.+?)\s*\+=\s*(.+)$/);
    if (augMatch) { body.push({ kind: "aug_assign", target: target(augMatch[1].trim(), entry.line), op: "+", value: expression(augMatch[2], entry.line), line: entry.line }); i += 1; continue; }
    const assignMatch = entry.text.match(/^(.+?)\s*=\s*(.+)$/);
    if (assignMatch) { body.push({ kind: "assign", target: target(assignMatch[1].trim(), entry.line), value: expression(assignMatch[2], entry.line), line: entry.line }); i += 1; continue; }
    throw error("unsupported-feature", unsupported(entry.text), entry.line);
  }
  return { body, next: i };
}
