//! Backend-independent access to the existing compiled controller and metric runtimes.
//! Observations are constructed by trusted simulator adapters, never experiment code.
use crate::metrics_ir::IrMetricsRuntime;
use crate::{AgentPhysicalState, ControllerRuntime, IrControllerRuntime, Observation};
use serde::Deserialize;
use wasm_bindgen::prelude::*;

#[derive(Deserialize)]
struct ControllerInput {
    index: usize,
    observation: Observation,
}

#[wasm_bindgen]
pub struct PortableRuntime {
    controller: IrControllerRuntime,
    metrics: IrMetricsRuntime,
    count: usize,
    dt: f64,
}

#[wasm_bindgen]
impl PortableRuntime {
    #[wasm_bindgen(constructor)]
    pub fn new(
        controller: &str,
        metrics: &str,
        parameters: &str,
        count: usize,
        dt: f64,
    ) -> Result<PortableRuntime, JsValue> {
        if count == 0 || count > 10000 || !dt.is_finite() || dt <= 0.0 {
            return Err(JsValue::from_str("Invalid runtime size or timestep"));
        }
        let mut controller = IrControllerRuntime::from_json(controller, parameters).map_err(js)?;
        controller.reset(count);
        let metrics = IrMetricsRuntime::from_json(metrics, parameters, dt).map_err(js)?;
        Ok(Self {
            controller,
            metrics,
            count,
            dt,
        })
    }
    pub fn commands(&mut self, inputs: &str) -> Result<Vec<f64>, JsValue> {
        let inputs: Vec<ControllerInput> =
            serde_json::from_str(inputs).map_err(|e| js(e.to_string()))?;
        let mut seen = std::collections::HashSet::new();
        // Validate the entire batch before mutating any private state.
        for input in &inputs {
            let o = &input.observation;
            if input.index >= self.count
                || !seen.insert(input.index)
                || !o.group.is_finite()
                || !o.heading.x.is_finite()
                || !o.heading.y.is_finite()
                || o.environmental_scalar.is_some_and(|v| !v.is_finite())
                || o.neighbours.iter().any(|n| {
                    !n.group.is_finite()
                        || !n.kind.is_finite()
                        || !n.relative_position.x.is_finite()
                        || !n.relative_position.y.is_finite()
                })
            {
                return Err(js("Invalid observation batch".into()));
            }
        }
        let mut result = Vec::with_capacity(inputs.len() * 2);
        for input in inputs {
            let action = self.controller.step(input.index, &input.observation);
            if !action.forward.is_finite() || !action.turning.is_finite() {
                return Err(js("Non-finite controller action".into()));
            }
            result.extend([action.forward, action.turning]);
        }
        Ok(result)
    }
    pub fn measure(
        &mut self,
        state: &str,
        tick: u32,
        time: f64,
        finalize: bool,
    ) -> Result<(), JsValue> {
        let state: Vec<AgentPhysicalState> =
            serde_json::from_str(state).map_err(|e| js(e.to_string()))?;
        if state.len() != self.count
            || !time.is_finite()
            || time < 0.0
            || state.iter().any(|a| {
                [
                    a.position.x,
                    a.position.y,
                    a.heading_angle,
                    a.metadata.group,
                    a.metadata.active,
                    a.metadata.status,
                    a.metadata.speed,
                    a.metadata.altitude,
                ]
                .iter()
                .any(|v| !v.is_finite())
            })
        {
            return Err(js("Invalid measurement state".into()));
        }
        if finalize {
            self.metrics.finalize(&state, time).map_err(js)
        } else {
            self.metrics.observe_due(&state, tick, time).map_err(js)
        }
    }
    pub fn drain_metric_samples_json(&mut self, count: usize) -> Result<String, JsValue> {
        self.metrics.drain_json(count).map_err(js)
    }
    pub fn set_metrics(&mut self, metrics: &str, parameters: &str) -> Result<(), JsValue> {
        let next = IrMetricsRuntime::from_json(metrics, parameters, self.dt).map_err(js)?;
        self.metrics = next;
        Ok(())
    }
    pub fn metric_count(&self) -> usize {
        self.metrics.metric_count()
    }
    pub fn reset(&mut self) {
        self.controller.reset(self.count);
        self.metrics.reset();
    }
}
fn js(message: String) -> JsValue {
    JsValue::from_str(&message)
}
