import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { compileController } from "../src/controller/compiler.js";
import { compileConfig, numericParameters } from "../src/config/compiler.js";
import { compileInitializer } from "../src/initializer/compiler.js";

const outDir = process.argv[2] ?? "/tmp/issue100";
await mkdir(outDir, { recursive: true });

const seed = 2026;
const configSource = `N = 91
ARENA_SIZE = 10.0
INITIALIZATION_METHOD = "hexagon_perturbed"
INITIAL_POSITION_NOISE = 0.0
CONTROL_DT = 0.1
SENSOR_NOISE = 0.1
EXPERIMENT_DURATION = 25000.0
U = 0.05
OMEGA_MAX = 1.5707963267948966
K1 = 0.005
K2 = 0.06
POTENTIAL_ALPHA = 2.0
POTENTIAL_EPSILON = 1.5
DESIRED_DISTANCE = 0.45
PROXIMAL_RANGE = 0.81
`;

const initializerSource = `def hexagon_perturbed(config, rng, place):
    radius = ceil((sqrt(12.0 * config.N - 3.0) - 3.0) / 6.0)
    i = 0
    for q in range(-radius, radius + 1):
        for r in range(-radius, radius + 1):
            s = -q - r
            if max(abs(q), abs(r), abs(s)) <= radius:
                if i < config.N:
                    x = config.DESIRED_DISTANCE * (q + 0.5 * r)
                    y = config.DESIRED_DISTANCE * SQRT3_OVER_2 * r
                    x += rng.uniform(-config.INITIAL_POSITION_NOISE, config.INITIAL_POSITION_NOISE)
                    y += rng.uniform(-config.INITIAL_POSITION_NOISE, config.INITIAL_POSITION_NOISE)
                    theta = rng.uniform(0.0, TAU)
                    place(i, x, y, theta)
                    i += 1

def initialize(config, rng, place):
    hexagon_perturbed(config, rng, place)
`;

const controllerSource = `class ActiveElasticAgent(Agent):
    def step(self, obs):
        proximal = Vec2(0.0, 0.0)
        sigma_lj = DESIRED_DISTANCE / pow(2.0, 1.0 / POTENTIAL_ALPHA)
        for neighbour in obs.neighbours:
            displacement = neighbour.relative_position
            distance = norm(displacement)
            ratio = sigma_lj / distance
            magnitude = -(4.0 * POTENTIAL_ALPHA * POTENTIAL_EPSILON / distance) * (2.0 * pow(ratio, 2.0 * POTENTIAL_ALPHA) - pow(ratio, POTENTIAL_ALPHA))
            proximal += magnitude * displacement / distance
        forward = K1 * dot(proximal, obs.heading) + U
        turning = K2 * dot(proximal, perpendicular(obs.heading))
        return Motion(forward, turning)
`;

const config = compileConfig(configSource);
const initializer = compileInitializer(initializerSource, {
  ...config,
  values: { ...config.values, SEED: seed },
});
const parameters = numericParameters(config);
const parameterTypes = Object.fromEntries(Object.keys(parameters).map((name) => [name, "scalar"]));
const ir = compileController(controllerSource, { parameters: parameterTypes });

await Promise.all([
  writeFile(path.join(outDir, "initial-state.json"), JSON.stringify(initializer.state)),
  writeFile(path.join(outDir, "controller-ir.json"), JSON.stringify(ir)),
  writeFile(path.join(outDir, "parameters.json"), JSON.stringify(parameters)),
  writeFile(path.join(outDir, "metadata.json"), JSON.stringify({
    seed,
    physicsDt: 0.01,
    controlDt: 0.1,
    metricDt: 0.1,
    interactionRadius: 0.81,
    arenaSize: 10.0,
    sensorNoise: 0.1,
    maxForwardSpeed: 0.05,
    maxAngularSpeed: 1.5707963267948966,
    U: 0.05,
    agentCount: initializer.state.length,
  }, null, 2)),
]);

console.log(`Generated #100 fixture with ${initializer.state.length} agents, seed ${seed}, U=0.05`);
