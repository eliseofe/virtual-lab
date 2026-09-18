export class UnicycleBackend {
  constructor(agents, profile) {
    this.agents = agents;
    this.profile = profile;
  }
  advance(actions, dt, rng) {
    for (const a of this.agents)
      if (a.active) {
        const command = actions[a.id],
          old = a.heading;
        const vx =
          command.forward * Math.cos(old) +
          (rng() * 2 - 1) * this.profile.motionNoise;
        const vy =
          command.forward * Math.sin(old) +
          (rng() * 2 - 1) * this.profile.motionNoise;
        a.position[0] += vx * dt;
        a.position[1] += vy * dt;
        a.heading += command.turning * dt;
        a.velocity = [vx, vy, 0];
        a.quaternion = [0, 0, Math.sin(a.heading / 2), Math.cos(a.heading / 2)];
      }
  }
  remove(a) {
    a.velocity = [0, 0, 0];
  }
  destroy() {}
}
