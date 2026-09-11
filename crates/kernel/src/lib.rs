use wasm_bindgen::prelude::*;
use serde::Deserialize;

mod controller_ir;
mod neighbour_index;
pub use controller_ir::IrControllerRuntime;
pub use neighbour_index::PeriodicGridNeighbourIndex;

const TAU: f64 = std::f64::consts::PI * 2.0;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Vec2 {
    pub x: f64,
    pub y: f64,
}

impl Vec2 {
    pub const ZERO: Vec2 = Vec2 { x: 0.0, y: 0.0 };
    pub fn new(x: f64, y: f64) -> Self { Self { x, y } }
    pub fn dot(self, other: Vec2) -> f64 { self.x * other.x + self.y * other.y }
    pub fn norm_squared(self) -> f64 { self.dot(self) }
    pub fn rotate(self, angle: f64) -> Vec2 {
        let (sin, cos) = angle.sin_cos();
        Vec2::new(cos * self.x - sin * self.y, sin * self.x + cos * self.y)
    }
}

impl std::ops::Add for Vec2 {
    type Output = Vec2;
    fn add(self, rhs: Vec2) -> Vec2 { Vec2::new(self.x + rhs.x, self.y + rhs.y) }
}
impl std::ops::Sub for Vec2 {
    type Output = Vec2;
    fn sub(self, rhs: Vec2) -> Vec2 { Vec2::new(self.x - rhs.x, self.y - rhs.y) }
}
impl std::ops::Mul<f64> for Vec2 {
    type Output = Vec2;
    fn mul(self, rhs: f64) -> Vec2 { Vec2::new(self.x * rhs, self.y * rhs) }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct AgentPhysicalState {
    pub position: Vec2,
    pub heading_angle: f64,
}

impl AgentPhysicalState {
    pub fn heading(self) -> Vec2 { Vec2::new(self.heading_angle.cos(), self.heading_angle.sin()) }
    pub fn heading_perpendicular(self) -> Vec2 { Vec2::new(-self.heading_angle.sin(), self.heading_angle.cos()) }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct NeighbourObservation { pub relative_position: Vec2 }

#[derive(Clone, Debug, PartialEq)]
pub struct Observation {
    pub heading: Vec2,
    pub neighbours: Vec<NeighbourObservation>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Action { pub forward: f64, pub turning: f64 }

pub trait PhysicsModel { fn step(&self, state: &mut [AgentPhysicalState], actuators: &[Action], dt: f64); }
pub trait ObservationModel {
    fn observe(
        &self,
        state: &[AgentPhysicalState],
        agent_index: usize,
        neighbours: &dyn NeighbourIndex,
        radius: f64,
        arena_size: f64,
        bearing_noise: f64,
    ) -> Observation;
}
pub trait NeighbourIndex {
    fn rebuild(&mut self, _state: &[AgentPhysicalState], _arena_size: f64) {}
    fn query(
        &self,
        state: &[AgentPhysicalState],
        agent_index: usize,
        radius: f64,
        arena_size: f64,
        out: &mut Vec<usize>,
    );
}
pub trait ControllerRuntime {
    fn reset(&mut self, agent_count: usize);
    fn step(&mut self, agent_index: usize, observation: &Observation) -> Action;
}
pub trait MetricRuntime {
    fn reset(&mut self);
    fn observe(&mut self, state: &[AgentPhysicalState], scientific_time: f64);
}

fn minimum_image_component(delta: f64, arena_size: f64) -> f64 {
    delta - arena_size * (delta / arena_size).round()
}

fn minimum_image(delta: Vec2, arena_size: f64) -> Vec2 {
    Vec2::new(
        minimum_image_component(delta.x, arena_size),
        minimum_image_component(delta.y, arena_size),
    )
}

fn wrap_coordinate(value: f64, arena_size: f64) -> f64 {
    let half = arena_size / 2.0;
    if value >= -half && value < half {
        value
    } else {
        (value + half).rem_euclid(arena_size) - half
    }
}

fn wrap_state(state: &mut [AgentPhysicalState], arena_size: f64) {
    for agent in state {
        agent.position.x = wrap_coordinate(agent.position.x, arena_size);
        agent.position.y = wrap_coordinate(agent.position.y, arena_size);
        agent.heading_angle = agent.heading_angle.rem_euclid(TAU);
    }
}

#[derive(Clone, Copy, Debug)]
struct DeterministicRng { state: u64 }

impl DeterministicRng {
    fn new(seed: u32) -> Self { Self { state: seed as u64 } }
    fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9E3779B97F4A7C15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
        z ^ (z >> 31)
    }
    fn unit(&mut self) -> f64 {
        ((self.next_u64() >> 11) as f64) * (1.0 / ((1u64 << 53) as f64))
    }
    fn signed(&mut self) -> f64 { self.unit() * 2.0 - 1.0 }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct KinematicPhysics;
impl PhysicsModel for KinematicPhysics {
    fn step(&self, state: &mut [AgentPhysicalState], actuators: &[Action], dt: f64) {
        assert_eq!(state.len(), actuators.len());
        for (agent, action) in state.iter_mut().zip(actuators.iter()) {
            let heading = agent.heading();
            agent.position = agent.position + heading * (action.forward * dt);
            agent.heading_angle += action.turning * dt;
        }
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct BruteForceNeighbourIndex;
impl NeighbourIndex for BruteForceNeighbourIndex {
    fn query(
        &self,
        state: &[AgentPhysicalState],
        agent_index: usize,
        radius: f64,
        arena_size: f64,
        out: &mut Vec<usize>,
    ) {
        out.clear();
        let origin = state[agent_index].position;
        let radius2 = radius * radius;
        for (index, candidate) in state.iter().enumerate() {
            if index == agent_index { continue; }
            let displacement = minimum_image(candidate.position - origin, arena_size);
            if displacement.norm_squared() <= radius2 { out.push(index); }
        }
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct LocalObservationModel;
impl ObservationModel for LocalObservationModel {
    fn observe(
        &self,
        state: &[AgentPhysicalState],
        agent_index: usize,
        neighbours: &dyn NeighbourIndex,
        radius: f64,
        arena_size: f64,
        bearing_noise: f64,
    ) -> Observation {
        let mut indices = Vec::new();
        neighbours.query(state, agent_index, radius, arena_size, &mut indices);
        let origin = state[agent_index].position;
        Observation {
            heading: state[agent_index].heading(),
            neighbours: indices.into_iter().map(|index| {
                let relative = minimum_image(state[index].position - origin, arena_size).rotate(bearing_noise);
                NeighbourObservation { relative_position: relative }
            }).collect(),
        }
    }
}

#[derive(Clone, Debug)]
pub struct LocalCentroidProbeController {
    base_speed: f64,
    attraction: f64,
    turning_gain: f64,
    private_steps: Vec<u32>,
}
impl LocalCentroidProbeController {
    pub fn new(base_speed: f64, attraction: f64, turning_gain: f64) -> Self {
        Self { base_speed, attraction, turning_gain, private_steps: Vec::new() }
    }
}
impl ControllerRuntime for LocalCentroidProbeController {
    fn reset(&mut self, agent_count: usize) { self.private_steps = vec![0; agent_count]; }
    fn step(&mut self, agent_index: usize, observation: &Observation) -> Action {
        self.private_steps[agent_index] = self.private_steps[agent_index].saturating_add(1);
        let force = observation.neighbours.iter().fold(Vec2::ZERO, |acc, neighbour| acc + neighbour.relative_position);
        let perpendicular = Vec2::new(-observation.heading.y, observation.heading.x);
        Action {
            forward: self.base_speed + self.attraction * force.dot(observation.heading),
            turning: self.turning_gain * force.dot(perpendicular),
        }
    }
}

#[derive(Clone, Debug)]
pub struct SimulationConfig {
    pub seed: u32,
    pub physics_dt: f64,
    pub control_dt: f64,
    pub metric_dt: f64,
    pub interaction_radius: f64,
    pub arena_size: f64,
    pub sensor_noise: f64,
    pub max_forward_speed: f64,
    pub max_angular_speed: f64,
}
impl SimulationConfig {
    fn validated_stride(period: f64, physics_dt: f64, name: &str) -> Result<u32, String> {
        if !period.is_finite() || period <= 0.0 { return Err(format!("{name} must be finite and positive")); }
        let ratio = period / physics_dt;
        let rounded = ratio.round();
        if rounded < 1.0 || (ratio - rounded).abs() > 1e-9 {
            return Err(format!("{name} must be an integer multiple of the simulator integration step"));
        }
        Ok(rounded as u32)
    }
    fn validate(&self) -> Result<(u32, u32), String> {
        if !self.physics_dt.is_finite() || self.physics_dt <= 0.0 { return Err("physics_dt must be finite and positive".to_owned()); }
        if !self.interaction_radius.is_finite() || self.interaction_radius <= 0.0 { return Err("interaction radius must be finite and positive".to_owned()); }
        if !self.arena_size.is_finite() || self.arena_size <= 0.0 { return Err("arena size must be finite and positive".to_owned()); }
        if !self.sensor_noise.is_finite() || self.sensor_noise < 0.0 { return Err("sensor noise must be finite and non-negative".to_owned()); }
        if !self.max_forward_speed.is_finite() || self.max_forward_speed <= 0.0 { return Err("maximum forward speed must be finite and positive".to_owned()); }
        if !self.max_angular_speed.is_finite() || self.max_angular_speed <= 0.0 { return Err("maximum angular speed must be finite and positive".to_owned()); }
        Ok((
            Self::validated_stride(self.control_dt, self.physics_dt, "control_dt")?,
            Self::validated_stride(self.metric_dt, self.physics_dt, "metric_dt")?,
        ))
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct SwarmInitialization { pub state: Vec<AgentPhysicalState> }

impl SwarmInitialization {
    fn validate(&self) -> Result<(), String> {
        if self.state.is_empty() { return Err("initial state must contain at least one agent".to_owned()); }
        for (index, agent) in self.state.iter().enumerate() {
            if !agent.position.x.is_finite() || !agent.position.y.is_finite() || !agent.heading_angle.is_finite() {
                return Err(format!("initial state for agent {index} contains a non-finite value"));
            }
        }
        Ok(())
    }
    fn build_state(&self) -> Vec<AgentPhysicalState> { self.state.clone() }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Snapshot {
    pub scientific_time: f64,
    pub physics_ticks: u32,
    pub state: Vec<AgentPhysicalState>,
}

pub struct Simulation<C: ControllerRuntime> {
    initialization: SwarmInitialization,
    config: SimulationConfig,
    control_stride: u32,
    metric_stride: u32,
    state: Vec<AgentPhysicalState>,
    actuators: Vec<Action>,
    physics_ticks: u32,
    control_updates: u32,
    physics: KinematicPhysics,
    observation_model: LocalObservationModel,
    neighbour_index: PeriodicGridNeighbourIndex,
    controller: C,
    rng: DeterministicRng,
    metrics: Vec<Box<dyn MetricRuntime>>,
}

impl<C: ControllerRuntime> Simulation<C> {
    pub fn new(initialization: SwarmInitialization, config: SimulationConfig, mut controller: C) -> Result<Self, String> {
        initialization.validate()?;
        let (control_stride, metric_stride) = config.validate()?;
        controller.reset(initialization.state.len());
        let mut state = initialization.build_state();
        wrap_state(&mut state, config.arena_size);
        let rng = DeterministicRng::new(config.seed);
        Ok(Self {
            actuators: vec![Action::default(); initialization.state.len()],
            initialization,
            config,
            control_stride,
            metric_stride,
            state,
            physics_ticks: 0,
            control_updates: 0,
            physics: KinematicPhysics,
            observation_model: LocalObservationModel,
            neighbour_index: PeriodicGridNeighbourIndex::default(),
            controller,
            rng,
            metrics: Vec::new(),
        })
    }

    pub fn add_metric(&mut self, mut metric: Box<dyn MetricRuntime>) { metric.reset(); self.metrics.push(metric); }

    pub fn replace_setup(&mut self, initialization: SwarmInitialization, config: SimulationConfig) -> Result<(), String> {
        initialization.validate()?;
        let (control_stride, metric_stride) = config.validate()?;
        self.initialization = initialization;
        self.config = config;
        self.control_stride = control_stride;
        self.metric_stride = metric_stride;
        self.reset();
        Ok(())
    }

    pub fn replace_controller(&mut self, controller: C) { self.controller = controller; self.reset(); }

    pub fn reset(&mut self) {
        self.state = self.initialization.build_state();
        wrap_state(&mut self.state, self.config.arena_size);
        self.actuators = vec![Action::default(); self.state.len()];
        self.physics_ticks = 0;
        self.control_updates = 0;
        self.rng = DeterministicRng::new(self.config.seed);
        self.controller.reset(self.state.len());
        for metric in &mut self.metrics { metric.reset(); }
    }

    pub fn advance_physics_ticks(&mut self, ticks: u32) {
        for _ in 0..ticks {
            if self.physics_ticks % self.control_stride == 0 {
                self.neighbour_index.rebuild(&self.state, self.config.arena_size);
                let noise_scale = self.config.sensor_noise * TAU;
                let noise_angles: Vec<f64> = (0..self.state.len())
                    .map(|_| self.rng.signed() * noise_scale)
                    .collect();
                let observations: Vec<_> = (0..self.state.len()).map(|agent_index| {
                    self.observation_model.observe(
                        &self.state,
                        agent_index,
                        &self.neighbour_index,
                        self.config.interaction_radius,
                        self.config.arena_size,
                        noise_angles[agent_index],
                    )
                }).collect();
                for (agent_index, observation) in observations.iter().enumerate() {
                    let raw = self.controller.step(agent_index, observation);
                    self.actuators[agent_index] = Action {
                        forward: raw.forward.clamp(-self.config.max_forward_speed, self.config.max_forward_speed),
                        turning: raw.turning.clamp(-self.config.max_angular_speed, self.config.max_angular_speed),
                    };
                }
                self.control_updates = self.control_updates.saturating_add(1);
            }
            self.physics.step(&mut self.state, &self.actuators, self.config.physics_dt);
            wrap_state(&mut self.state, self.config.arena_size);
            self.physics_ticks = self.physics_ticks.saturating_add(1);
            if self.physics_ticks % self.metric_stride == 0 {
                let time = self.scientific_time();
                for metric in &mut self.metrics { metric.observe(&self.state, time); }
            }
        }
    }

    pub fn scientific_time(&self) -> f64 { self.physics_ticks as f64 * self.config.physics_dt }
    pub fn physics_ticks(&self) -> u32 { self.physics_ticks }
    pub fn control_updates(&self) -> u32 { self.control_updates }
    pub fn snapshot(&self) -> Snapshot {
        Snapshot { scientific_time: self.scientific_time(), physics_ticks: self.physics_ticks, state: self.state.clone() }
    }
}

#[derive(Deserialize)]
struct InitialAgentJson { x: f64, y: f64, heading: f64 }

fn parse_initial_state(json: &str) -> Result<SwarmInitialization, String> {
    let agents: Vec<InitialAgentJson> = serde_json::from_str(json).map_err(|error| format!("invalid initial state JSON: {error}"))?;
    let initialization = SwarmInitialization {
        state: agents.into_iter().map(|agent| AgentPhysicalState {
            position: Vec2::new(agent.x, agent.y),
            heading_angle: agent.heading,
        }).collect(),
    };
    initialization.validate()?;
    Ok(initialization)
}

fn simulation_config(
    seed: u32,
    physics_dt: f64,
    control_dt: f64,
    metric_dt: f64,
    interaction_radius: f64,
    arena_size: f64,
    sensor_noise: f64,
    max_forward_speed: f64,
    max_angular_speed: f64,
) -> SimulationConfig {
    SimulationConfig {
        seed,
        physics_dt,
        control_dt,
        metric_dt,
        interaction_radius,
        arena_size,
        sensor_noise,
        max_forward_speed,
        max_angular_speed,
    }
}

#[wasm_bindgen]
pub struct ProbeSimulation { simulation: Simulation<IrControllerRuntime> }

#[wasm_bindgen]
impl ProbeSimulation {
    #[wasm_bindgen(constructor)]
    pub fn new(
        initial_state_json: &str,
        seed: u32,
        physics_dt: f64,
        control_dt: f64,
        metric_dt: f64,
        interaction_radius: f64,
        arena_size: f64,
        sensor_noise: f64,
        max_forward_speed: f64,
        max_angular_speed: f64,
        controller_ir_json: &str,
        parameters_json: &str,
    ) -> Result<ProbeSimulation, JsValue> {
        let initialization = parse_initial_state(initial_state_json).map_err(|message| JsValue::from_str(&message))?;
        let config = simulation_config(seed, physics_dt, control_dt, metric_dt, interaction_radius, arena_size, sensor_noise, max_forward_speed, max_angular_speed);
        let controller = IrControllerRuntime::from_json(controller_ir_json, parameters_json).map_err(|message| JsValue::from_str(&message))?;
        let simulation = Simulation::new(initialization, config, controller).map_err(|message| JsValue::from_str(&message))?;
        Ok(Self { simulation })
    }

    pub fn set_setup(
        &mut self,
        initial_state_json: &str,
        seed: u32,
        physics_dt: f64,
        control_dt: f64,
        metric_dt: f64,
        interaction_radius: f64,
        arena_size: f64,
        sensor_noise: f64,
        max_forward_speed: f64,
        max_angular_speed: f64,
    ) -> Result<(), JsValue> {
        let initialization = parse_initial_state(initial_state_json).map_err(|message| JsValue::from_str(&message))?;
        let config = simulation_config(seed, physics_dt, control_dt, metric_dt, interaction_radius, arena_size, sensor_noise, max_forward_speed, max_angular_speed);
        self.simulation.replace_setup(initialization, config).map_err(|message| JsValue::from_str(&message))
    }

    pub fn set_controller(&mut self, controller_ir_json: &str, parameters_json: &str) -> Result<(), JsValue> {
        let controller = IrControllerRuntime::from_json(controller_ir_json, parameters_json).map_err(|message| JsValue::from_str(&message))?;
        self.simulation.replace_controller(controller);
        Ok(())
    }

    pub fn advance_ticks(&mut self, ticks: u32) -> f64 { self.simulation.advance_physics_ticks(ticks); self.simulation.scientific_time() }
    pub fn reset(&mut self) { self.simulation.reset(); }
    pub fn scientific_time(&self) -> f64 { self.simulation.scientific_time() }
    pub fn physics_ticks(&self) -> u32 { self.simulation.physics_ticks() }
    pub fn control_updates(&self) -> u32 { self.simulation.control_updates() }
    pub fn snapshot_state(&self) -> Vec<f64> {
        let snapshot = self.simulation.snapshot();
        let mut values = Vec::with_capacity(snapshot.state.len() * 3);
        for agent in snapshot.state {
            values.push(agent.position.x);
            values.push(agent.position.y);
            values.push(agent.heading_angle);
        }
        values
    }
}

#[wasm_bindgen]
pub fn kernel_version() -> String { env!("CARGO_PKG_VERSION").to_owned() }

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> SimulationConfig {
        SimulationConfig {
            seed: 2026,
            physics_dt: 0.01,
            control_dt: 0.05,
            metric_dt: 0.10,
            interaction_radius: 2.0,
            arena_size: 10.0,
            sensor_noise: 0.0,
            max_forward_speed: 10.0,
            max_angular_speed: 10.0,
        }
    }
    fn initialization(offset: f64, count: usize) -> SwarmInitialization {
        SwarmInitialization {
            state: (0..count).map(|index| AgentPhysicalState {
                position: Vec2::new(offset + index as f64 * 0.1, 0.0),
                heading_angle: index as f64 * 0.01,
            }).collect(),
        }
    }
    fn simulation(offset: f64) -> Simulation<LocalCentroidProbeController> {
        Simulation::new(initialization(offset, 12), config(), LocalCentroidProbeController::new(0.1, 0.002, 0.04)).unwrap()
    }

    #[test]
    fn same_initial_state_schedule_and_seed_are_exactly_deterministic() {
        let mut a = simulation(0.0); let mut b = simulation(0.0);
        a.advance_physics_ticks(250); b.advance_physics_ticks(250);
        assert_eq!(a.snapshot(), b.snapshot());
    }

    #[test]
    fn explicit_initial_state_changes_simulator_start() {
        assert_ne!(simulation(0.0).snapshot().state, simulation(1.0).snapshot().state);
    }

    #[test]
    fn renderer_sampling_frequency_cannot_change_trajectory() {
        let mut sparse_render = simulation(0.0); sparse_render.advance_physics_ticks(300); let expected = sparse_render.snapshot();
        let mut frequent_render = simulation(0.0);
        for _ in 0..30 { frequent_render.advance_physics_ticks(10); let _ = frequent_render.snapshot(); }
        assert_eq!(expected, frequent_render.snapshot());
    }

    #[test]
    fn control_and_physics_clocks_are_independent() {
        let mut sim = simulation(0.0); sim.advance_physics_ticks(20);
        assert_eq!(sim.physics_ticks(), 20); assert_eq!(sim.control_updates(), 4); assert!((sim.scientific_time() - 0.20).abs() < 1e-12);
    }

    #[test]
    fn reset_reconstructs_exact_initial_state_and_noise_stream() {
        let mut sim = simulation(0.0); let initial = sim.snapshot();
        sim.advance_physics_ticks(100); let first = sim.snapshot();
        sim.reset(); assert_eq!(initial, sim.snapshot());
        sim.advance_physics_ticks(100); assert_eq!(first, sim.snapshot());
    }

    #[test]
    fn replacing_setup_restarts_with_new_explicit_state() {
        let mut sim = simulation(0.0); sim.advance_physics_ticks(10);
        let next = initialization(2.0, 5);
        sim.replace_setup(next.clone(), config()).unwrap();
        assert_eq!(sim.snapshot().state, next.state); assert_eq!(sim.physics_ticks(), 0); assert_eq!(sim.control_updates(), 0);
    }

    #[test]
    fn periodic_neighbour_query_uses_minimum_image_distance() {
        let state = vec![
            AgentPhysicalState { position: Vec2::new(-4.9, 0.0), heading_angle: 0.0 },
            AgentPhysicalState { position: Vec2::new(4.9, 0.0), heading_angle: 0.0 },
            AgentPhysicalState { position: Vec2::new(0.0, 0.0), heading_angle: 0.0 },
        ];
        let mut out = Vec::new();
        BruteForceNeighbourIndex.query(&state, 0, 0.5, 10.0, &mut out);
        assert_eq!(out, vec![1]);
        let observation = LocalObservationModel.observe(&state, 0, &BruteForceNeighbourIndex, 0.5, 10.0, 0.0);
        assert!((observation.neighbours[0].relative_position.x + 0.2).abs() < 1e-12);
    }

    struct ConstantController { action: Action }
    impl ControllerRuntime for ConstantController {
        fn reset(&mut self, _agent_count: usize) {}
        fn step(&mut self, _agent_index: usize, _observation: &Observation) -> Action { self.action }
    }

    #[test]
    fn returned_actions_are_applied_only_by_simulator_physics() {
        let mut cfg = config(); cfg.physics_dt = 0.1; cfg.control_dt = 0.1; cfg.metric_dt = 0.1;
        let mut sim = Simulation::new(initialization(0.0, 1), cfg, ConstantController { action: Action { forward: 1.0, turning: 0.0 } }).unwrap();
        let before = sim.snapshot().state[0]; sim.advance_physics_ticks(1); let after = sim.snapshot().state[0];
        let displacement = minimum_image(after.position - before.position, 10.0);
        assert!((displacement.norm_squared().sqrt() - 0.1).abs() < 1e-12);
    }

    #[test]
    fn published_motion_limits_bound_controller_output() {
        let mut cfg = config();
        cfg.physics_dt = 0.1; cfg.control_dt = 0.1; cfg.metric_dt = 0.1;
        cfg.max_forward_speed = 0.5; cfg.max_angular_speed = 0.25;
        let mut sim = Simulation::new(initialization(0.0, 1), cfg, ConstantController { action: Action { forward: 100.0, turning: -100.0 } }).unwrap();
        sim.advance_physics_ticks(1);
        let agent = sim.snapshot().state[0];
        assert!((agent.position.x - 0.05).abs() < 1e-12);
        assert!((agent.heading_angle - (TAU - 0.025)).abs() < 1e-12);
    }

    #[test]
    fn positions_wrap_across_periodic_boundaries() {
        let mut cfg = config();
        cfg.physics_dt = 0.1; cfg.control_dt = 0.1; cfg.metric_dt = 0.1; cfg.arena_size = 1.0;
        let init = SwarmInitialization { state: vec![AgentPhysicalState { position: Vec2::new(0.49, 0.0), heading_angle: 0.0 }] };
        let mut sim = Simulation::new(init, cfg, ConstantController { action: Action { forward: 0.2, turning: 0.0 } }).unwrap();
        sim.advance_physics_ticks(1);
        assert!((sim.snapshot().state[0].position.x + 0.49).abs() < 1e-12);
    }

    #[test]
    fn bearing_noise_rotates_observed_neighbour_bearing_without_changing_range() {
        let state = vec![
            AgentPhysicalState { position: Vec2::new(0.0, 0.0), heading_angle: 0.0 },
            AgentPhysicalState { position: Vec2::new(1.0, 0.0), heading_angle: 0.0 },
        ];
        let observation = LocalObservationModel.observe(&state, 0, &BruteForceNeighbourIndex, 2.0, 10.0, std::f64::consts::FRAC_PI_2);
        let relative = observation.neighbours[0].relative_position;
        assert!(relative.x.abs() < 1e-12);
        assert!((relative.y - 1.0).abs() < 1e-12);
    }

    #[test]
    fn invalid_clock_ratio_is_rejected() {
        let mut cfg = config(); cfg.control_dt = 0.055;
        assert!(Simulation::new(initialization(0.0, 3), cfg, LocalCentroidProbeController::new(0.1, 0.0, 0.0)).is_err());
    }

    #[test]
    fn empty_initial_state_is_rejected() {
        assert!(Simulation::new(SwarmInitialization { state: Vec::new() }, config(), LocalCentroidProbeController::new(0.1, 0.0, 0.0)).is_err());
    }

    #[test]
    fn initial_state_json_is_validated() {
        let parsed = parse_initial_state(r#"[{"x":1.0,"y":2.0,"heading":0.5}]"#).unwrap();
        assert_eq!(parsed.state[0].position, Vec2::new(1.0, 2.0));
        assert!(parse_initial_state("[]").is_err());
    }
}
