use std::collections::{BTreeMap, HashMap, VecDeque};

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use crate::{
    parse_initial_state, simulation_config, Action, AgentPhysicalState, ControllerRuntime,
    EnvironmentRuntime, IrControllerRuntime, Simulation, Vec2,
};

const METRICS_LANGUAGE: &str = "python-vlab-metrics/0.1";
const METRICS_IR_SCHEMA: &str = "vlab.metrics-ir/0.1";
const METRIC_MEASUREMENT_PHASE: &str = "post-physics-wrapped-state/1";
const METRIC_SAMPLE_BATCH_VERSION: &str = "vlab.metric-sample-batch/0.1";
const DEFAULT_BUFFER_CAPACITY: usize = 262_144;

#[derive(Debug, Clone, Copy)]
enum Value {
    Scalar(f64),
    Vec2(Vec2),
}

impl Value {
    fn scalar(self, context: &str) -> Result<f64, String> {
        match self {
            Value::Scalar(value) => Ok(value),
            Value::Vec2(_) => Err(format!("{context} expected a scalar")),
        }
    }

    fn vec2(self, context: &str) -> Result<Vec2, String> {
        match self {
            Value::Vec2(value) => Ok(value),
            Value::Scalar(_) => Err(format!("{context} expected a vector")),
        }
    }
}

#[derive(Debug, Deserialize)]
struct MetricsIr {
    schema: String,
    language: String,
    measurement_phase: String,
    #[serde(default)]
    metrics: Vec<MetricDefinition>,
}

