import { UnicycleBackend } from "./backends/unicycle.js";
import { QuadrotorBackend } from "./backends/quadrotor.js";
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One identity/lifecycle/control pipeline for all opt-in physics backends.
export class ProfileSimulation {
  constructor(wasm, setup, ir, metrics, parameters, Ammo = null) {
    this.wasm = wasm;
    this.setup = structuredClone(setup);
    this.ir = ir;
    this.metrics = metrics;
    this.parameters = parameters;
    this.Ammo = Ammo;
    this.profile = this.setup.profile;
    this.dt = setup.physicsDt;
    this.controlStride = Math.round(setup.controlDt / this.dt);
    this.core = new wasm.PortableRuntime(
      JSON.stringify(ir),
      JSON.stringify(metrics),
      JSON.stringify(parameters),
      setup.initialState.length,
      this.dt,
    );
    this.reset();
  }
  reset() {
    this.backend?.destroy();
    this.core.reset();
    this.rng = seededRandom(this.setup.seed);
    this.tick = 0;
    this.updates = 0;
    this.events = [];
    this.stopReason = null;
    this.pursuitOnset = this.profile.gate ? null : 0;
    const profiles = this.profile.profiles.flatMap((p) =>
      Array.from({ length: p.count }, () => p),
    );
    this.agents = this.setup.initialState.map((a, id) => ({
      id,
      profile: profiles[id],
      group: profiles[id].group,
      position: [a.x, a.y, profiles[id].altitude],
      heading: a.heading,
      quaternion: [0, 0, Math.sin(a.heading / 2), Math.cos(a.heading / 2)],
      velocity: [0, 0, 0],
      status: 0,
      active: true,
    }));
    this.actions = this.agents.map((a) => ({
      forward: 0,
      turning: 0,
      heading: a.heading,
    }));
    this.backend =
      this.profile.backend === "unicycle"
        ? new UnicycleBackend(this.agents, this.profile)
        : new QuadrotorBackend(this.Ammo, this.agents, this.profile);
  }
  updateGate() {
    const g = this.profile.gate;
    if (!g || this.pursuitOnset !== null) return;
    if (
      this.agents.some(
        (a) =>
          a.active &&
          a.group === g.observedGroup &&
          (a.position[0] - g.origin[0]) * g.direction[0] +
            (a.position[1] - g.origin[1]) * g.direction[1] >=
            g.threshold,
      )
    )
      this.pursuitOnset = this.scientific_time();
  }
  observations() {
    const gated = this.profile.gate && this.pursuitOnset === null;
    return this.agents
      .filter((a) => a.active)
      .map((a) => {
        const neighbours = [];
        for (const b of this.agents)
          if (b.active && b.id !== a.id) {
            if (gated && this.profile.gate.blockSensing && a.group !== b.group)
              continue;
            const x = b.position[0] - a.position[0],
              y = b.position[1] - a.position[1];
            if (Math.hypot(x, y) <= a.profile.radius)
              neighbours.push({
                relative_position: { x, y },
                group: b.group,
                kind: 0,
              });
          }
        for (const b of this.profile.landmarks)
          if (a.group === b.group) {
            const x = b.position[0] - a.position[0],
              y = b.position[1] - a.position[1];
            if (Math.hypot(x, y) <= b.radius)
              neighbours.push({
                relative_position: { x, y },
                group: a.group,
                kind: 1,
              });
          }
        // Closest-point wall offsets are local geometric observations, not a force law.
        if (this.profile.topology === "bounded") {
          const [w, l] = this.profile.bounds,
            [x, y] = a.position;
          for (const [dx, dy] of [
            [-x, 0],
            [w - x, 0],
            [0, -y],
            [0, l - y],
          ])
            if (Math.hypot(dx, dy) <= a.profile.radius)
              neighbours.push({
                relative_position: { x: dx, y: dy },
                group: a.group,
                kind: 2,
              });
        }
        const angle =
            (this.rng() * 2 - 1) * this.setup.sensorNoise * 2 * Math.PI,
          c = Math.cos(angle),
          s = Math.sin(angle);
        for (const n of neighbours) {
          const { x, y } = n.relative_position;
          n.relative_position = { x: c * x - s * y, y: s * x + c * y };
        }
        return {
          index: a.id,
          observation: {
            heading: { x: Math.cos(a.heading), y: Math.sin(a.heading) },
            group: a.group,
            neighbours,
            environmental_scalar: null,
          },
        };
      });
  }
  control() {
    this.updateGate();
    const inputs = this.observations(),
      commands = this.core.commands(JSON.stringify(inputs));
    for (let k = 0; k < inputs.length; k++) {
      const a = this.agents[inputs[k].index],
        p = a.profile;
      const held =
        this.profile.gate &&
        this.pursuitOnset === null &&
        a.group === this.profile.gate.heldGroup;
      const forward = held ? 0 : clamp(commands[2 * k], p.minSpeed, p.maxSpeed),
        turning = held ? 0 : clamp(commands[2 * k + 1], -p.maxTurn, p.maxTurn);
      this.actions[a.id] = { forward, turning, heading: a.heading };
      if (this.profile.backend === "quadrotor")
        a.heading += turning * this.setup.controlDt;
    }
    this.updates++;
  }
  resolveEvents() {
    const transitions = new Map();
    // Rules are ordered from lower to higher priority; later matching rules win.
    for (const rule of this.profile.rules)
      for (const target of this.agents)
        if (target.active && target.group === rule.targetGroup) {
          let match;
          if (rule.type === "region")
            match =
              Math.hypot(
                target.position[0] - rule.center[0],
                target.position[1] - rule.center[1],
              ) <= rule.distance;
          else
            match = this.agents.some(
              (source) =>
                source.active &&
                source.group === rule.sourceGroup &&
                Math.hypot(
                  source.position[0] - target.position[0],
                  source.position[1] - target.position[1],
                  rule.metric === "xyz"
                    ? source.position[2] - target.position[2]
                    : 0,
                ) <= rule.distance,
            );
          if (match) transitions.set(target.id, rule.status);
        }
    for (const [id, status] of transitions) {
      const a = this.agents[id];
      a.status = status;
      a.active = false;
      this.backend.remove(a);
      this.events.push({ id, status, time: this.scientific_time() });
    }
    if (
      this.profile.terminalGroup !== undefined &&
      !this.agents.some(
        (a) => a.group === this.profile.terminalGroup && a.active,
      )
    )
      this.stopReason = "group_resolved";
  }
  advance_ticks(ticks) {
    if (!Number.isInteger(ticks) || ticks < 0)
      throw Error("Invalid tick count");
    for (let n = 0; n < ticks && !this.stopReason; n++) {
      if (this.tick % this.controlStride === 0) this.control();
      this.backend.advance(this.actions, this.dt, this.rng);
      this.tick++;
      if (this.tick % this.controlStride === 0) this.resolveEvents();
      this.core.measure(
        JSON.stringify(this.metricState()),
        this.tick,
        this.scientific_time(),
        false,
      );
      if (
        this.agents.some(
          (a) =>
            ![...a.position, ...a.velocity, a.heading, ...a.quaternion].every(
              Number.isFinite,
            ),
        )
      )
        throw Error("Non-finite physical state");
    }
  }
  metricState() {
    return this.agents.map((a) => ({
      position: { x: a.position[0], y: a.position[1] },
      heading_angle:
        this.profile.backend === "quadrotor"
          ? Math.atan2(
              2 *
                (a.quaternion[3] * a.quaternion[2] +
                  a.quaternion[0] * a.quaternion[1]),
              1 - 2 * (a.quaternion[1] ** 2 + a.quaternion[2] ** 2),
            )
          : a.heading,
      metadata: {
        group: a.group,
        active: Number(a.active),
        status: a.status,
        speed: Math.hypot(...a.velocity),
        altitude: a.position[2],
      },
    }));
  }
  finalize_metrics() {
    this.core.measure(
      JSON.stringify(this.metricState()),
      this.tick,
      this.scientific_time(),
      true,
    );
  }
  drain_metric_samples_json(n) {
    const batch = JSON.parse(this.core.drain_metric_samples_json(n));
    batch.measurement_phase = "post-physics-state/1";
    return JSON.stringify(batch);
  }
  metric_count() {
    return this.core.metric_count();
  }
  scientific_time() {
    return this.tick * this.dt;
  }
  physics_ticks() {
    return this.tick;
  }
  control_updates() {
    return this.updates;
  }
  neighbour_strategy() {
    return "role-filtered-euclidean-reference/v1";
  }
  has_environmental_scalar() {
    return false;
  }
  sample_environment_grid() {
    return [];
  }
  snapshot_state() {
    return this.agents.flatMap((a) => [
      a.position[0],
      a.position[1],
      a.heading,
    ]);
  }
  snapshot_metadata() {
    return {
      backend: this.profile.backend,
      bounds: this.profile.bounds,
      stopReason: this.stopReason,
      pursuitOnset: this.pursuitOnset,
      events: this.events.slice(),
      agents: this.agents.map((a) => ({
        id: a.id,
        group: a.group,
        label: a.profile.label,
        active: a.active,
        status: a.status,
        position: a.position.slice(),
        quaternion: a.quaternion.slice(),
        velocity: a.velocity.slice(),
      })),
    };
  }
  set_controller(ir, parameters) {
    const parsed = JSON.parse(ir);
    const values = JSON.parse(parameters);
    // Validate the candidate before replacing a working controller or its state.
    const next = new this.wasm.PortableRuntime(
      JSON.stringify(parsed),
      JSON.stringify(this.metrics),
      parameters,
      this.agents.length,
      this.dt,
    );
    this.core.free();
    this.ir = parsed;
    this.parameters = values;
    this.core = next;
    this.reset();
  }
  set_metrics(metrics, parameters) {
    this.core.set_metrics(metrics, parameters);
    this.metrics = JSON.parse(metrics);
  }
  free() {
    this.backend.destroy();
    this.core.free();
  }
}
