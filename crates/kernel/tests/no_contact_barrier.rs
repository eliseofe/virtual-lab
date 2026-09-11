use std::f64::consts::PI;

use vlab_kernel::{Action, AgentPhysicalState, KinematicPhysics, PhysicsModel, Vec2};

#[test]
fn agents_pass_through_each_other_without_hidden_contact_response() {
    let physics = KinematicPhysics;
    let mut state = vec![
        AgentPhysicalState { position: Vec2::new(-0.10, 0.0), heading_angle: 0.0 },
        AgentPhysicalState { position: Vec2::new(0.10, 0.0), heading_angle: PI },
    ];
    let actions = vec![
        Action { forward: 1.0, turning: 0.0 },
        Action { forward: 1.0, turning: 0.0 },
    ];

    physics.step(&mut state, &actions, 0.20);

    assert!((state[0].position.x - 0.10).abs() < 1e-12);
    assert!((state[1].position.x + 0.10).abs() < 1e-12);
}
