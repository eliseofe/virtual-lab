// Experiment-owned DM formation and placement mathematics, not an engine capability.
export function equilibriumFormation(n, sigma = 0.7, cutoff = 3.5) {
  if (!Number.isInteger(n) || n < 1 || n > 200)
    throw Error("Population must be an integer from 1 to 200");
  const extent = Math.ceil(Math.sqrt(n)) + 4,
    candidates = [];
  for (let q = -2 * extent; q <= 2 * extent; q++)
    for (let r = -2 * extent; r <= 2 * extent; r++) {
      const x = q + 0.5 * r,
        y = (Math.sqrt(3) / 2) * r;
      candidates.push({ q, r, x, y, d: x * x + y * y });
    }
  candidates.sort((a, b) => a.d - b.d || a.q - b.q || a.r - b.r);
  const points = candidates.slice(0, n).map((p) => [p.x, p.y]);
  const center = [0, 1].map((k) => points.reduce((s, p) => s + p[k], 0) / n);
  for (const p of points) {
    p[0] -= center[0];
    p[1] -= center[1];
  }
  if (n === 1) return points;
  const distances = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      distances.push(
        Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]),
      );
  const balance = (s) =>
    distances.reduce((sum, d) => {
      d *= s;
      return (
        sum +
        (d <= cutoff
          ? (sigma * sigma) / (d * d) - (2 * sigma ** 4) / d ** 4
          : 0)
      );
    }, 0);
  const edges = [
    0.12,
    ...new Set(
      distances.map((d) => cutoff / d).filter((x) => x > 0.12 && x < 1.6),
    ),
    1.6,
  ].sort((a, b) => a - b);
  for (let k = 1; k < edges.length; k++) {
    let lo = edges[k - 1] + 1e-13,
      hi = edges[k] - 1e-13;
    if (balance(lo) < 0 && balance(hi) > 0) {
      for (let i = 0; i < 80; i++) {
        const m = (lo + hi) / 2;
        if (balance(m) > 0) hi = m;
        else lo = m;
      }
      return points.map((p) => p.map((x) => (x * (lo + hi)) / 2));
    }
  }
  throw Error("No continuous DM equilibrium for this formation");
}
export const minimumGap = (a, b) =>
  Math.min(
    ...a.flatMap((p) => b.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1]))),
  );
export function separatedFormations(a, b, gap) {
  let lo = 0,
    hi =
      Math.max(...a.map((p) => Math.hypot(...p))) +
      Math.max(...b.map((p) => Math.hypot(...p))) +
      gap +
      1;
  const shifted = (s) => b.map((p) => [p[0], p[1] + s]);
  for (let i = 0; i < 80; i++) {
    const m = (lo + hi) / 2;
    if (minimumGap(a, shifted(m)) < gap) lo = m;
    else hi = m;
  }
  return [a, shifted((lo + hi) / 2)];
}
export function targetFormations(a, b, range) {
  const leading = Math.max(...b.map((p) => p[0])),
    linePrey = b.map((p) => [p[0] - leading, p[1]]);
  const minX = Math.min(...a.map((p) => p[0])),
    minY = Math.min(...a.map((p) => p[1]));
  const shifted = (along, side) =>
    a.map((p) => [p[0] + along - minX, p[1] + side - minY]);
  let side = 2;
  if (minimumGap(shifted(0, side), linePrey) > range) {
    let lo = 0,
      hi = side;
    if (minimumGap(shifted(0, 0), linePrey) > range)
      throw Error("Cannot place formations at the sensing boundary");
    for (let i = 0; i < 100; i++) {
      const m = (lo + hi) / 2;
      if (minimumGap(shifted(0, m), linePrey) <= range) lo = m;
      else hi = m;
    }
    side = lo;
  }
  let lo = 0,
    hi = Math.max(1, range);
  while (minimumGap(shifted(hi, side), linePrey) < range) hi *= 2;
  for (let i = 0; i < 100; i++) {
    const m = (lo + hi) / 2;
    if (minimumGap(shifted(m, side), linePrey) < range) lo = m;
    else hi = m;
  }
  return [
    shifted(lo, side).map((p) => [p[0] - 2, p[1]]),
    b.map((p) => [p[0] - 10, p[1]]),
  ];
}
