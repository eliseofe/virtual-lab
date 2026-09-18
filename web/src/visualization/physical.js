import { rotation, rotate } from "../runtime/backends/flight-control.js";
export const groupColors = ["#d55e00", "#0072b2", "#009e73", "#cc79a7"];
export function drawGroupLegend(ctx, snapshot, ratio) {
  const groups = [...new Set(snapshot.agents.map((a) => a.group))];
  ctx.font = `${12 * ratio}px system-ui`;
  groups.forEach((g, i) => {
    const members = snapshot.agents.filter((a) => a.group === g);
    ctx.fillStyle = groupColors[g % groupColors.length];
    ctx.fillText(
      `${members[0].label}: ${members.filter((a) => a.active).length}/${members.length}`,
      14 * ratio,
      (22 + 20 * i) * ratio,
    );
  });
}
// Orthographic isometric projection of actual Bullet poses; rendering never steps physics.
export function drawPhysicalSnapshot(ctx, snapshot, width, height, ratio) {
  const [w, l, h] = snapshot.bounds;
  const scale = Math.min(
    width / (w + l + 2),
    height / ((w + l) * 0.45 + h + 2),
  );
  const project = ([x, y, z]) => [
    width / 2 + (x - w / 2 - y + l / 2) * scale,
    height * 0.68 + ((x - w / 2 + y - l / 2) * 0.45 - z) * scale,
  ];
  const line = (a, b) => {
    ctx.beginPath();
    ctx.moveTo(...project(a));
    ctx.lineTo(...project(b));
    ctx.stroke();
  };
  ctx.fillStyle = "#f4f7fa";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#c2cdd6";
  ctx.lineWidth = ratio;
  const corners = [
    [0, 0, 0],
    [w, 0, 0],
    [w, l, 0],
    [0, l, 0],
  ];
  corners.forEach((p, i) => {
    line(p, corners[(i + 1) % 4]);
    line(p, [p[0], p[1], h]);
    line([p[0], p[1], h], [...corners[(i + 1) % 4].slice(0, 2), h]);
  });
  for (const a of snapshot.agents
    .filter((a) => a.active)
    .sort(
      (a, b) => a.position[0] + a.position[1] - b.position[0] - b.position[1],
    )) {
    ctx.strokeStyle = ctx.fillStyle = groupColors[a.group % groupColors.length];
    ctx.lineWidth = 2 * ratio;
    const r = rotation(a.quaternion);
    const offset = (v) => rotate(r, v).map((x, i) => x + a.position[i]);
    line(offset([-0.07, -0.07, 0]), offset([0.07, 0.07, 0]));
    line(offset([-0.07, 0.07, 0]), offset([0.07, -0.07, 0]));
    ctx.beginPath();
    ctx.arc(...project(a.position), 2.5 * ratio, 0, Math.PI * 2);
    ctx.fill();
  }
  drawGroupLegend(ctx, snapshot, ratio);
}