#[derive(Debug, Deserialize)]
struct MetricDefinition {
    id: String,
    #[allow(dead_code)]
    name: String,
    #[allow(dead_code)]
    unit: Option<String>,
    sampling: SamplingPolicy,
    #[allow(dead_code)]
    function: String,
    body: Vec<Statement>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum SamplingPolicy {
    Periodic { interval_seconds: f64 },
    Final,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum Statement {
    Assign {
        target: String,
        value: Expression,
        #[serde(default)]
        line: Option<usize>,
    },
    AugAssign {
        target: String,
        op: String,
        value: Expression,
        #[serde(default)]
        line: Option<usize>,
    },
    ForEach {
        variable: String,
        iterable: Expression,
        body: Vec<Statement>,
        #[serde(default)]
        line: Option<usize>,
    },
    Return {
        value: Expression,
        #[serde(default)]
        line: Option<usize>,
    },
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum Expression {
    Const {
        value: f64,
        #[serde(default)]
        line: Option<usize>,
    },
    Load {
        path: String,
        #[serde(default)]
        line: Option<usize>,
    },
    Unary {
        op: String,
        value: Box<Expression>,
        #[serde(default)]
        line: Option<usize>,
    },
    Binary {
        op: String,
        left: Box<Expression>,
        right: Box<Expression>,
        #[serde(default)]
        line: Option<usize>,
    },
    Call {
        name: String,
        args: Vec<Expression>,
        #[serde(default)]
        line: Option<usize>,
    },
}

fn at_line(line: Option<usize>, message: impl AsRef<str>) -> String {
    match line {
        Some(line) => format!("line {line}: {}", message.as_ref()),
        None => message.as_ref().to_owned(),
    }
}

fn validated_stride(period: f64, physics_dt: f64, metric_id: &str) -> Result<u32, String> {
    if !period.is_finite() || period <= 0.0 {
        return Err(format!("metric '{metric_id}' periodic interval must be finite and positive"));
    }
    let ratio = period / physics_dt;
    let rounded = ratio.round();
    if rounded < 1.0 || rounded > u32::MAX as f64 || (ratio - rounded).abs() > 1e-9 {
        return Err(format!(
            "metric '{metric_id}' sampling interval {period} must be an exact integer multiple of PHYSICS_DT={physics_dt}"
        ));
    }
    Ok(rounded as u32)
}

fn binary(op: &str, left: Value, right: Value, line: Option<usize>) -> Result<Value, String> {
    match (op, left, right) {
        ("+", Value::Scalar(a), Value::Scalar(b)) => Ok(Value::Scalar(a + b)),
        ("+", Value::Vec2(a), Value::Vec2(b)) => Ok(Value::Vec2(a + b)),
        ("-", Value::Scalar(a), Value::Scalar(b)) => Ok(Value::Scalar(a - b)),
        ("-", Value::Vec2(a), Value::Vec2(b)) => Ok(Value::Vec2(a - b)),
        ("*", Value::Scalar(a), Value::Scalar(b)) => Ok(Value::Scalar(a * b)),
        ("*", Value::Scalar(a), Value::Vec2(b)) => Ok(Value::Vec2(b * a)),
        ("*", Value::Vec2(a), Value::Scalar(b)) => Ok(Value::Vec2(a * b)),
        ("/", Value::Scalar(a), Value::Scalar(b)) => Ok(Value::Scalar(a / b)),
        ("/", Value::Vec2(a), Value::Scalar(b)) => Ok(Value::Vec2(a * (1.0 / b))),
        _ => Err(at_line(line, format!("invalid metric operands for '{op}'"))),
    }
}

struct EvaluationContext<'a> {
    state: &'a [AgentPhysicalState],
    scientific_time: f64,
    parameters: &'a BTreeMap<String, f64>,
}

fn eval_expression(
    expression: &Expression,
    context: &EvaluationContext<'_>,
    locals: &HashMap<String, Value>,
    loop_agents: &HashMap<String, usize>,
) -> Result<Value, String> {
    match expression {
        Expression::Const { value, line } => {
            if !value.is_finite() {
                return Err(at_line(*line, "metric constants must be finite"));
            }
            Ok(Value::Scalar(*value))
        }
        Expression::Load { path, line } => {
            if path == "snapshot.scientific_time" {
                return Ok(Value::Scalar(context.scientific_time));
            }
            if path == "snapshot.agent_count" {
                return Ok(Value::Scalar(context.state.len() as f64));
            }
            if path == "snapshot.agents" {
                return Err(at_line(*line, "snapshot.agents is iterable only"));
            }
            if let Some(value) = locals.get(path) {
                return Ok(*value);
            }
            if let Some(value) = context.parameters.get(path) {
                return Ok(Value::Scalar(*value));
            }
            if let Some((root, field)) = path.split_once('.') {
                if let Some(index) = loop_agents.get(root) {
                    let agent = context.state.get(*index)
                        .ok_or_else(|| at_line(*line, "metric agent index is outside the snapshot"))?;
                    return match field {
                        "position" => Ok(Value::Vec2(agent.position)),
                        "heading" => Ok(Value::Vec2(agent.heading())),
                        "heading_angle" => Ok(Value::Scalar(agent.heading_angle)),
                        "group" => Ok(Value::Scalar(agent.metadata.group)),
                        "active" => Ok(Value::Scalar(agent.metadata.active)),
                        "status" => Ok(Value::Scalar(agent.metadata.status)),
                        "speed" => Ok(Value::Scalar(agent.metadata.speed)),
                        "altitude" => Ok(Value::Scalar(agent.metadata.altitude)),
                        _ => Err(at_line(*line, format!("unknown metric agent field '{field}'"))),
                    };
                }
            }
            Err(at_line(*line, format!("unknown metric value '{path}'")))
        }
        Expression::Unary { op, value, line } => {
            if op != "-" {
                return Err(at_line(*line, format!("unsupported metric unary operator '{op}'")));
            }
            match eval_expression(value, context, locals, loop_agents)? {
                Value::Scalar(value) => Ok(Value::Scalar(-value)),
                Value::Vec2(value) => Ok(Value::Vec2(value * -1.0)),
            }
        }
        Expression::Binary { op, left, right, line } => binary(
            op,
            eval_expression(left, context, locals, loop_agents)?,
            eval_expression(right, context, locals, loop_agents)?,
            *line,
        ),
        Expression::Call { name, args, line } => {
            let values = args.iter()
                .map(|arg| eval_expression(arg, context, locals, loop_agents))
                .collect::<Result<Vec<_>, _>>()?;
            match name.as_str() {
                "Vec2" if values.len() == 2 => Ok(Value::Vec2(Vec2::new(
                    values[0].scalar("Vec2 argument 1")?,
                    values[1].scalar("Vec2 argument 2")?,
                ))),
                "dot" if values.len() == 2 => Ok(Value::Scalar(
                    values[0].vec2("dot argument 1")?.dot(values[1].vec2("dot argument 2")?),
                )),
                "cross2" if values.len() == 2 => {
                    let a = values[0].vec2("cross2 argument 1")?;
                    let b = values[1].vec2("cross2 argument 2")?;
                    Ok(Value::Scalar(a.x * b.y - a.y * b.x))
                }
                "norm" if values.len() == 1 => Ok(Value::Scalar(
                    values[0].vec2("norm argument")?.norm_squared().sqrt(),
                )),
                "abs" if values.len() == 1 => Ok(Value::Scalar(values[0].scalar("abs argument")?.abs())),
                "sqrt" if values.len() == 1 => Ok(Value::Scalar(values[0].scalar("sqrt argument")?.sqrt())),
                "pow" if values.len() == 2 => Ok(Value::Scalar(
                    values[0].scalar("pow argument 1")?.powf(values[1].scalar("pow argument 2")?),
                )),
                "min" if values.len() == 2 => Ok(Value::Scalar(
                    values[0].scalar("min argument 1")?.min(values[1].scalar("min argument 2")?),
                )),
                "max" if values.len() == 2 => Ok(Value::Scalar(
                    values[0].scalar("max argument 1")?.max(values[1].scalar("max argument 2")?),
                )),
                _ => Err(at_line(*line, format!("unsupported metric call '{name}'"))),
            }
        }
    }
}

fn execute_statements(
    body: &[Statement],
    context: &EvaluationContext<'_>,
    locals: &mut HashMap<String, Value>,
    loop_agents: &mut HashMap<String, usize>,
) -> Result<Option<f64>, String> {
    for statement in body {
        match statement {
            Statement::Assign { target, value, .. } => {
                let value = eval_expression(value, context, locals, loop_agents)?;
                locals.insert(target.clone(), value);
            }
            Statement::AugAssign { target, op, value, line } => {
                if op != "+" {
                    return Err(at_line(*line, format!("unsupported metric augmented operator '{op}'")));
                }
                let current = *locals.get(target)
                    .ok_or_else(|| at_line(*line, format!("metric local '{target}' must exist before '+='")))?;
                let addition = eval_expression(value, context, locals, loop_agents)?;
                locals.insert(target.clone(), binary("+", current, addition, *line)?);
            }
            Statement::ForEach { variable, iterable, body, line } => {
                match iterable {
                    Expression::Load { path, .. } if path == "snapshot.agents" => {}
                    _ => return Err(at_line(*line, "metric loops must iterate over snapshot.agents")),
                }
                for index in 0..context.state.len() {
                    let previous = loop_agents.insert(variable.clone(), index);
                    let returned = execute_statements(body, context, locals, loop_agents)?;
                    match previous {
                        Some(previous) => { loop_agents.insert(variable.clone(), previous); }
                        None => { loop_agents.remove(variable); }
                    }
                    if returned.is_some() {
                        return Ok(returned);
                    }
                }
            }
            Statement::Return { value, line } => {
                let value = eval_expression(value, context, locals, loop_agents)?
                    .scalar("metric return value")?;
                if !value.is_finite() {
                    return Err(at_line(*line, "metric produced a non-finite scalar sample"));
                }
                return Ok(Some(value));
            }
        }
    }
    Ok(None)
}

#[derive(Debug)]
enum RuntimeSampling {
    Periodic { stride: u32 },
    Final,
}

#[derive(Debug)]
struct RuntimeMetric {
    id: String,
    sampling: RuntimeSampling,
    body: Vec<Statement>,
}

#[derive(Debug, Clone, Copy)]
struct RawSample {
    metric_index: usize,
    scientific_time: f64,
    value: f64,
}

#[derive(Debug, Serialize)]
struct SampleOutput {
    metric_id: String,
    scientific_time: f64,
    value: f64,
}

#[derive(Debug, Serialize)]
struct BufferOutput {
    capacity_samples: usize,
    remaining_samples: usize,
    dropped_samples: u64,
    first_dropped_scientific_time: Option<f64>,
    complete: bool,
}

#[derive(Debug, Serialize)]
struct BatchOutput {
    version: &'static str,
    measurement_phase: &'static str,
    batch_sequence: u64,
    samples: Vec<SampleOutput>,
    buffer: BufferOutput,
}

#[derive(Debug)]
pub struct IrMetricsRuntime {
    metrics: Vec<RuntimeMetric>,
    parameters: BTreeMap<String, f64>,
    buffer: VecDeque<RawSample>,
    buffer_capacity: usize,
    dropped_samples: u64,
    first_dropped_scientific_time: Option<f64>,
    batch_sequence: u64,
    finalized: bool,
}

impl IrMetricsRuntime {
    pub fn from_json(metrics_ir_json: &str, parameters_json: &str, physics_dt: f64) -> Result<Self, String> {
        Self::from_json_with_capacity(metrics_ir_json, parameters_json, physics_dt, DEFAULT_BUFFER_CAPACITY)
    }

    fn from_json_with_capacity(
        metrics_ir_json: &str,
        parameters_json: &str,
        physics_dt: f64,
        buffer_capacity: usize,
    ) -> Result<Self, String> {
        if !physics_dt.is_finite() || physics_dt <= 0.0 {
            return Err("Metrics runtime requires a finite positive PHYSICS_DT".to_owned());
        }
        let ir: MetricsIr = serde_json::from_str(metrics_ir_json)
            .map_err(|error| format!("invalid Metrics IR JSON: {error}"))?;
        if ir.schema != METRICS_IR_SCHEMA {
            return Err(format!("unsupported Metrics IR schema '{}'", ir.schema));
        }
        if ir.language != METRICS_LANGUAGE {
            return Err(format!("unsupported Metrics language '{}'", ir.language));
        }
        if ir.measurement_phase != METRIC_MEASUREMENT_PHASE {
            return Err(format!("unsupported Metrics measurement phase '{}'", ir.measurement_phase));
        }
        let parameters: BTreeMap<String, f64> = serde_json::from_str(parameters_json)
            .map_err(|error| format!("invalid metric parameter JSON: {error}"))?;
        if parameters.values().any(|value| !value.is_finite()) {
            return Err("metric parameters must be finite scalars".to_owned());
        }

        let mut seen = std::collections::HashSet::new();
        let mut metrics = Vec::with_capacity(ir.metrics.len());
        for metric in ir.metrics {
            if metric.id.is_empty() || !seen.insert(metric.id.clone()) {
                return Err(format!("duplicate or empty metric id '{}'", metric.id));
            }
            let sampling = match metric.sampling {
                SamplingPolicy::Periodic { interval_seconds } => RuntimeSampling::Periodic {
                    stride: validated_stride(interval_seconds, physics_dt, &metric.id)?,
                },
                SamplingPolicy::Final => RuntimeSampling::Final,
            };
            metrics.push(RuntimeMetric { id: metric.id, sampling, body: metric.body });
        }

        Ok(Self {
            metrics,
            parameters,
            buffer: VecDeque::with_capacity(buffer_capacity.min(4096)),
            buffer_capacity,
            dropped_samples: 0,
            first_dropped_scientific_time: None,
            batch_sequence: 0,
            finalized: false,
        })
    }

    pub fn reset(&mut self) {
        self.buffer.clear();
        self.dropped_samples = 0;
        self.first_dropped_scientific_time = None;
        self.batch_sequence = 0;
        self.finalized = false;
    }

    pub fn metric_count(&self) -> usize { self.metrics.len() }

    pub fn next_due_tick(&self, current_tick: u32, target_tick: u32) -> Option<u32> {
        self.metrics.iter().filter_map(|metric| match metric.sampling {
            RuntimeSampling::Periodic { stride } => {
                let quotient = current_tick / stride;
                let next = quotient.checked_add(1)?.checked_mul(stride)?;
                (next <= target_tick).then_some(next)
            }
            RuntimeSampling::Final => None,
        }).min()
    }

    fn evaluate_metric(
        &self,
        metric_index: usize,
        state: &[AgentPhysicalState],
        scientific_time: f64,
    ) -> Result<f64, String> {
        let metric = &self.metrics[metric_index];
        let context = EvaluationContext { state, scientific_time, parameters: &self.parameters };
        let mut locals = HashMap::new();
        let mut loop_agents = HashMap::new();
        execute_statements(&metric.body, &context, &mut locals, &mut loop_agents)?
            .ok_or_else(|| format!("metric '{}' completed without returning a scalar", metric.id))
    }

    fn append_sample(&mut self, metric_index: usize, scientific_time: f64, value: f64) {
        if self.buffer.len() < self.buffer_capacity {
            self.buffer.push_back(RawSample { metric_index, scientific_time, value });
            return;
        }
        self.dropped_samples = self.dropped_samples.saturating_add(1);
        if self.first_dropped_scientific_time.is_none() {
            self.first_dropped_scientific_time = Some(scientific_time);
        }
    }

    pub fn observe_due(
        &mut self,
        state: &[AgentPhysicalState],
        physics_tick: u32,
        scientific_time: f64,
    ) -> Result<(), String> {
        let due: Vec<usize> = self.metrics.iter().enumerate().filter_map(|(index, metric)| match metric.sampling {
            RuntimeSampling::Periodic { stride } if physics_tick % stride == 0 => Some(index),
            _ => None,
        }).collect();
        for index in due {
            let value = self.evaluate_metric(index, state, scientific_time)
                .map_err(|message| format!("metric '{}': {message}", self.metrics[index].id))?;
            self.append_sample(index, scientific_time, value);
        }
        Ok(())
    }

    pub fn finalize(&mut self, state: &[AgentPhysicalState], scientific_time: f64) -> Result<(), String> {
        if self.finalized { return Ok(()); }
        let final_metrics: Vec<usize> = self.metrics.iter().enumerate().filter_map(|(index, metric)| {
            matches!(metric.sampling, RuntimeSampling::Final).then_some(index)
        }).collect();
        for index in final_metrics {
            let value = self.evaluate_metric(index, state, scientific_time)
                .map_err(|message| format!("metric '{}': {message}", self.metrics[index].id))?;
            self.append_sample(index, scientific_time, value);
        }
        self.finalized = true;
        Ok(())
    }

    fn buffer_output(&self) -> BufferOutput {
        BufferOutput {
            capacity_samples: self.buffer_capacity,
            remaining_samples: self.buffer.len(),
            dropped_samples: self.dropped_samples,
            first_dropped_scientific_time: self.first_dropped_scientific_time,
            complete: self.dropped_samples == 0,
        }
    }

    pub fn drain_json(&mut self, max_samples: usize) -> Result<String, String> {
        let take = max_samples.max(1).min(self.buffer.len());
        let mut samples = Vec::with_capacity(take);
        for _ in 0..take {
            let raw = self.buffer.pop_front().expect("bounded drain count");
            samples.push(SampleOutput {
                metric_id: self.metrics[raw.metric_index].id.clone(),
                scientific_time: raw.scientific_time,
                value: raw.value,
            });
        }
        let output = BatchOutput {
            version: METRIC_SAMPLE_BATCH_VERSION,
            measurement_phase: METRIC_MEASUREMENT_PHASE,
            batch_sequence: self.batch_sequence,
            samples,
            buffer: self.buffer_output(),
        };
        self.batch_sequence = self.batch_sequence.saturating_add(1);
        serde_json::to_string(&output).map_err(|error| format!("could not serialize metric sample batch: {error}"))
    }

    pub fn status_json(&self) -> Result<String, String> {
        serde_json::to_string(&self.buffer_output())
            .map_err(|error| format!("could not serialize metric buffer status: {error}"))
    }
}

#[wasm_bindgen]
pub struct MetricProbeSimulation {
    simulation: Simulation<IrControllerRuntime>,
    metrics: IrMetricsRuntime,
}

#[wasm_bindgen]
impl MetricProbeSimulation {
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
        environment_ir_json: &str,
        controller_ir_json: &str,
        metrics_ir_json: &str,
        parameters_json: &str,
    ) -> Result<MetricProbeSimulation, JsValue> {
        let initialization = parse_initial_state(initial_state_json).map_err(|message| JsValue::from_str(&message))?;
        let config = simulation_config(
            seed, physics_dt, control_dt, metric_dt, interaction_radius, arena_size,
            sensor_noise, max_forward_speed, max_angular_speed,
        );
        let environment = EnvironmentRuntime::from_json(environment_ir_json)
            .map_err(|message| JsValue::from_str(&message))?;
        let controller = IrControllerRuntime::from_json(controller_ir_json, parameters_json)
            .map_err(|message| JsValue::from_str(&message))?;
        let metrics = IrMetricsRuntime::from_json(metrics_ir_json, parameters_json, physics_dt)
            .map_err(|message| JsValue::from_str(&message))?;
        let simulation = Simulation::new_with_environment(initialization, config, controller, environment)
            .map_err(|message| JsValue::from_str(&message))?;
        Ok(Self { simulation, metrics })
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
        environment_ir_json: &str,
        metrics_ir_json: &str,
        parameters_json: &str,
    ) -> Result<(), JsValue> {
        let initialization = parse_initial_state(initial_state_json).map_err(|message| JsValue::from_str(&message))?;
        let config = simulation_config(
            seed, physics_dt, control_dt, metric_dt, interaction_radius, arena_size,
            sensor_noise, max_forward_speed, max_angular_speed,
        );
        let environment = EnvironmentRuntime::from_json(environment_ir_json)
            .map_err(|message| JsValue::from_str(&message))?;
        let metrics = IrMetricsRuntime::from_json(metrics_ir_json, parameters_json, physics_dt)
            .map_err(|message| JsValue::from_str(&message))?;
        self.simulation.replace_setup_with_environment(initialization, config, environment)
            .map_err(|message| JsValue::from_str(&message))?;
        self.metrics = metrics;
        Ok(())
    }

    pub fn set_controller(&mut self, controller_ir_json: &str, parameters_json: &str) -> Result<(), JsValue> {
        let controller = IrControllerRuntime::from_json(controller_ir_json, parameters_json)
            .map_err(|message| JsValue::from_str(&message))?;
        self.simulation.replace_controller(controller);
        self.metrics.reset();
        Ok(())
    }

    pub fn set_metrics(&mut self, metrics_ir_json: &str, parameters_json: &str) -> Result<(), JsValue> {
        let metrics = IrMetricsRuntime::from_json(
            metrics_ir_json,
            parameters_json,
            self.simulation.config.physics_dt,
        ).map_err(|message| JsValue::from_str(&message))?;
        self.metrics = metrics;
        self.simulation.reset();
        Ok(())
    }

    pub fn advance_ticks(&mut self, ticks: u32) -> Result<f64, JsValue> {
        let target = self.simulation.physics_ticks.saturating_add(ticks);
        while self.simulation.physics_ticks < target {
            let current = self.simulation.physics_ticks;
            let due = self.metrics.next_due_tick(current, target);
            let step_target = due.unwrap_or(target);
            self.simulation.advance_physics_ticks(step_target - current);
            if due == Some(step_target) {
                self.metrics.observe_due(
                    &self.simulation.state,
                    self.simulation.physics_ticks,
                    self.simulation.scientific_time(),
                ).map_err(|message| JsValue::from_str(&message))?;
            }
        }
        Ok(self.simulation.scientific_time())
    }

    pub fn finalize_metrics(&mut self) -> Result<(), JsValue> {
        self.metrics.finalize(&self.simulation.state, self.simulation.scientific_time())
            .map_err(|message| JsValue::from_str(&message))
    }

    pub fn drain_metric_samples_json(&mut self, max_samples: u32) -> Result<String, JsValue> {
        self.metrics.drain_json(max_samples as usize)
            .map_err(|message| JsValue::from_str(&message))
    }

    pub fn metric_buffer_status_json(&self) -> Result<String, JsValue> {
        self.metrics.status_json().map_err(|message| JsValue::from_str(&message))
    }

    pub fn metric_count(&self) -> u32 { self.metrics.metric_count() as u32 }
    pub fn reset(&mut self) { self.simulation.reset(); self.metrics.reset(); }
    pub fn scientific_time(&self) -> f64 { self.simulation.scientific_time() }
    pub fn physics_ticks(&self) -> u32 { self.simulation.physics_ticks() }
    pub fn control_updates(&self) -> u32 { self.simulation.control_updates() }
    pub fn neighbour_strategy(&self) -> String { self.simulation.neighbour_strategy().to_owned() }
    pub fn has_environmental_scalar(&self) -> bool { self.simulation.has_environmental_scalar() }
    pub fn sample_environment_grid(&self, resolution: u32) -> Vec<f64> { self.simulation.sample_environment_grid(resolution) }
    pub fn snapshot_state(&self) -> Vec<f64> {
        let mut values = Vec::with_capacity(self.simulation.state.len() * 3);
        for agent in &self.simulation.state {
            values.push(agent.position.x);
            values.push(agent.position.y);
            values.push(agent.heading_angle);
        }
        values
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn metrics_json() -> &'static str {
        r#"{
          "schema":"vlab.metrics-ir/0.1",
          "language":"python-vlab-metrics/0.1",
          "measurement_phase":"post-physics-wrapped-state/1",
          "metrics":[
            {"id":"probe.count","name":"Count","unit":null,"sampling":{"kind":"periodic","interval_seconds":0.1},"function":"count","body":[{"kind":"return","value":{"kind":"load","path":"snapshot.agent_count"}}]},
            {"id":"probe.time","name":"Time","unit":null,"sampling":{"kind":"periodic","interval_seconds":0.2},"function":"time","body":[{"kind":"return","value":{"kind":"load","path":"snapshot.scientific_time"}}]},
            {"id":"probe.final","name":"Final","unit":null,"sampling":{"kind":"final"},"function":"final_value","body":[{"kind":"return","value":{"kind":"load","path":"snapshot.agent_count"}}]}
          ]
        }"#
    }

