import {
  equilibriumFormation,
  separatedFormations,
  targetFormations,
} from "./swarm-placement.js";

export const dmController = `class SwarmAgent(Agent):
    def step(self, obs):
        is_attacker = eq(obs.group, 0.0)
        visible = 0.0
        distance_sum = 0.0
        for n in obs.neighbours:
            d = norm(n.relative_position)
            opposite = (1.0 - eq(n.group, obs.group)) * eq(n.kind, 0.0) * le(d, R)
            visible += opposite
            distance_sum += opposite * d
        signal = visible / max(distance_sum, 1e-15) * (1.0 - eq(distance_sum, 0.0))
        response = is_attacker - (1.0 - is_attacker) * DEFENDER_RESPONSE
        sigma = SIGMA * (1.0 + LAMBDA * response * signal)
        force = Vec2(0.0, 0.0)
        for n in obs.neighbours:
            delta = n.relative_position
            raw_distance = norm(delta)
            d = raw_distance + 1e-9
            same = eq(n.group, obs.group) * eq(n.kind, 0.0) * le(d, DP)
            magnitude = EPSILON * (pow(sigma, 2.0) / pow(d, 3.0) - 2.0 * pow(sigma, 4.0) / pow(d, 5.0))
            force += same * magnitude * delta / max(raw_distance, 1e-15)
            target = eq(n.kind, 1.0) * (1.0 - is_attacker)
            force += target * TARGET_GAIN * delta / d
            wall_distance = max(raw_distance, 1e-15)
            wall = eq(n.kind, 2.0) * le(wall_distance, WALL_RADIUS) * (1.0 - eq(raw_distance, 0.0))
            wall_force = WALL_GAIN * (1.0 / wall_distance - 1.0 / WALL_RADIUS) / pow(wall_distance, 3.0)
            force += -1.0 * wall * BOUNDARY_WEIGHT * wall_force * delta / wall_distance
        return Motion(K1 * dot(force, obs.heading) + U0, K2 * dot(force, perpendicular(obs.heading)))`;

export function swarmMetrics() {
  const definitions = [];
  for (const [group, label] of [
    [0, "attackers"],
    [1, "defenders"],
  ]) {
    const prefix = `    count = 0.0\n    total = Vec2(0.0, 0.0)\n    speed = 0.0\n    for a in snapshot.agents:\n        selected = (1.0 - min(1.0, abs(a.group - ${group}.0))) * a.active\n        count += selected\n        total += selected * a.heading\n        speed += selected * a.speed\n`;
    for (const [name, unit, result] of [
      ["active", "agents", "count"],
      ["order", null, "norm(total) / max(count, 1.0)"],
      ["speed", "m/s", "speed / max(count, 1.0)"],
    ])
      definitions.push(
        `@metric(id="${label}_${name}", name="${label} ${name}", unit=${unit ? `"${unit}"` : "None"}, sampling=every(0.1))\ndef ${label}_${name}(snapshot):\n${prefix}    return ${result}`,
      );
  }
  for (const [status, name] of [
    [-1, "captured"],
    [2, "target_success"],
  ])
    definitions.push(
      `@metric(id="${name}", name="Defenders ${name}", unit="agents", sampling=every(0.1))\ndef ${name}(snapshot):\n    total = 0.0\n    for a in snapshot.agents:\n        total += (1.0 - min(1.0, abs(a.group - 1.0))) * (1.0 - min(1.0, abs(a.status - ${status}.0)))\n    return total`,
    );
  return definitions.join("\n\n");
}

