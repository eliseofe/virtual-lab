export const CATALOG_SOURCE_PREFIX = "catalog:";

const catalogExperiments = [
  {
    key: "active-elastic",
    title: "Active Elastic — Ferrante et al. (2012)",
    description: "Canonical Active Elastic swarm-robotics experiment.",
    artifacts: [
      { id: "configuration", type: "configuration", label: "Configuration", format: "python-vlab", order: 10, content: "# EXPERIMENT SETUP\n# Number of agents.\nN = 91\n# Side length of the square arena in model distance units. Boundaries are periodic.\nARENA_SIZE = 10.0\n# Initialization method: \"hexagon_perturbed\" or \"random\".\nINITIALIZATION_METHOD = \"hexagon_perturbed\"\n# Maximum independent x/y displacement added to each hex-lattice position.\n# 0.0 gives a perfect lattice.\nINITIAL_POSITION_NOISE = 0.0\n# Controller update period (s). Ferrante et al. (2012) use 0.1 s.\nCONTROL_DT = 0.1\n# Bearing-noise parameter from Ferrante et al. (2012).\n# The simulator applies a uniform bearing perturbation in [-2*pi*sigma, +2*pi*sigma].\nSENSOR_NOISE = 0.1\n# Experiment duration (s).\nEXPERIMENT_DURATION = 25000.0\n\n# CONTROLLER PARAMETERS — Ferrante et al. (2012), MDMC + proximal control\n# Maximum forward speed (distance units/s); the 2012 numeric default corresponds to m/s.\nU = 0.005\n# Maximum angular speed (rad/s).\nOMEGA_MAX = 1.5707963267948966\n# MDMC gains.\nK1 = 0.005\nK2 = 0.06\n# Generalized Lennard-Jones proximal-control parameters.\nPOTENTIAL_ALPHA = 2.0\nPOTENTIAL_EPSILON = 1.5\n# Desired inter-agent distance. Hex-lattice spacing is derived from this value.\nDESIRED_DISTANCE = 0.45\n# Maximum range of proximal interaction.\nPROXIMAL_RANGE = 0.81\n\n# Simulator runtime contract aliases.\nINTERACTION_RADIUS = PROXIMAL_RANGE\nMAX_FORWARD_SPEED = U\nMAX_ANGULAR_SPEED = OMEGA_MAX\n" },
      { id: "initialization", type: "initialization", label: "Initialization", format: "python-vlab", order: 20, content: "def hexagon_perturbed(config, rng, place):\n    # Hexagonal-lattice radius derived from N.\n    radius = ceil((sqrt(12.0 * config.N - 3.0) - 3.0) / 6.0)\n    i = 0\n    for q in range(-radius, radius + 1):\n        for r in range(-radius, radius + 1):\n            s = -q - r\n            if max(abs(q), abs(r), abs(s)) <= radius:\n                if i < config.N:\n                    x = config.DESIRED_DISTANCE * (q + 0.5 * r)\n                    y = config.DESIRED_DISTANCE * SQRT3_OVER_2 * r\n                    x += rng.uniform(-config.INITIAL_POSITION_NOISE, config.INITIAL_POSITION_NOISE)\n                    y += rng.uniform(-config.INITIAL_POSITION_NOISE, config.INITIAL_POSITION_NOISE)\n                    theta = rng.uniform(0.0, TAU)\n                    place(i, x, y, theta)\n                    i += 1\n\ndef random_uniform(config, rng, place):\n    half = config.ARENA_SIZE / 2.0\n    for i in range(config.N):\n        x = rng.uniform(-half, half)\n        y = rng.uniform(-half, half)\n        theta = rng.uniform(0.0, TAU)\n        place(i, x, y, theta)\n\ndef initialize(config, rng, place):\n    if config.INITIALIZATION_METHOD == \"hexagon_perturbed\":\n        hexagon_perturbed(config, rng, place)\n    elif config.INITIALIZATION_METHOD == \"random\":\n        random_uniform(config, rng, place)\n" },
      { id: "controller", type: "controller", label: "Controller", format: "python-vlab", order: 30, content: "class ActiveElasticAgent(Agent):\n    def step(self, obs):\n        proximal = Vec2(0.0, 0.0)\n        sigma_lj = DESIRED_DISTANCE / pow(2.0, 1.0 / POTENTIAL_ALPHA)\n        for neighbour in obs.neighbours:\n            displacement = neighbour.relative_position\n            distance = norm(displacement)\n            ratio = sigma_lj / distance\n            magnitude = -(4.0 * POTENTIAL_ALPHA * POTENTIAL_EPSILON / distance) * (2.0 * pow(ratio, 2.0 * POTENTIAL_ALPHA) - pow(ratio, POTENTIAL_ALPHA))\n            proximal += magnitude * displacement / distance\n        forward = K1 * dot(proximal, obs.heading) + U\n        turning = K2 * dot(proximal, perpendicular(obs.heading))\n        return Motion(forward, turning)\n" },
      { id: "metrics", type: "metrics", label: "Metrics", format: "python-vlab-metrics/0.1", order: 40, content: "# Owner-authorized Active Elastic live metrics.\n# Ferrante et al., Phys. Rev. Lett. 111, 268302 (2013) use polarization to\n# distinguish the translating ordered state from low-polarization motion.\n# The complementary instantaneous normalized angular-momentum/milling order\n# parameter below was explicitly authorized by the experiment owner to measure\n# coherent rotation rather than translation.\n# Sampling at 0.1 s is for live Virtual Lab acceptance/display only.\n@metric(id=\"polarization\", name=\"Polarization order parameter\", unit=None, sampling=every(0.1))\ndef polarization(snapshot):\n    total = Vec2(0.0, 0.0)\n    for agent in snapshot.agents:\n        total += agent.heading\n    return norm(total) / snapshot.agent_count\n\n@metric(id=\"angular_momentum\", name=\"Angular momentum order parameter\", unit=None, sampling=every(0.1))\ndef angular_momentum(snapshot):\n    center = Vec2(0.0, 0.0)\n    for agent in snapshot.agents:\n        center += agent.position\n    center = center / snapshot.agent_count\n    rotation = 0.0\n    for agent in snapshot.agents:\n        radial = agent.position - center\n        radial_hat = radial / max(norm(radial), 1e-12)\n        rotation += cross2(radial_hat, agent.heading)\n    return abs(rotation) / snapshot.agent_count\n" },
    ],
  },
];

export const EXPERIMENT_CATALOG = Object.freeze(catalogExperiments.map((experiment) => Object.freeze({
  ...experiment,
  artifacts: Object.freeze(experiment.artifacts.map((artifact) => Object.freeze({ ...artifact }))),
})));

export const DEFAULT_CATALOG_EXPERIMENT = EXPERIMENT_CATALOG[0];

export function catalogSelectValue(key) {
  return `${CATALOG_SOURCE_PREFIX}${key}`;
}

export function isCatalogSelectValue(value) {
  return typeof value === "string" && value.startsWith(CATALOG_SOURCE_PREFIX);
}

export function catalogExperimentByKey(key) {
  return EXPERIMENT_CATALOG.find((experiment) => experiment.key === key) ?? null;
}

export function catalogExperimentByValue(value) {
  if (!isCatalogSelectValue(value)) return null;
  return catalogExperimentByKey(value.slice(CATALOG_SOURCE_PREFIX.length));
}