    fn state() -> Vec<AgentPhysicalState> {
        vec![
            AgentPhysicalState { metadata: Default::default(), position: Vec2::new(0.0, 0.0), heading_angle: 0.0 },
            AgentPhysicalState { metadata: Default::default(), position: Vec2::new(1.0, 0.0), heading_angle: 0.5 },
        ]
    }

    #[test]
    fn multiple_periodic_metrics_keep_independent_cadences_and_identity() {
        let mut metrics = IrMetricsRuntime::from_json(metrics_json(), "{}", 0.01).unwrap();
        let state = state();
        for tick in 1..=20 {
            metrics.observe_due(&state, tick, tick as f64 * 0.01).unwrap();
        }
        let batch: serde_json::Value = serde_json::from_str(&metrics.drain_json(100).unwrap()).unwrap();
        let samples = batch["samples"].as_array().unwrap();
        assert_eq!(samples.len(), 3);
        assert_eq!(samples[0]["metric_id"], "probe.count");
        assert_eq!(samples[0]["scientific_time"], 0.1);
        assert_eq!(samples[1]["metric_id"], "probe.count");
        assert_eq!(samples[1]["scientific_time"], 0.2);
        assert_eq!(samples[2]["metric_id"], "probe.time");
        assert_eq!(samples[2]["scientific_time"], 0.2);
    }

