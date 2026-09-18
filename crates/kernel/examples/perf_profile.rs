use std::hint::black_box;
use std::time::Instant;

use vlab_kernel::{
    Action, AgentPhysicalState, ControllerRuntime, IrControllerRuntime, KinematicPhysics,
    LocalObservationModel, NeighbourIndex, ObservationModel, PeriodicGridNeighbourIndex,
    PhysicsModel, Simulation, SimulationConfig, SwarmInitialization, Vec2,
};

const PHYSICS_DT: f64 = 0.01;
const CONTROL_DT: f64 = 0.10;
const METRIC_DT: f64 = 0.10;

const PERF_IR: &str = r#"{
  "schema":"vlab.controller-ir/0.1",
  "language":"python-vlab/0.1",
  "controller":"PerformanceProbeAgent",
  "entry":"step",
  "parameters":{},
  "state":[],
  "body":[
    {"kind":"assign","target":"sum","value":{"kind":"call","name":"Vec2","args":[{"kind":"const","value":0.0},{"kind":"const","value":0.0}]}},
    {"kind":"for_each","variable":"neighbour","iterable":{"kind":"load","path":"obs.neighbours"},"body":[
      {"kind":"aug_assign","target":"sum","op":"+","value":{"kind":"load","path":"neighbour.relative_position"}}
    ]},
    {"kind":"return","value":{"kind":"call","name":"Motion","args":[
      {"kind":"call","name":"dot","args":[{"kind":"load","path":"sum"},{"kind":"load","path":"obs.heading"}]},
      {"kind":"const","value":0.0}
    ]}}
  ]
}"#;

#[derive(Clone, Copy)]
struct Workload {
    label: &'static str,
    agents: usize,
    radius: f64,
}

fn arena_size_for(agents: usize) -> f64 {
    (agents as f64).sqrt()
}

fn synthetic_state(agents: usize, arena_size: f64) -> Vec<AgentPhysicalState> {
    let side = (agents as f64).sqrt().ceil() as usize;
    let spacing = arena_size / side as f64;
    let half = arena_size / 2.0;
    (0..agents)
        .map(|index| {
            let row = index / side;
            let col = index % side;
            AgentPhysicalState {
                metadata: Default::default(), position: Vec2::new(
                    -half + (col as f64 + 0.5) * spacing,
                    -half + (row as f64 + 0.5) * spacing,
                ),
                heading_angle: ((index % 32) as f64) * 0.03125,
            }
        })
        .collect()
}

fn controller() -> IrControllerRuntime {
    IrControllerRuntime::from_json(PERF_IR, "{}").expect("science-neutral performance IR must validate")
}

fn config(radius: f64, arena_size: f64) -> SimulationConfig {
    SimulationConfig {
        seed: 1,
        physics_dt: PHYSICS_DT,
        control_dt: CONTROL_DT,
        metric_dt: METRIC_DT,
        interaction_radius: radius,
        arena_size,
        sensor_noise: 0.0,
        max_forward_speed: 10_000.0,
        max_angular_speed: 10_000.0,
    }
}

fn median(mut values: Vec<f64>) -> f64 {
    values.sort_by(|a, b| a.partial_cmp(b).expect("finite timing"));
    values[values.len() / 2]
}

fn median_ms(repetitions: usize, mut operation: impl FnMut()) -> f64 {
    let mut samples = Vec::with_capacity(repetitions);
    for _ in 0..repetitions {
        let start = Instant::now();
        operation();
        samples.push(start.elapsed().as_secs_f64() * 1000.0);
    }
    median(samples)
}

fn e2e_ms(
    repetitions: usize,
    initialization: &SwarmInitialization,
    cfg: &SimulationConfig,
    ticks: u32,
) -> f64 {
    let mut simulation = Simulation::new(initialization.clone(), cfg.clone(), controller()).unwrap();
    let mut samples = Vec::with_capacity(repetitions);
    for _ in 0..repetitions {
        simulation.reset();
        let start = Instant::now();
        simulation.advance_physics_ticks(ticks);
        black_box(simulation.physics_ticks());
        samples.push(start.elapsed().as_secs_f64() * 1000.0);
    }
    median(samples)
}

