use std::collections::{BTreeMap, HashMap, HashSet};

use serde::Deserialize;

use crate::{Action, ControllerRuntime, NeighbourObservation, Observation, Vec2};

#[derive(Debug, Clone, Copy)]
enum Value {
    Scalar(f64),
    Vec2(Vec2),
    Action(Action),
}

impl Value {
    fn scalar(self) -> f64 {
        match self { Value::Scalar(value) => value, _ => unreachable!("validated controller scalar") }
    }
    fn vec2(self) -> Vec2 {
        match self { Value::Vec2(value) => value, _ => unreachable!("validated controller vector") }
    }
    fn action(self) -> Action {
        match self { Value::Action(value) => value, _ => unreachable!("validated controller action") }
    }
}

#[derive(Debug, Deserialize)]
struct ControllerIr {
    schema: String,
    language: String,
    #[allow(dead_code)]
    controller: String,
    entry: String,
    #[serde(default)]
    parameters: BTreeMap<String, String>,
    #[serde(default)]
    state: Vec<StateDeclaration>,
    body: Vec<Statement>,
}

#[derive(Debug, Deserialize)]
struct StateDeclaration {
    name: String,
    #[serde(rename = "type")]
    value_type: String,
    initial: f64,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum Statement {
    Assign { target: String, value: Expression, #[serde(default)] line: Option<usize> },
    AugAssign { target: String, op: String, value: Expression, #[serde(default)] line: Option<usize> },
    ForEach { variable: String, iterable: Expression, body: Vec<Statement>, #[serde(default)] line: Option<usize> },
    Return { value: Expression, #[serde(default)] line: Option<usize> },
}

impl Statement {
    fn line(&self) -> Option<usize> {
        match self {
            Statement::Assign { line, .. }
            | Statement::AugAssign { line, .. }
            | Statement::ForEach { line, .. }
            | Statement::Return { line, .. } => *line,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum Expression {
    Const { value: f64, #[serde(default)] line: Option<usize> },
    Load { path: String, #[serde(default)] line: Option<usize> },
    Unary { op: String, value: Box<Expression>, #[serde(default)] line: Option<usize> },
    Binary { op: String, left: Box<Expression>, right: Box<Expression>, #[serde(default)] line: Option<usize> },
    Call { name: String, args: Vec<Expression>, #[serde(default)] line: Option<usize> },
}

impl Expression {
    fn line(&self) -> Option<usize> {
        match self {
            Expression::Const { line, .. }
            | Expression::Load { line, .. }
            | Expression::Unary { line, .. }
            | Expression::Binary { line, .. }
            | Expression::Call { line, .. } => *line,
        }
    }
}

fn at_line(line: Option<usize>, message: impl AsRef<str>) -> String {
    match line {
        Some(line) => format!("line {line}: {}", message.as_ref()),
        None => message.as_ref().to_owned(),
    }
}

fn validate_expression(
    expression: &Expression,
    parameters: &HashSet<String>,
    state: &HashSet<String>,
    locals: &HashSet<String>,
    loop_variable: Option<&str>,
) -> Result<(), String> {
    match expression {
        Expression::Const { value, line } => {
            if !value.is_finite() { return Err(at_line(*line, "numeric constants must be finite")); }
        }
        Expression::Load { path, line } => {
            if path == "obs.heading" || path == "obs.neighbours" { return Ok(()); }
            if let Some(name) = path.strip_prefix("self.") {
                if state.contains(name) { return Ok(()); }
                return Err(at_line(*line, format!("private state '{name}' is not declared")));
            }
            if let Some(variable) = loop_variable {
                if path == &format!("{variable}.relative_position") { return Ok(()); }
            }
            if path.contains('.') {
                return Err(at_line(*line, format!("observation field '{path}' is unavailable")));
            }
            if parameters.contains(path) || locals.contains(path) { return Ok(()); }
            return Err(at_line(*line, format!("unknown identifier '{path}'")));
        }
        Expression::Unary { op, value, line } => {
            if op != "-" { return Err(at_line(*line, format!("unsupported unary operator '{op}'"))); }
            validate_expression(value, parameters, state, locals, loop_variable)?;
        }
        Expression::Binary { op, left, right, line } => {
            if !matches!(op.as_str(), "+" | "-" | "*" | "/") {
                return Err(at_line(*line, format!("unsupported binary operator '{op}'")));
            }
            validate_expression(left, parameters, state, locals, loop_variable)?;
            validate_expression(right, parameters, state, locals, loop_variable)?;
        }
        Expression::Call { name, args, line } => {
            let arity = match name.as_str() {
                "Vec2" | "dot" | "pow" | "Motion" => 2,
                "perpendicular" | "norm" => 1,
                _ => return Err(at_line(*line, format!("unsupported call '{name}'"))),
            };
            if args.len() != arity { return Err(at_line(*line, format!("{name} expects {arity} arguments"))); }
            for arg in args { validate_expression(arg, parameters, state, locals, loop_variable)?; }
        }
    }
    Ok(())
}

fn validate_statements(
    body: &[Statement],
    parameters: &HashSet<String>,
    state: &HashSet<String>,
    locals: &mut HashSet<String>,
    loop_variable: Option<&str>,
) -> Result<bool, String> {
    let mut returns = false;
    for statement in body {
        match statement {
            Statement::Assign { target, value, line } => {
                validate_expression(value, parameters, state, locals, loop_variable)?;
                if let Some(name) = target.strip_prefix("self.") {
                    if !state.contains(name) { return Err(at_line(*line, format!("private state '{name}' is not declared"))); }
                } else {
                    if parameters.contains(target) || target == "obs" || loop_variable == Some(target.as_str()) {
                        return Err(at_line(*line, format!("cannot assign to scientific input '{target}'")));
                    }
                    locals.insert(target.clone());
                }
            }
            Statement::AugAssign { target, op, value, line } => {
                if op != "+" { return Err(at_line(*line, format!("unsupported augmented operator '{op}'"))); }
                validate_expression(value, parameters, state, locals, loop_variable)?;
                if let Some(name) = target.strip_prefix("self.") {
                    if !state.contains(name) { return Err(at_line(*line, format!("private state '{name}' is not declared"))); }
                } else if !locals.contains(target) {
                    return Err(at_line(*line, format!("local '{target}' must be assigned before '+='")));
                }
            }
            Statement::ForEach { variable, iterable, body, line } => {
                match iterable {
                    Expression::Load { path, .. } if path == "obs.neighbours" => {}
                    _ => return Err(at_line(*line, "for loop must iterate over obs.neighbours")),
                }
                if loop_variable.is_some() { return Err(at_line(*line, "nested neighbour loops are not supported")); }
                let mut nested = locals.clone();
                returns |= validate_statements(body, parameters, state, &mut nested, Some(variable))?;
            }
            Statement::Return { value, .. } => {
                validate_expression(value, parameters, state, locals, loop_variable)?;
                returns = true;
            }
        }
    }
    Ok(returns)
}

fn binary(op: &str, left: Value, right: Value) -> Value {
    match (op, left, right) {
        ("+", Value::Scalar(a), Value::Scalar(b)) => Value::Scalar(a + b),
        ("+", Value::Vec2(a), Value::Vec2(b)) => Value::Vec2(a + b),
        ("-", Value::Scalar(a), Value::Scalar(b)) => Value::Scalar(a - b),
        ("-", Value::Vec2(a), Value::Vec2(b)) => Value::Vec2(a - b),
        ("*", Value::Scalar(a), Value::Scalar(b)) => Value::Scalar(a * b),
        ("*", Value::Scalar(a), Value::Vec2(b)) => Value::Vec2(b * a),
        ("*", Value::Vec2(a), Value::Scalar(b)) => Value::Vec2(a * b),
        ("/", Value::Scalar(a), Value::Scalar(b)) => Value::Scalar(a / b),
        ("/", Value::Vec2(a), Value::Scalar(b)) => Value::Vec2(a * (1.0 / b)),
        _ => unreachable!("JS compiler preserves controller expression types"),
    }
}

fn evaluate(
    expression: &Expression,
    parameters: &HashMap<String, f64>,
    state_slots: &HashMap<String, usize>,
    private_state: &[f64],
    locals: &HashMap<String, Value>,
    observation: &Observation,
    loop_binding: Option<(&str, &NeighbourObservation)>,
) -> Value {
    match expression {
        Expression::Const { value, .. } => Value::Scalar(*value),
        Expression::Load { path, .. } => {
            if path == "obs.heading" { return Value::Vec2(observation.heading); }
            if let Some(name) = path.strip_prefix("self.") {
                return Value::Scalar(private_state[state_slots[name]]);
            }
            if let Some((variable, neighbour)) = loop_binding {
                if path == &format!("{variable}.relative_position") { return Value::Vec2(neighbour.relative_position); }
            }
            if let Some(value) = locals.get(path) { return *value; }
            if let Some(value) = parameters.get(path) { return Value::Scalar(*value); }
            unreachable!("validated controller load")
        }
        Expression::Unary { value, .. } => match evaluate(value, parameters, state_slots, private_state, locals, observation, loop_binding) {
            Value::Scalar(value) => Value::Scalar(-value),
            Value::Vec2(value) => Value::Vec2(value * -1.0),
            Value::Action(_) => unreachable!("cannot negate action"),
        },
        Expression::Binary { op, left, right, .. } => binary(
            op,
            evaluate(left, parameters, state_slots, private_state, locals, observation, loop_binding),
            evaluate(right, parameters, state_slots, private_state, locals, observation, loop_binding),
        ),
        Expression::Call { name, args, .. } => {
            let values: Vec<_> = args.iter().map(|arg| evaluate(arg, parameters, state_slots, private_state, locals, observation, loop_binding)).collect();
            match name.as_str() {
                "Vec2" => Value::Vec2(Vec2::new(values[0].scalar(), values[1].scalar())),
                "dot" => Value::Scalar(values[0].vec2().dot(values[1].vec2())),
                "perpendicular" => {
                    let value = values[0].vec2();
                    Value::Vec2(Vec2::new(-value.y, value.x))
                }
                "norm" => Value::Scalar(values[0].vec2().norm_squared().sqrt()),
                "pow" => Value::Scalar(values[0].scalar().powf(values[1].scalar())),
                "Motion" => Value::Action(Action { forward: values[0].scalar(), turning: values[1].scalar() }),
                _ => unreachable!("validated controller call"),
            }
        }
    }
}

fn execute_statements(
    body: &[Statement],
    parameters: &HashMap<String, f64>,
    state_slots: &HashMap<String, usize>,
    private_state: &mut [f64],
    locals: &mut HashMap<String, Value>,
    observation: &Observation,
    loop_binding: Option<(&str, &NeighbourObservation)>,
) -> Option<Action> {
    for statement in body {
        match statement {
            Statement::Assign { target, value, .. } => {
                let result = evaluate(value, parameters, state_slots, private_state, locals, observation, loop_binding);
                if let Some(name) = target.strip_prefix("self.") {
                    private_state[state_slots[name]] = result.scalar();
                } else {
                    locals.insert(target.clone(), result);
                }
            }
            Statement::AugAssign { target, value, .. } => {
                let right = evaluate(value, parameters, state_slots, private_state, locals, observation, loop_binding);
                if let Some(name) = target.strip_prefix("self.") {
                    let slot = state_slots[name];
                    private_state[slot] += right.scalar();
                } else {
                    let left = locals[target];
                    locals.insert(target.clone(), binary("+", left, right));
                }
            }
            Statement::ForEach { variable, body, .. } => {
                for neighbour in &observation.neighbours {
                    if let Some(action) = execute_statements(
                        body, parameters, state_slots, private_state, locals, observation, Some((variable, neighbour)),
                    ) { return Some(action); }
                }
            }
            Statement::Return { value, .. } => {
                return Some(evaluate(value, parameters, state_slots, private_state, locals, observation, loop_binding).action());
            }
        }
    }
    None
}

pub struct IrControllerRuntime {
    body: Vec<Statement>,
    parameters: HashMap<String, f64>,
    state_slots: HashMap<String, usize>,
    private_initial: Vec<f64>,
    private_state: Vec<Vec<f64>>,
}

impl IrControllerRuntime {
    pub fn from_json(ir_json: &str, parameters_json: &str) -> Result<Self, String> {
        let ir: ControllerIr = serde_json::from_str(ir_json).map_err(|error| format!("invalid controller IR JSON: {error}"))?;
        if ir.schema != "vlab.controller-ir/0.1" { return Err(format!("unsupported controller IR schema '{}'", ir.schema)); }
        if ir.language != "python-vlab/0.1" { return Err(format!("unsupported controller language '{}'", ir.language)); }
        if ir.entry != "step" { return Err("controller IR entry must be 'step'".to_owned()); }

        let supplied: BTreeMap<String, f64> = serde_json::from_str(parameters_json)
            .map_err(|error| format!("invalid controller parameter JSON: {error}"))?;
        let mut parameters = HashMap::new();
        for (name, value_type) in &ir.parameters {
            if value_type != "scalar" { return Err(format!("parameter '{name}' must be scalar")); }
            let value = supplied.get(name).copied().ok_or_else(|| format!("missing controller parameter '{name}'"))?;
            if !value.is_finite() { return Err(format!("controller parameter '{name}' must be finite")); }
            parameters.insert(name.clone(), value);
        }
        for name in supplied.keys() {
            if !ir.parameters.contains_key(name) { return Err(format!("parameter value '{name}' was supplied but is not declared by the controller")); }
        }

        let mut state_slots = HashMap::new();
        let mut private_initial = Vec::new();
        for declaration in &ir.state {
            if declaration.value_type != "scalar" { return Err(format!("private state '{}' must be scalar", declaration.name)); }
            if !declaration.initial.is_finite() { return Err(format!("private state '{}' initial value must be finite", declaration.name)); }
            if state_slots.insert(declaration.name.clone(), private_initial.len()).is_some() {
                return Err(format!("duplicate private state declaration '{}'", declaration.name));
            }
            private_initial.push(declaration.initial);
        }

        let parameter_names: HashSet<_> = ir.parameters.keys().cloned().collect();
        let state_names: HashSet<_> = state_slots.keys().cloned().collect();
        let mut locals = HashSet::new();
        if !validate_statements(&ir.body, &parameter_names, &state_names, &mut locals, None)? {
            return Err("controller IR has no action return".to_owned());
        }

        Ok(Self { body: ir.body, parameters, state_slots, private_initial, private_state: Vec::new() })
    }
}

impl ControllerRuntime for IrControllerRuntime {
    fn reset(&mut self, agent_count: usize) {
        self.private_state = vec![self.private_initial.clone(); agent_count];
    }

    fn step(&mut self, agent_index: usize, observation: &Observation) -> Action {
        let mut locals = HashMap::new();
        execute_statements(
            &self.body,
            &self.parameters,
            &self.state_slots,
            &mut self.private_state[agent_index],
            &mut locals,
            observation,
            None,
        ).expect("validated controller always returns an action")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn compile(ir: &str, parameters: &str) -> IrControllerRuntime {
        IrControllerRuntime::from_json(ir, parameters).unwrap()
    }

    #[test]
    fn interpreter_executes_vector_math_pow_and_motion() {
        let ir = r#"{
          "schema":"vlab.controller-ir/0.1","language":"python-vlab/0.1","controller":"Probe","entry":"step",
          "parameters":{"GAIN":"scalar"},"state":[],
          "body":[
            {"kind":"assign","target":"f","value":{"kind":"call","name":"Vec2","args":[{"kind":"const","value":0.0},{"kind":"const","value":0.0}]}},
            {"kind":"for_each","variable":"n","iterable":{"kind":"load","path":"obs.neighbours"},"body":[
              {"kind":"aug_assign","target":"f","op":"+","value":{"kind":"load","path":"n.relative_position"}}
            ]},
            {"kind":"return","value":{"kind":"call","name":"Motion","args":[
              {"kind":"call","name":"pow","args":[{"kind":"binary","op":"*","left":{"kind":"load","path":"GAIN"},"right":{"kind":"call","name":"dot","args":[{"kind":"load","path":"f"},{"kind":"load","path":"obs.heading"}]}},{"kind":"const","value":2.0}]},
              {"kind":"const","value":0.0}
            ]}}
          ]
        }"#;
        let mut runtime = compile(ir, r#"{"GAIN":2.0}"#);
        runtime.reset(1);
        let observation = Observation {
            heading: Vec2::new(1.0, 0.0),
            neighbours: vec![
                NeighbourObservation { relative_position: Vec2::new(0.5, 1.0) },
                NeighbourObservation { relative_position: Vec2::new(1.0, -1.0) },
            ],
        };
        let action = runtime.step(0, &observation);
        assert!((action.forward - 9.0).abs() < 1e-12);
        assert_eq!(action.turning, 0.0);
    }

    #[test]
    fn private_state_is_independent_per_agent_and_resets() {
        let ir = r#"{
          "schema":"vlab.controller-ir/0.1","language":"python-vlab/0.1","controller":"Stateful","entry":"step",
          "parameters":{},"state":[{"name":"counter","type":"scalar","initial":0.0}],
          "body":[
            {"kind":"aug_assign","target":"self.counter","op":"+","value":{"kind":"const","value":1.0}},
            {"kind":"return","value":{"kind":"call","name":"Motion","args":[{"kind":"load","path":"self.counter"},{"kind":"const","value":0.0}]}}
          ]
        }"#;
        let mut runtime = compile(ir, "{}");
        runtime.reset(2);
        let observation = Observation { heading: Vec2::new(1.0, 0.0), neighbours: vec![] };
        assert_eq!(runtime.step(0, &observation).forward, 1.0);
        assert_eq!(runtime.step(0, &observation).forward, 2.0);
        assert_eq!(runtime.step(1, &observation).forward, 1.0);
        runtime.reset(2);
        assert_eq!(runtime.step(0, &observation).forward, 1.0);
    }

    #[test]
    fn invalid_ir_is_rejected_before_execution() {
        let invalid = r#"{
          "schema":"vlab.controller-ir/0.1","language":"python-vlab/0.1","controller":"Bad","entry":"step",
          "parameters":{},"state":[],
          "body":[{"kind":"return","value":{"kind":"load","path":"world.position"}}]
        }"#;
        assert!(IrControllerRuntime::from_json(invalid, "{}").is_err());
    }
}
