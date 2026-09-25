// `for NAME in range(...)` for the typed languages (#577, D-021): 1 to 3
// arguments, as in Python, each a run constant (numbers and parameters
// combined with arithmetic), so the number of iterations is fixed for the
// whole run. The simulator checks at run start that the values are integers
// and the step is nonzero.
//
// language:
//   isParameter(path)        whether a load names a parameter
//   argumentType(node)       the language's type of an argument expression
//   error(message, line)     the language's type error

function isRunConstant(node, isParameter) {
  if (node.kind === "const") return true;
  if (node.kind === "load") return isParameter(node.path);
  if (node.kind === "unary") return node.op === "-" && isRunConstant(node.value, isParameter);
  if (node.kind === "binary") return isRunConstant(node.left, isParameter) && isRunConstant(node.right, isParameter);
  return false;
}

export function isRangeCall(node) {
  return node?.kind === "call" && node.name === "range";
}

export function checkRangeCall(call, line, { isParameter, argumentType, error }) {
  if (call.args.length < 1 || call.args.length > 3) throw error(`range expects 1, 2 or 3 arguments, got ${call.args.length}`, line);
  for (const arg of call.args) {
    const type = argumentType(arg);
    if (type !== "scalar") throw error(`range arguments must be scalar, got ${type}`, line);
    if (!isRunConstant(arg, isParameter)) throw error("range arguments must be numbers or parameters", line);
  }
}