fn run_workload(workload: Workload) {
    let arena_size = arena_size_for(workload.agents);
    let state = synthetic_state(workload.agents, arena_size);
    let repetitions = if workload.agents >= 10_000 { 3 } else { 5 };

    let mut index = PeriodicGridNeighbourIndex::default();
    let rebuild_ms = median_ms(repetitions, || {
        index.rebuild(black_box(&state), arena_size);
        black_box(&index);
    });
    index.rebuild(&state, arena_size);

    let mut neighbour_total = 0usize;
    let query_ms = median_ms(repetitions, || {
        let mut out = Vec::new();
        let mut total = 0usize;
        for agent in 0..state.len() {
            index.query(&state, agent, workload.radius, arena_size, &mut out);
            total += out.len();
        }
        neighbour_total = total;
        black_box(total);
    });
    let average_neighbours = neighbour_total as f64 / workload.agents as f64;

    let observation_model = LocalObservationModel;
    let observation_ms = median_ms(repetitions, || {
        let observations: Vec<_> = (0..state.len())
            .map(|agent| observation_model.observe(&state, agent, &index, workload.radius, arena_size, 0.0))
            .collect();
        black_box(observations.iter().map(|obs| obs.neighbours.len()).sum::<usize>());
    });

    let observations: Vec<_> = (0..state.len())
        .map(|agent| observation_model.observe(&state, agent, &index, workload.radius, arena_size, 0.0))
        .collect();
    let mut runtime = controller();
    runtime.reset(workload.agents);
    let controller_ms = median_ms(repetitions, || {
        for (agent, observation) in observations.iter().enumerate() {
            black_box(runtime.step(agent, observation));
        }
    });

    let physics = KinematicPhysics;
    let mut physics_state = state.clone();
    let actions = vec![Action { forward: 0.1, turning: 0.01 }; workload.agents];
    let physics_ms = median_ms(repetitions, || {
        physics.step(&mut physics_state, &actions, PHYSICS_DT);
        black_box(&physics_state);
    });

    let initialization = SwarmInitialization { state: state.clone() };
    let cfg = config(workload.radius, arena_size);
    let snapshot_sim = Simulation::new(initialization.clone(), cfg.clone(), controller()).unwrap();
    let snapshot_ms = median_ms(repetitions, || {
        black_box(snapshot_sim.snapshot());
    });

    let ticks = if workload.agents >= 10_000 { 100 } else if workload.agents >= 1_000 { 300 } else { 1_000 };
    let end_to_end_ms = e2e_ms(repetitions, &initialization, &cfg, ticks);
    let ticks_per_second = ticks as f64 / (end_to_end_ms / 1000.0);
    let model_seconds_per_wall_second = ticks_per_second * PHYSICS_DT;

    println!(
        "{},{},{:.6},{:.6},{:.3},{:.6},{:.6},{:.6},{:.6},{:.6},{:.6},{},{:.6},{:.3},{:.3}",
        workload.label,
        workload.agents,
        arena_size,
        workload.radius,
        average_neighbours,
        rebuild_ms,
        query_ms,
        observation_ms,
        controller_ms,
        physics_ms,
        snapshot_ms,
        ticks,
        end_to_end_ms,
        ticks_per_second,
        model_seconds_per_wall_second,
    );
}

fn main() {
    println!("vlab_performance_profile_version=1");
    println!("available_parallelism={}", std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1));
    println!("case,agents,arena_size,radius,avg_neighbours,rebuild_ms,query_all_ms,observation_all_ms,controller_all_ms,physics_sweep_ms,snapshot_ms,e2e_ticks,e2e_ms,physics_ticks_per_s,model_seconds_per_wall_second");

    for workload in [
        Workload { label: "agents-100", agents: 100, radius: 1.0 },
        Workload { label: "agents-1000", agents: 1_000, radius: 1.0 },
        Workload { label: "agents-10000", agents: 10_000, radius: 1.0 },
        Workload { label: "radius-0.5", agents: 1_000, radius: 0.5 },
        Workload { label: "radius-2.0", agents: 1_000, radius: 2.0 },
        Workload { label: "radius-4.0", agents: 1_000, radius: 4.0 },
    ] {
        run_workload(workload);
    }
}
