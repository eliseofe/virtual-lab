use std::f64::consts::TAU;
use wasm_bindgen::prelude::*;

mod controller_ir;
pub use controller_ir::IrControllerRuntime;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Vec2 {
    pub x: f64,
    pub y: f64,
}

impl Vec2 {
    pub const ZERO: Vec2 = Vec2 { x: 0.0, y: 0.0 };

    pub fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }

    pub fn dot(self, other: Vec2) -> f64 {
        self.x * other.x + self.y * other.y
    }

    pub fn norm_squared(self) -> f64 {
        self.dot(self)
    }
}

impl std::ops::Add for Vec2 {
    type Output = Vec2;
    fn add(self, rhs: Vec2) -> Vec2 {
        Vec2::new(self.x + rhs.x, self.y + rhs.y)
    }
}

impl std::ops::Sub for Vec2 {
    type Output = Vec2;
    fn sub(self, rhs: Vec2) -> Vec2 {
        Vec2::new(self.x - rhs.x, self.y - rhs.y)
    }
}

impl std::ops::Mul<f64> for Vec2 {
    type Output = Vec2;
    fn mul(self, rhs: f64) -> Vec2 {
        Vec2::new(self.x * rhs, self.y * rhs)
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct AgentPhysicalState {
    pub position: Vec2,
    pub heading_angle: f64,
}

impl AgentPhysicalState {
    pub fn heading(self) -> Vec2 {
        Vec2::new(self.heading_angle.cos(), self.heading_angle.sin())
    }

    pub fn heading_perpendicular(self) -> Vec2 {
        Vec2::new(-self.heading_angle.sin(), self.heading_angle.cos())
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct NeighbourObservation {
    pub relative_position: Vec2,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Observation {
    pub heading: Vec2,
    pub neighbours: Vec<NeighbourObservation>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Action {
    pub forward: f64,
    pub turning: f64,
}

pub trait PhysicsModel {
    fn step(&self, state: &mut [AgentPhysicalState], actuators: &[Action], dt: f64);
}

pub trait ObservationModel {
    fn observe(
        &self,
        state: &[AgentPhysicalState],
        agent_index: usize,
        neighbours: &dyn NeighbourIndex,
        radius: f64,
    ) -> Observation;
}

pub trait NeighbourIndex {
    fn query(
        &self,
        state: &[AgentPhysicalState],
        agent_index: usize,
        radius: f64,
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
        out: &mut Vec<usize>,
    ) {
        out.clear();
        let origin = state[agent_index].position;
        let radius2 = radius * radius;
        for (index, candidate) in state.iter().enumerate() {
            if index == agent_index {
                continue;
            }
            if (candidate.position - origin).norm_squared() <= radius2 {
                out.push(index);
            }
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
    ) -> Observation {
        let mut indices = Vec::new();
        neighbours.query(state, agent_index, radius, &mut indices);
        let origin = state[agent_index].position;
        Observation {
            heading: state[agent_index].heading(),
            neighbours: indices
                .into_iter()
                .map(|index| NeighbourObservation {
                    relative_position: state[index].position - origin,
                })
                .collect(),
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
        Self {
            base_speed,
            attraction,
            turning_gain,
            private_steps: Vec::new(),
        }
    }
}

impl ControllerRuntime for LocalCentroidProbeController {
    fn reset(&mut self, agent_count: usize) {
        self.private_steps = vec![0; agent_count];
    }

    fn step(&mut self, agent_index: usize, observation: &Observation) -> Action {
        self.private_steps[agent_index] = self.private_steps[agent_index].saturating_add(1);
        let force = observation
            .neighbours
            .iter()
            .fold(Vec2::ZERO, |acc, neighbour| acc + neighbour.relative_position);
        let perpendicular = Vec2::new(-observation.heading.y, observation.heading.x);
        Action {
            forward: self.base_speed + self.attraction * force.dot(observation.heading),
            turning: self.turning_gain * force.dot(perpendicular),
        }
    }
}

#[derive(Clone, Debug)]
pub struct SimulationConfig {
    pub agent_count: usize,
    pub physics_dt: f64,
    pub control_dt: f64,
    pub metric_dt: f64,
    pub neighbour_radius: f64,
    pub initial_extent: f64,
}

impl SimulationConfig {
    fn validated_stride(period: f64, physics_dt: f64, name: &str) -> Result<u32, String> {
        if !period.is_finite() || period <= 0.0 {
            return Err(format!("{name} must be finite and positive"));
        }
        let ratio = period / physics_dt;
        let rounded = ratio.round();
        if rounded < 1.0 || (ratio - rounded).abs() > 1e-9 {
            return Err(format!("{name} must be an integer multiple of physics_dt in Round 1B"));
        }
        Ok(rounded as u32)
    }

    fn validate(&self) -> Result<(u32, u32), String> {
        if self.agent_count == 0 {
            return Err("agent_count must be positive".to_owned());
        }
        if !self.physics_dt.is_finite() || self.physics_dt <= 0.0 {
            return Err("physics_dt must be finite and positive".to_owned());
        }
        if !self.neighbour_radius.is_finite() || self.neighbour_radius <= 0.0 {
            return Err("neighbour_radius must be finite and positive".to_owned());
        }
        if !self.initial_extent.is_finite() || self.initial_extent <= 0.0 {
            return Err("initial_extent must be finite and positive".to_owned());
        }
        Ok((
            Self::validated_stride(self.control_dt, self.physics_dt, "control_dt")?,
            Self::validated_stride(self.metric_dt, self.physics_dt, "metric_dt")?,
        ))
    }
}

#[derive(Clone, Debug)]
struct SimulatorRng {
    state: u64,
}

impl SimulatorRng {
    fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9E3779B97F4A7C15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
        z ^ (z >> 31)
    }

    fn unit_f64(&mut self) -> f64 {
        const SCALE: f64 = 1.0 / ((1_u64 << 53) as f64);
        ((self.next_u64() >> 11) as f64) * SCALE
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Snapshot {
    pub scientific_time: f64,
    pub physics_ticks: u32,
    pub state: Vec<AgentPhysicalState>,
}

pub struct Simulation<C: ControllerRuntime> {
    seed: u64,
    config: SimulationConfig,
    control_stride: u32,
    metric_stride: u32,
    state: Vec<AgentPhysicalState>,
    actuators: Vec<Action>,
    physics_ticks: u32,
    control_updates: u32,
    physics: KinematicPhysics,
    observation_model: LocalObservationModel,
    neighbour_index: BruteForceNeighbourIndex,
    controller: C,
    metrics: Vec<Box<dyn MetricRuntime>>,
}

impl<C: ControllerRuntime> Simulation<C> {
    pub fn new(seed: u64, config: SimulationConfig, mut controller: C) -> Result<Self, String> {
        let (control_stride, metric_stride) = config.validate()?;
        controller.reset(config.agent_count);
        let state = Self::initial_state(seed, &config);
        Ok(Self {
            seed,
            actuators: vec![Action::default(); config.agent_count],
            config,
            control_stride,
            metric_stride,
            state,
            physics_ticks: 0,
            control_updates: 0,
            physics: KinematicPhysics,
            observation_model: LocalObservationModel,
            neighbour_index: BruteForceNeighbourIndex,
            controller,
            metrics: Vec::new(),
        })
    }

    fn initial_state(seed: u64, config: &SimulationConfig) -> Vec<AgentPhysicalState> {
        let mut rng = SimulatorRng::new(seed);
        (0..config.agent_count)
            .map(|_| AgentPhysicalState {
                position: Vec2::new(
                    (2.0 * rng.unit_f64() - 1.0) * config.initial_extent,
                    (2.0 * rng.unit_f64() - 1.0) * config.initial_extent,
                ),
                heading_angle: rng.unit_f64() * TAU,
            })
            .collect()
    }

    pub fn add_metric(&mut self, mut metric: Box<dyn MetricRuntime>) {
        metric.reset();
        self.metrics.push(metric);
    }

    pub fn replace_controller(&mut self, controller: C) {
        self.controller = controller;
        self.reset();
    }

    pub fn reset(&mut self) {
        self.state = Self::initial_state(self.seed, &self.config);
        self.actuators.fill(Action::default());
        self.physics_ticks = 0;
        self.control_updates = 0;
        self.controller.reset(self.config.agent_count);
        for metric in &mut self.metrics {
            metric.reset();
        }
    }

    pub fn advance_physics_ticks(&mut self, ticks: u32) {
        for _ in 0..ticks {
            if self.physics_ticks % self.control_stride == 0 {
                let observations: Vec<_> = (0..self.state.len())
                    .map(|agent_index| {
                        self.observation_model.observe(
                            &self.state,
                            agent_index,
                            &self.neighbour_index,
                            self.config.neighbour_radius,
                        )
                    })
                    .collect();
                for (agent_index, observation) in observations.iter().enumerate() {
                    self.actuators[agent_index] = self.controller.step(agent_index, observation);
                }
                self.control_updates = self.control_updates.saturating_add(1);
            }

            self.physics
                .step(&mut self.state, &self.actuators, self.config.physics_dt);
            self.physics_ticks = self.physics_ticks.saturating_add(1);

            if self.physics_ticks % self.metric_stride == 0 {
                let time = self.scientific_time();
                for metric in &mut self.metrics {
                    metric.observe(&self.state, time);
                }
            }
        }
    }

    pub fn scientific_time(&self) -> f64 {
        self.physics_ticks as f64 * self.config.physics_dt
    }

    pub fn physics_ticks(&self) -> u32 {
        self.physics_ticks
    }

    pub fn control_updates(&self) -> u32 {
        self.control_updates
    }

    pub fn snapshot(&self) -> Snapshot {
        Snapshot {
            scientific_time: self.scientific_time(),
            physics_ticks: self.physics_ticks,
            state: self.state.clone(),
        }
    }
}

#[wasm_bindgen]
pub struct ProbeSimulation {
    simulation: Simulation<IrControllerRuntime>,
}

#[wasm_bindgen]
impl ProbeSimulation {
    #[wasm_bindgen(constructor)]
    pub fn new(
        seed: u32,
        agent_count: u32,
        controller_ir_json: &str,
        parameters_json: &str,
    ) -> Result<ProbeSimulation, JsValue> {
        let config = SimulationConfig {
            agent_count: agent_count as usize,
            physics_dt: 0.01,
            control_dt: 0.05,
            metric_dt: 0.10,
            neighbour_radius: 1.5,
            initial_extent: 2.0,
        };
        let controller = IrControllerRuntime::from_json(controller_ir_json, parameters_json)
            .map_err(|message| JsValue::from_str(&message))?;
        let simulation = Simulation::new(seed as u64, config, controller)
            .map_err(|message| JsValue::from_str(&message))?;
        Ok(Self { simulation })
    }

    pub fn set_controller(&mut self, controller_ir_json: &str, parameters_json: &str) -> Result<(), JsValue> {
        let controller = IrControllerRuntime::from_json(controller_ir_json, parameters_json)
            .map_err(|message| JsValue::from_str(&message))?;
        self.simulation.replace_controller(controller);
        Ok(())
    }

    pub fn advance_ticks(&mut self, ticks: u32) -> f64 {
        self.simulation.advance_physics_ticks(ticks);
        self.simulation.scientific_time()
    }

    pub fn reset(&mut self) {
        self.simulation.reset();
    }

    pub fn scientific_time(&self) -> f64 {
        self.simulation.scientific_time()
    }

    pub fn physics_ticks(&self) -> u32 {
        self.simulation.physics_ticks()
    }

    pub fn control_updates(&self) -> u32 {
        self.simulation.control_updates()
    }

    pub fn snapshot_xy(&self) -> Vec<f64> {
        let snapshot = self.simulation.snapshot();
        let mut values = Vec::with_capacity(snapshot.state.len() * 2);
        for agent in snapshot.state {
            values.push(agent.position.x);
            values.push(agent.position.y);
        }
        values
    }
}

#[wasm_bindgen]
pub fn kernel_version() -> String {
    env!("CARGO_PKG_VERSION").to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> SimulationConfig {
        SimulationConfig {
            agent_count: 12,
            physics_dt: 0.01,
            control_dt: 0.05,
            metric_dt: 0.10,
            neighbour_radius: 2.0,
            initial_extent: 1.0,
        }
    }

    fn simulation(seed: u64) -> Simulation<LocalCentroidProbeController> {
        Simulation::new(
            seed,
            config(),
            LocalCentroidProbeController::new(0.1, 0.002, 0.04),
        )
        .unwrap()
    }

    #[test]
    fn same_seed_and_schedule_are_exactly_deterministic() {
        let mut a = simulation(42);
        let mut b = simulation(42);
        a.advance_physics_ticks(250);
        b.advance_physics_ticks(250);
        assert_eq!(a.snapshot(), b.snapshot());
    }

    #[test]
    fn seed_changes_simulator_owned_initialization() {
        let a = simulation(42).snapshot();
        let b = simulation(43).snapshot();
        assert_ne!(a.state, b.state);
    }

    #[test]
    fn renderer_sampling_frequency_cannot_change_trajectory() {
        let mut sparse_render = simulation(7);
        sparse_render.advance_physics_ticks(300);
        let expected = sparse_render.snapshot();

        let mut frequent_render = simulation(7);
        for _ in 0..30 {
            frequent_render.advance_physics_ticks(10);
            let _ = frequent_render.snapshot();
        }
        assert_eq!(expected, frequent_render.snapshot());
    }

    #[test]
    fn control_and_physics_clocks_are_independent() {
        let mut sim = simulation(11);
        sim.advance_physics_ticks(20);
        assert_eq!(sim.physics_ticks(), 20);
        assert_eq!(sim.control_updates(), 4);
        assert!((sim.scientific_time() - 0.20).abs() < 1e-12);
    }

    #[test]
    fn reset_reconstructs_exact_initial_state() {
        let mut sim = simulation(19);
        let initial = sim.snapshot();
        sim.advance_physics_ticks(100);
        sim.reset();
        assert_eq!(initial, sim.snapshot());
    }

    #[test]
    fn brute_force_neighbour_query_is_a_clear_reference_oracle() {
        let state = vec![
            AgentPhysicalState { position: Vec2::new(0.0, 0.0), heading_angle: 0.0 },
            AgentPhysicalState { position: Vec2::new(0.5, 0.0), heading_angle: 0.0 },
            AgentPhysicalState { position: Vec2::new(2.0, 0.0), heading_angle: 0.0 },
        ];
        let mut out = Vec::new();
        BruteForceNeighbourIndex.query(&state, 0, 1.0, &mut out);
        assert_eq!(out, vec![1]);
    }

    struct ConstantController;
    impl ControllerRuntime for ConstantController {
        fn reset(&mut self, _agent_count: usize) {}
        fn step(&mut self, _agent_index: usize, _observation: &Observation) -> Action {
            Action { forward: 1.0, turning: 0.0 }
        }
    }

    #[test]
    fn returned_actions_are_applied_only_by_simulator_physics() {
        let cfg = SimulationConfig {
            agent_count: 1,
            physics_dt: 0.1,
            control_dt: 0.1,
            metric_dt: 0.1,
            neighbour_radius: 1.0,
            initial_extent: 1.0,
        };
        let mut sim = Simulation::new(2, cfg, ConstantController).unwrap();
        let before = sim.snapshot().state[0];
        sim.advance_physics_ticks(1);
        let after = sim.snapshot().state[0];
        let displacement = after.position - before.position;
        assert!((displacement.norm_squared().sqrt() - 0.1).abs() < 1e-12);
    }

    #[test]
    fn invalid_clock_ratio_is_rejected() {
        let mut cfg = config();
        cfg.control_dt = 0.055;
        assert!(Simulation::new(1, cfg, LocalCentroidProbeController::new(0.1, 0.0, 0.0)).is_err());
    }
}
