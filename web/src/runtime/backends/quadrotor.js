// CF2X rigid-body actuator adapter. High-level equations remain in authored controllers.
import {
  DRONE,
  FlightControl,
  motorWrench,
  rotation,
  rotate,
} from "./flight-control.js";
export class QuadrotorBackend {
  constructor(Ammo, agents, profile) {
    this.A = Ammo;
    this.agents = agents;
    this.profile = profile;
    this.objects = [];
    this.bodies = [];
    this.removed = new Set();
    this.tick = 0;
    const A = Ammo,
      own = (o) => {
        this.objects.push(o);
        return o;
      };
    this.own = own;
    const collision = own(new A.btDefaultCollisionConfiguration()),
      dispatcher = own(new A.btCollisionDispatcher(collision));
    this.world = own(
      new A.btDiscreteDynamicsWorld(
        dispatcher,
        own(new A.btDbvtBroadphase()),
        own(new A.btSequentialImpulseConstraintSolver()),
        collision,
      ),
    );
    this.vector = own(new A.btVector3(0, 0, -DRONE.gravity));
    this.world.setGravity(this.vector);
    this.zero = own(new A.btVector3(0, 0, 0));
    const [w, l, h] = profile.bounds;
    const box = (half, pos) =>
      this.body(
        own(new A.btBoxShape(own(new A.btVector3(...half)))),
        0,
        pos,
        [0, 0, 0, 1],
      );
    box([w / 2, l / 2, 0.05], [w / 2, l / 2, -0.05]);
    box([w / 2, l / 2, 0.05], [w / 2, l / 2, h + 0.05]);
    for (const x of [-0.05, w + 0.05])
      box([0.05, l / 2, h / 2], [x, l / 2, h / 2]);
    for (const y of [-0.05, l + 0.05])
      box([w / 2, 0.05, h / 2], [w / 2, y, h / 2]);
    this.drones = agents.map((a) => {
      const shape = own(
        new A.btCylinderShapeZ(
          own(new A.btVector3(DRONE.radius, DRONE.radius, DRONE.height / 2)),
        ),
      );
      shape.setMargin(0.001);
      const body = this.body(
        shape,
        DRONE.mass,
        a.position,
        a.quaternion,
        DRONE.inertia,
      );
      body.setActivationState(4);
      body.setDamping(0.04, 0.04);
      body.setCcdMotionThreshold(0.025);
      body.setCcdSweptSphereRadius(0.012);
      return { body, pid: new FlightControl(), rpm: [0, 0, 0, 0] };
    });
  }
  body(shape, mass, position, q, inertia = [0, 0, 0]) {
    const A = this.A,
      own = this.own,
      t = own(new A.btTransform());
    t.setIdentity();
    t.setOrigin(own(new A.btVector3(...position)));
    t.setRotation(own(new A.btQuaternion(...q)));
    const motion = own(new A.btDefaultMotionState(t));
    const info = own(
      new A.btRigidBodyConstructionInfo(
        mass,
        motion,
        shape,
        own(new A.btVector3(...inertia)),
      ),
    );
    const body = own(new A.btRigidBody(info));
    body.setFriction(0.5);
    body.setRestitution(0);
    this.world.addRigidBody(body);
    this.bodies.push(body);
    return body;
  }
  read(a, d) {
    const t = d.body.getWorldTransform(),
      p = t.getOrigin(),
      q = t.getRotation(),
      v = d.body.getLinearVelocity();
    a.position = [p.x(), p.y(), p.z()];
    a.quaternion = [q.x(), q.y(), q.z(), q.w()];
    a.velocity = [v.x(), v.y(), v.z()];
  }
  advance(actions, dt) {
    const stride = Math.round(this.profile.flightDt / dt);
    for (const a of this.agents)
      if (a.active) {
        const d = this.drones[a.id],
          action = actions[a.id];
        if (this.tick % stride === 0) {
          const target = [a.position[0], a.position[1], a.profile.altitude];
          const velocity = [
            action.forward * Math.cos(action.heading),
            action.forward * Math.sin(action.heading),
            Math.max(-0.33, Math.min(0.33, target[2] - a.position[2])),
          ];
          d.rpm = d.pid.compute(
            this.profile.flightDt,
            a.position,
            a.quaternion,
            a.velocity,
            target,
            velocity,
            a.heading,
            action.turning,
          );
        }
        const wrench = motorWrench(d.rpm),
          r = rotation(a.quaternion);
        this.vector.setValue(...rotate(r, wrench.force));
        d.body.applyForce(this.vector, this.zero);
        this.vector.setValue(...rotate(r, wrench.torque));
        d.body.applyTorque(this.vector);
      }
    this.world.stepSimulation(dt, 0);
    this.tick++;
    for (const a of this.agents) if (a.active) this.read(a, this.drones[a.id]);
  }
  remove(a) {
    const body = this.drones[a.id].body;
    if (!this.removed.has(body)) {
      this.world.removeRigidBody(body);
      this.removed.add(body);
    }
    a.velocity = [0, 0, 0];
  }
  destroy() {
    for (const b of this.bodies)
      if (!this.removed.has(b)) this.world.removeRigidBody(b);
    for (const o of this.objects.reverse()) this.A.destroy(o);
  }
}