    #[test]
    fn final_metrics_emit_once_at_explicit_finalize() {
        let mut metrics = IrMetricsRuntime::from_json(metrics_json(), "{}", 0.01).unwrap();
        let state = state();
        metrics.finalize(&state, 1.25).unwrap();
        metrics.finalize(&state, 1.25).unwrap();
        let batch: serde_json::Value = serde_json::from_str(&metrics.drain_json(100).unwrap()).unwrap();
        let samples = batch["samples"].as_array().unwrap();
        assert_eq!(samples.len(), 1);
        assert_eq!(samples[0]["metric_id"], "probe.final");
        assert_eq!(samples[0]["scientific_time"], 1.25);
    }

    #[test]
    fn unschedulable_periodic_metric_is_rejected_instead_of_rounded() {
        let source = metrics_json().replace("0.1", "0.105");
        assert!(IrMetricsRuntime::from_json(&source, "{}", 0.01).is_err());
    }

    #[test]
    fn overflow_is_explicit_and_never_silent() {
        let mut metrics = IrMetricsRuntime::from_json_with_capacity(metrics_json(), "{}", 0.01, 1).unwrap();
        let state = state();
        metrics.observe_due(&state, 10, 0.1).unwrap();
        metrics.observe_due(&state, 20, 0.2).unwrap();
        let batch: serde_json::Value = serde_json::from_str(&metrics.drain_json(100).unwrap()).unwrap();
        assert_eq!(batch["samples"].as_array().unwrap().len(), 1);
        assert_eq!(batch["buffer"]["complete"], false);
        assert_eq!(batch["buffer"]["dropped_samples"], 2);
        assert_eq!(batch["buffer"]["first_dropped_scientific_time"], 0.2);
    }


