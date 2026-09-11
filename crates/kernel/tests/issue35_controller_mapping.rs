use vlab_kernel::{
    Action, AgentPhysicalState, ControllerRuntime, IrControllerRuntime, KinematicPhysics,
    NeighbourObservation, Observation, PhysicsModel, Simulation, SimulationConfig,
    SwarmInitialization, Vec2,
};

const ACTIVE_ELASTIC_IR: &str = r#"{
  "schema":"vlab.controller-ir/0.1",
  "language":"python-vlab/0.1",
  "controller":"ActiveElasticAgent",
  "entry":"step",
  "parameters":{
    "DESIRED_DISTANCE":"scalar",
    "K1":"scalar",
    "K2":"scalar",
    "POTENTIAL_ALPHA":"scalar",
    "POTENTIAL_EPSILON":"scalar",
    "U":"scalar"
  },
  "state":[],
  "body":[
    {"kind":"assign","target":"proximal","value":{"kind":"call","name":"Vec2","args":[{"kind":"const","value":0.0},{"kind":"const","value":0.0}]}},
    {"kind":"assign","target":"sigma_lj","value":{"kind":"binary","op":"/","left":{"kind":"load","path":"DESIRED_DISTANCE"},"right":{"kind":"call","name":"pow","args":[{"kind":"const","value":2.0},{"kind":"binary","op":"/","left":{"kind":"const","value":1.0},"right":{"kind":"load","path":"POTENTIAL_ALPHA"}}]}}},
    {"kind":"for_each","variable":"neighbour","iterable":{"kind":"load","path":"obs.neighbours"},"body":[
      {"kind":"assign","target":"displacement","value":{"kind":"load","path":"neighbour.relative_position"}},
      {"kind":"assign","target":"distance","value":{"kind":"call","name":"norm","args":[{"kind":"load","path":"displacement"}]}},
      {"kind":"assign","target":"ratio","value":{"kind":"binary","op":"/","left":{"kind":"load","path":"sigma_lj"},"right":{"kind":"load","path":"distance"}}},
      {"kind":"assign","target":"magnitude","value":{"kind":"binary","op":"*","left":{"kind":"unary","op":"-","value":{"kind":"binary","op":"/","left":{"kind":"binary","op":"*","left":{"kind":"binary","op":"*","left":{"kind":"const","value":4.0},"right":{"kind":"load","path":"POTENTIAL_ALPHA"}},"right":{"kind":"load","path":"POTENTIAL_EPSILON"}},"right":{"kind":"load","path":"distance"}}},"right":{"kind":"binary","op":"-","left":{"kind":"binary","op":"*","left":{"kind":"const","value":2.0},"right":{"kind":"call","name":"pow","args":[{"kind":"load","path":"ratio"},{"kind":"binary","op":"*","left":{"kind":"const","value":2.0},"right":{"kind":"load","path":"POTENTIAL_ALPHA"}}]}},"right":{"kind":"call","name":"pow","args":[{"kind":"load","path":"ratio"},{"kind":"load","path":"POTENTIAL_ALPHA"}]}}}},
      {"kind":"aug_assign","target":"proximal","op":"+","value":{"kind":"binary","op":"/","left":{"kind":"binary","op":"*","left":{"kind":"load","path":"magnitude"},"right":{"kind":"load","path":"displacement"}},"right":{"kind":"load","path":"distance"}}}
    ]},
    {"kind":"assign","target":"forward","value":{"kind":"binary","op":"+","left":{"kind":"binary","op":"*","left":{"kind":"load","path":"K1"},"right":{"kind":"call","name":"dot","args":[{"kind":"load","path":"proximal"},{"kind":"load","path":"obs.heading"}]}},"right":{"kind":"load","path":"U"}}},
    {"kind":"assign","target":"turning","value":{"kind":"binary","op":"*","left":{"kind":"load","path":"K2"},"right":{"kind":"call","name":"dot","args":[{"kind":"load","path":"proximal"},{"kind":"call","name":"perpendicular","args":[{"kind":"load","path":"obs.heading"}]}]}}},
    {"kind":"return","value":{"kind":"call","name":"Motion","args":[{"kind":"load","path":"forward"},{"kind":"load","path":"turning"}]}}
  ]
}"#;

const PARAMETERS: &str = r#"{
  "DESIRED_DISTANCE":0.45,
  "K1":0.5,
  "K2":0.06,
  "POTENTIAL_ALPHA":2.0,
  "POTENTIAL_EPSILON":1.5,
  "U":0.005
}"#;

fn controller() -> IrControllerRuntime {
    IrControllerRuntime::from_json(ACTIVE_ELASTIC_IR, PARAMETERS).unwrap()
}

#[test]
fn signed_forward_velocity_really_moves_backward() {
    let physics = KinematicPhysics;
    let mut state = vec![AgentPhysicalState {
        position: Vec2::new(0.0, 0.0),
        heading_angle: 0.0,
    }];
    physics.step(
        &mut state,
        &[Action { forward: -0.005, turning: 0.0 }],
        1.0,
    );
    assert!((state[0].position.x + 0.005).abs() < 1e-12);
    assert!(state[0].position.y.abs() < 1e-12);
}

#[test]
fn exact_controller_can_command_backward_motion() {
    let mut runtime = controller();
    runtime.reset(1);
    let action = runtime.step(
        0,
        &Observation {
            heading: Vec2::new(1.0, 0.0),
            neighbours: vec![NeighbourObservation {
                relative_position: Vec2::new(0.40, 0.0),
            }],
        },
    );
    assert!(action.forward < 0.0, "close neighbour ahead must produce a negative raw forward command");
    assert!(action.turning.abs() < 1e-12);
}

#[test]
fn exact_controller_turns_for_an_off_axis_neighbour() {
    let mut runtime = controller();
    runtime.reset(1);
    let action = runtime.step(
        0,
        &Observation {
            heading: Vec2::new(1.0, 0.0),
            neighbours: vec![NeighbourObservation {
                relative_position: Vec2::new(0.60, 0.05),
            }],
        },
    );
    assert!(action.forward > 0.0);
    assert!(action.turning > 0.0, "a neighbour on the +body-y side must produce a +turn command in the simulator convention");
}

#[test]
fn desired_distance_aligned_pair_translates_together() {
    let init = SwarmInitialization {
        state: vec![
            AgentPhysicalState { position: Vec2::new(-0.225, 0.0), heading_angle: 0.0 },
            AgentPhysicalState { position: Vec2::new( 0.225, 0.0), heading_angle: 0.0 },
        ],
    };
    let config = SimulationConfig {
        seed: 2026,
        physics_dt: 0.01,
        control_dt: 0.1,
        metric_dt: 0.1,
        interaction_radius: 0.81,
        arena_size: 10.0,
        sensor_noise: 0.0,
        max_forward_speed: 0.005,
        max_angular_speed: std::f64::consts::FRAC_PI_2,
    };
    let mut sim = Simulation::new(init, config, controller()).unwrap();
    let before = sim.snapshot().state;
    sim.advance_physics_ticks(100);
    let after = sim.snapshot().state;

    for i in 0..2 {
        assert!((after[i].position.x - before[i].position.x - 0.005).abs() < 1e-10);
        assert!(after[i].position.y.abs() < 1e-10);
        assert!(after[i].heading_angle.abs() < 1e-10);
    }
    assert!(((after[1].position.x - after[0].position.x) - 0.45).abs() < 1e-10);
}
