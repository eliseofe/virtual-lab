use wasm_bindgen::prelude::*;

/// Replaceable scientific evolution boundary. The physics model owns how
/// actuator state changes physical state over one physics interval.
pub trait PhysicsModel<State, Actuator> {
    fn step(&self, state: &mut State, actuator: &Actuator, dt: f64);
}

/// Replaceable simulator-owned observation construction boundary.
pub trait ObservationModel<State, Observation> {
    fn observe(&self, state: &State, agent_index: usize) -> Observation;
}

/// Replaceable neighbourhood query boundary. Round 1B will provide the
/// brute-force oracle implementation before any optimized index is trusted.
pub trait NeighbourIndex {
    fn query(&self, position: [f64; 2], radius: f64, out: &mut Vec<usize>);
}

/// Compiled-controller execution boundary. Controller-private state is owned
/// by the runtime and is not exposed to the environment through this trait.
pub trait ControllerRuntime<Observation, Action> {
    fn step(&mut self, agent_index: usize, observation: &Observation) -> Action;
}

/// Read-only scientific measurement boundary.
pub trait MetricRuntime<State> {
    fn observe(&mut self, state: &State, scientific_time: f64);
}

#[wasm_bindgen]
pub struct ProbeKernel {
    physics_dt: f64,
    scientific_time: f64,
    physics_ticks: u32,
}

#[wasm_bindgen]
impl ProbeKernel {
    #[wasm_bindgen(constructor)]
    pub fn new(physics_dt: f64) -> ProbeKernel {
        assert!(physics_dt.is_finite() && physics_dt > 0.0);
        ProbeKernel {
            physics_dt,
            scientific_time: 0.0,
            physics_ticks: 0,
        }
    }

    /// Advances scientific time explicitly. Browser frame timing does not
    /// enter this API; the worker/orchestrator decides how many scientific
    /// ticks to execute.
    pub fn advance_ticks(&mut self, ticks: u32) -> f64 {
        self.physics_ticks = self.physics_ticks.saturating_add(ticks);
        self.scientific_time = self.physics_ticks as f64 * self.physics_dt;
        self.scientific_time
    }

    pub fn scientific_time(&self) -> f64 {
        self.scientific_time
    }

    pub fn physics_ticks(&self) -> u32 {
        self.physics_ticks
    }

    pub fn reset(&mut self) {
        self.scientific_time = 0.0;
        self.physics_ticks = 0;
    }
}

#[wasm_bindgen]
pub fn kernel_version() -> String {
    env!("CARGO_PKG_VERSION").to_owned()
}

#[cfg(test)]
mod tests {
    use super::ProbeKernel;

    #[test]
    fn scientific_time_is_tick_driven() {
        let mut kernel = ProbeKernel::new(0.1);
        assert!((kernel.advance_ticks(7) - 0.7).abs() < 1e-12);
        assert_eq!(kernel.physics_ticks(), 7);
        assert!((kernel.advance_ticks(3) - 1.0).abs() < 1e-12);
    }

    #[test]
    fn reset_is_exact() {
        let mut kernel = ProbeKernel::new(0.05);
        kernel.advance_ticks(200);
        kernel.reset();
        assert_eq!(kernel.physics_ticks(), 0);
        assert_eq!(kernel.scientific_time(), 0.0);
    }
}
