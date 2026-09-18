// Adapted from gym-pybullet-drones DSLPIDControl (MIT, Jacopo Panerati).
// See docs/THIRD_PARTY.md. Units: metres, seconds, kilograms, radians, RPM.
export const DRONE = Object.freeze({
  mass: 0.027,
  inertia: [1.4e-5, 1.4e-5, 2.17e-5],
  arm: 0.0397,
  rotorOffset: 0.028,
  kf: 3.16e-10,
  km: 7.94e-12,
  radius: 0.06,
  height: 0.025,
  gravity: 9.8,
});
const clip = (x, a, b) => Math.max(a, Math.min(b, x));
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (a) => {
  const n = Math.hypot(...a);
  return a.map((v) => v / n);
};
export function rotation([x, y, z, w]) {
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
}
export const rotate = (matrix, vector) => matrix.map((row) => dot(row, vector));
export function euler(q) {
  const r = rotation(q);
  return [
    Math.atan2(r[2][1], r[2][2]),
    Math.asin(clip(-r[2][0], -1, 1)),
    Math.atan2(r[1][0], r[0][0]),
  ];
}
export class FlightControl {
  constructor() {
    this.integralPos = [0, 0, 0];
    this.integralRot = [0, 0, 0];
    this.lastRPY = [0, 0, 0];
  }
  compute(
    dt,
    position,
    quaternion,
    velocity,
    targetPosition,
    targetVelocity,
    targetYaw,
    targetYawRate = 0,
  ) {
    const r = rotation(quaternion),
      p = [0.4, 0.4, 1.25],
      d = [0.2, 0.2, 0.5];
    const force = position.map((v, i) => {
      const error = targetPosition[i] - v;
      this.integralPos[i] = clip(
        this.integralPos[i] + error * dt,
        i === 2 ? -0.15 : -2,
        i === 2 ? 0.15 : 2,
      );
      return (
        p[i] * error +
        0.05 * this.integralPos[i] +
        d[i] * (targetVelocity[i] - velocity[i]) +
        (i === 2 ? DRONE.mass * DRONE.gravity : 0)
      );
    });
    const thrust =
      (Math.sqrt(
        Math.max(
          0,
          dot(
            force,
            r.map((row) => row[2]),
          ),
        ) /
          (4 * DRONE.kf),
      ) -
        4070.3) /
      0.2685;
    const z = normalize(force),
      y = normalize(cross(z, [Math.cos(targetYaw), Math.sin(targetYaw), 0])),
      x = cross(y, z);
    const desired = [0, 1, 2].map((i) => [x[i], y[i], z[i]]);
    const product = (a, b, i, j) =>
      a.reduce((s, row, k) => s + row[i] * b[k][j], 0);
    const skew = (i, j) =>
      product(desired, r, i, j) - product(r, desired, i, j);
    const error = [skew(2, 1), skew(0, 2), skew(1, 0)],
      rpy = euler(quaternion);
    const torque = error.map((v, i) => {
      this.integralRot[i] = clip(
        this.integralRot[i] - v * dt,
        i === 2 ? -1500 : -1,
        i === 2 ? 1500 : 1,
      );
      return clip(
        -[70000, 70000, 60000][i] * v +
          [20000, 20000, 12000][i] *
            ((i === 2 ? targetYawRate : 0) - (rpy[i] - this.lastRPY[i]) / dt) +
          [0, 0, 500][i] * this.integralRot[i],
        -3200,
        3200,
      );
    });
    this.lastRPY = rpy;
    return [
      [-0.5, -0.5, -1],
      [-0.5, 0.5, 1],
      [0.5, 0.5, -1],
      [0.5, -0.5, 1],
    ].map(
      (row) => 0.2685 * clip(thrust + dot(row, torque), 20000, 65535) + 4070.3,
    );
  }
}

export function motorWrench(rpm) {
  const forces = rpm.map((v) => DRONE.kf * v * v),
    torques = rpm.map((v) => DRONE.km * v * v),
    a = DRONE.rotorOffset;
  return {
    force: [0, 0, forces.reduce((a, b) => a + b, 0)],
    torque: [
      a * (-forces[0] - forces[1] + forces[2] + forces[3]),
      a * (-forces[0] + forces[1] + forces[2] - forces[3]),
      -torques[0] + torques[1] - torques[2] + torques[3],
    ],
  };
}
