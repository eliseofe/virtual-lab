use std::{env, fs};

use serde::Deserialize;
use vlab_kernel::{
    AgentPhysicalState, IrControllerRuntime, Simulation, SimulationConfig,
    SwarmInitialization, Vec2,
};

#[derive(Deserialize)]
struct InitialAgent {
    x: f64,
    y: f64,
    heading: f64,
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() != 5 {
        eprintln!("usage: issue100_trajectory INITIAL_STATE CONTROLLER_IR PARAMETERS TICKS");
        std::process::exit(2);
    }

    let initial_agents: Vec<InitialAgent> = serde_json::from_str(
        &fs::read_to_string(&args[1]).expect("read initial state"),
    ).expect("parse initial state");
    let controller_ir = fs::read_to_string(&args[2]).expect("read controller IR");
    let parameters = fs::read_to_string(&args[3]).expect("read controller parameters");
    let ticks: u32 = args[4].parse().expect("ticks must be u32");

    let initialization = SwarmInitialization {
        state: initial_agents.into_iter().map(|agent| AgentPhysicalState {
            position: Vec2::new(agent.x, agent.y),
            heading_angle: agent.heading,
        }).collect(),
    };
    let config = SimulationConfig {
        seed: 2026,
        physics_dt: 0.01,
        control_dt: 0.1,
        metric_dt: 0.1,
        interaction_radius: 0.81,
        arena_size: 10.0,
        sensor_noise: 0.1,
        max_forward_speed: 0.05,
        max_angular_speed: 1.5707963267948966,
    };
    let controller = IrControllerRuntime::from_json(&controller_ir, &parameters)
        .expect("controller IR must validate");
    let mut simulation = Simulation::new(initialization, config, controller)
        .expect("simulation must initialize");

    for _ in 0..ticks {
        simulation.advance_physics_ticks(1);
        let snapshot = simulation.snapshot();
        print!("{}|", snapshot.physics_ticks);
        for (index, agent) in snapshot.state.iter().enumerate() {
            if index > 0 { print!(";"); }
            print!(
                "{:016x},{:016x},{:016x}",
                agent.position.x.to_bits(),
                agent.position.y.to_bits(),
                agent.heading_angle.to_bits(),
            );
        }
        println!();
    }
}
