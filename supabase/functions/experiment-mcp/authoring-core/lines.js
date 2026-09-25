// Shared line reading for the authoring languages (#576).

// A source line without its trailing comment; a '#' inside quotes is kept.
export function stripComment(raw) {
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

// Every line as { raw, line, indent, text }, where indent counts leading
// spaces; a tab in the indentation calls tabError(line) (which throws).
export function indentedLines(source, tabError) {
  return source.split(/\r?\n/).map((raw, index) => {
    const leading = raw.match(/^[\t ]*/)?.[0] ?? "";
    if (leading.includes("\t")) throw tabError(index + 1);
    return { raw, line: index + 1, indent: leading.length, text: raw.trim() };
  });
}

// The names present in every one of the given sets.
export function intersectSets(sets) {
  if (!sets.length) return new Set();
  const out = new Set(sets[0]);
  for (const value of [...out]) {
    if (!sets.every((set) => set.has(value))) out.delete(value);
  }
  return out;
}