    #[test]
    fn cross2_metric_primitive_evaluates_signed_planar_cross_product() {
        let ir = r#"{
          "schema":"vlab.metrics-ir/0.1",
          "language":"python-vlab-metrics/0.1",
          "measurement_phase":"post-physics-wrapped-state/1",
          "metrics":[{
            "id":"probe.cross","name":"Cross","unit":null,
            "sampling":{"kind":"periodic","interval_seconds":0.1},
            "function":"cross_probe",
            "body":[{"kind":"return","value":{"kind":"call","name":"cross2","args":[
              {"kind":"call","name":"Vec2","args":[{"kind":"const","value":1.0},{"kind":"const","value":0.0}]},
              {"kind":"call","name":"Vec2","args":[{"kind":"const","value":0.0},{"kind":"const","value":1.0}]}
            ]}}]
          }]
        }"#;
        let mut metrics = IrMetricsRuntime::from_json(ir, "{}", 0.01).unwrap();
        metrics.observe_due(&state(), 10, 0.1).unwrap();
        let batch: serde_json::Value = serde_json::from_str(&metrics.drain_json(10).unwrap()).unwrap();
        assert_eq!(batch["samples"][0]["value"], 1.0);
    }

    struct NoopController;
    impl ControllerRuntime for NoopController {
        fn reset(&mut self, _agent_count: usize) {}
        fn step(&mut self, _agent_index: usize, _observation: &crate::Observation) -> Action { Action::default() }
    }

    #[test]
    fn metric_observation_and_drain_do_not_change_simulation_trajectory() {
        let initialization = crate::SwarmInitialization { state: state() };
        let config = crate::SimulationConfig {
            seed: 9,
            physics_dt: 0.01,
            control_dt: 0.1,
            metric_dt: 0.1,
            interaction_radius: 2.0,
            arena_size: 10.0,
            sensor_noise: 0.1,
            max_forward_speed: 1.0,
            max_angular_speed: 1.0,
        };
        let mut baseline = Simulation::new(initialization.clone(), config.clone(), NoopController).unwrap();
        let mut measured = Simulation::new(initialization, config, NoopController).unwrap();
        let mut metrics = IrMetricsRuntime::from_json(metrics_json(), "{}", 0.01).unwrap();
        for _ in 0..20 {
            baseline.advance_physics_ticks(1);
            measured.advance_physics_ticks(1);
            let tick = measured.physics_ticks();
            metrics.observe_due(&measured.state, tick, measured.scientific_time()).unwrap();
            if tick % 7 == 0 { let _ = metrics.drain_json(2).unwrap(); }
        }
        assert_eq!(baseline.snapshot(), measured.snapshot());
    }
}