export function swarmExperiment({
  dimension = 2,
  caseNumber = 1,
  attackers = dimension === 3 ? 5 : 20,
  defenders = dimension === 3 ? 4 : 30,
  range = 3,
} = {}) {
  if (
    ![2, 3].includes(dimension) ||
    ![1, 2, 3].includes(caseNumber) ||
    !Number.isFinite(range) ||
    range <= 0
  )
    throw Error("Invalid experiment settings");
  if (dimension === 3 && caseNumber !== 1)
    throw Error("The laboratory experiment has boundaries and no target");
  const physical = dimension === 3,
    scale = physical ? 0.3 : 1,
    R = range * scale,
    DP = 3.5 * scale,
    SIGMA = 0.7 * scale;
  const target = !physical && caseNumber !== 1;
  let a = equilibriumFormation(attackers, SIGMA, DP),
    b = equilibriumFormation(defenders, SIGMA, DP);
  [a, b] = target
    ? targetFormations(a, b, R)
    : separatedFormations(a, b, 0.5 * R);
  let positions = [...a, ...b];
  if (physical) {
    const low = [0, 1].map((k) => Math.min(...positions.map((p) => p[k]))),
      high = [0, 1].map((k) => Math.max(...positions.map((p) => p[k])));
    const shift = [
      4.4 / 2 - (low[0] + high[0]) / 2,
      7.9 / 2 - (low[1] + high[1]) / 2,
    ];
    positions = positions.map((p) => p.map((v, k) => v + shift[k]));
    if (
      positions.some(
        (p) => p[0] < 0.12 || p[0] > 4.28 || p[1] < 0.12 || p[1] > 7.78,
      )
    )
      throw Error(
        "These formations do not fit the laboratory; reduce populations or range",
      );
  }
  const profile = {
    schema: "vlab.runtime-profile/1",
    backend: physical ? "quadrotor" : "unicycle",
    physicsDt: physical ? 1 / 240 : 0.05,
    flightDt: physical ? 1 / 120 : undefined,
    topology: physical ? "bounded" : "unbounded",
    bounds: physical ? [4.4, 7.9, 2.2] : undefined,
    motionNoise: physical ? 0 : 0.05,
    profiles: [
      {
        group: 0,
        count: attackers,
        label: "Attackers",
        radius: Math.max(R, DP, 0.5),
        maxSpeed: 0.15,
        maxTurn: Math.PI / 3,
        altitude: physical ? 0.6 : 0,
      },
      {
        group: 1,
        count: defenders,
        label: "Defenders",
        radius: Math.max(R, DP, 0.5),
        maxSpeed: 0.15,
        maxTurn: Math.PI / 3,
        altitude: physical ? 0.5 : 0,
      },
    ],
    rules: [
      ...(target
        ? [
            {
              type: "region",
              targetGroup: 1,
              center: [15, 0],
              distance: 1,
              status: 2,
            },
          ]
        : []),
      {
        type: "proximity",
        sourceGroup: 0,
        targetGroup: 1,
        distance: "$CAPTURE_DISTANCE",
        status: -1,
        metric: "xy",
      },
    ],
    terminalGroup: 1,
    landmarks: target ? [{ group: 1, position: [15, 0], radius: 1e6 }] : [],
    gate: target
      ? {
          observedGroup: 1,
          heldGroup: 0,
          origin: [-10, 0],
          direction: [1, 0],
          threshold: 8,
          blockSensing: true,
        }
      : undefined,
  };
  const values = {
    N: attackers + defenders,
    ARENA_SIZE: target
      ? 40
      : Math.max(
          12,
          ...positions.flatMap((p) => p.map((x) => Math.abs(x) * 2 + 4)),
        ),
    CONTROL_DT: 0.05,
    SENSOR_NOISE: 0,
    EXPERIMENT_DURATION: 1500,
    INTERACTION_RADIUS: Math.max(R, DP),
    MAX_FORWARD_SPEED: 0.15,
    MAX_ANGULAR_SPEED: Math.PI / 3,
    R,
    DP,
    SIGMA,
    EPSILON: 12,
    LAMBDA: physical ? 0.2 : 1,
    DEFENDER_RESPONSE: caseNumber === 2 ? 0 : 1,
    TARGET_GAIN: target ? 0.8 : 0,
    K1: 0.5,
    K2: 0.05,
    U0: 0.05,
    CAPTURE_DISTANCE: 0.5 * scale,
    WALL_RADIUS: 0.5,
    WALL_GAIN: 2,
    BOUNDARY_WEIGHT: physical ? 0.3 : 0,
    INITIALIZATION_METHOD: "swarm_positions",
    RUNTIME_PROFILE: JSON.stringify(profile),
  };
  const configuration = Object.entries(values)
    .map(([k, v]) => `${k} = ${JSON.stringify(v)}`)
    .join("\n");
  const initializer =
    "def initialize(config, rng, place):\n" +
    positions
      .map(
        (p, i) =>
          `    place(${i}, ${p[0]}, ${p[1]}, rng.uniform(-3.141592653589793, 3.141592653589793))`,
      )
      .join("\n");
  const title = `Swarm vs Swarm · ${dimension}D · ${physical ? "Laboratory" : `Case ${caseNumber}`}`;
  const contents = [configuration, initializer, dmController, swarmMetrics()];
  return {
    title,
    description:
      "DM only. Attackers capture defenders. Random headings in both populations. Simulator-owned lifecycle and sensing; experiment-owned forces.",
    artifacts: ["configuration", "initialization", "controller", "metrics"].map(
      (id, i) => ({
        id,
        type: id,
        label: id[0].toUpperCase() + id.slice(1),
        order: (i + 1) * 10,
        format: i === 3 ? "python-vlab-metrics/0.1" : "python-vlab",
        content: contents[i],
      }),
    ),
  };
}
