use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};

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

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum Expression {
    Const { value: f64, #[serde(default)] line: Option<usize> },
    Load { path: String, #[serde(default)] line: Option<usize> },
    Unary { op: String, value: Box<Expression>, #[serde(default)] line: Option<usize> },
    Binary { op: String, left: Box<Expression>, right: Box<Expression>, #[serde(default)] line: Option<usize> },
    Call { name: String, args: Vec<Expression>, #[serde(default)] line: Option<usize> },
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
            if path == "obs.heading" || path == "obs.neighbours" || path == "obs.environmental_scalar" { return Ok(()); }
            if let Some(name) = path.strip_prefix("self.") {
                if state.contains(name) { return Ok(()); }
                return Err(at_line(*line, format!("private state '{name}' is not declared")));
            }
            if let Some(variable) = loop_variable {
                if path.strip_prefix(variable) == Some(".relative_position") { return Ok(()); }
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

fn collect_local_names(body: &[Statement], out: &mut BTreeSet<String>) {
    for statement in body {
        match statement {
            Statement::Assign { target, .. } | Statement::AugAssign { target, .. } => {
                if !target.starts_with("self.") { out.insert(target.clone()); }
            }
            Statement::ForEach { body, .. } => collect_local_names(body, out),
            Statement::Return { .. } => {}
        }
    }
}

#[derive(Debug, Clone, Copy)]
enum BinaryOp { Add, Subtract, Multiply, Divide }

#[derive(Debug, Clone, Copy)]
enum Intrinsic { Vec2, Dot, Perpendicular, Norm, Pow, Motion }

#[derive(Debug, Clone, Copy)]
enum PreparedLoad {
    Heading,
    EnvironmentalScalar,
    NeighbourRelativePosition,
    Parameter(usize),
    PrivateState(usize),
    Local(usize),
}

#[derive(Debug, Clone, Copy)]
enum EvalOp {
    Const(f64),
    Load(PreparedLoad),
    Negate,
    Binary(BinaryOp),
    Intrinsic(Intrinsic),
}

#[derive(Debug)]
struct PreparedExpression {
    ops: Vec<EvalOp>,
    stack_capacity: usize,
}

#[derive(Debug, Clone, Copy)]
enum PreparedTarget { PrivateState(usize), Local(usize) }

#[derive(Debug)]
enum PreparedStatement {
    Assign { target: PreparedTarget, value: PreparedExpression },
    AugAssign { target: PreparedTarget, value: PreparedExpression },
    ForEachNeighbour { body: Vec<PreparedStatement> },
    Return { value: PreparedExpression },
}

fn resolve_load(
    path: &str,
    line: Option<usize>,
    parameter_slots: &HashMap<String, usize>,
    state_slots: &HashMap<String, usize>,
    local_slots: &HashMap<String, usize>,
    loop_variable: Option<&str>,
) -> Result<PreparedLoad, String> {
    if path == "obs.heading" {
        return Ok(PreparedLoad::Heading);
    }
    if path == "obs.environmental_scalar" {
        return Ok(PreparedLoad::EnvironmentalScalar);
    }
    if let Some(name) = path.strip_prefix("self.") {
        return Ok(PreparedLoad::PrivateState(*state_slots.get(name)
            .ok_or_else(|| at_line(line, "validated private state slot missing"))?));
    }
    if let Some(variable) = loop_variable {
        if path.strip_prefix(variable) == Some(".relative_position") {
            return Ok(PreparedLoad::NeighbourRelativePosition);
        }
    }
    if let Some(slot) = local_slots.get(path) {
        return Ok(PreparedLoad::Local(*slot));
    }
    if let Some(slot) = parameter_slots.get(path) {
        return Ok(PreparedLoad::Parameter(*slot));
    }
    Err(at_line(line, "validated controller load could not be prepared"))
}

fn emit_expression(
    expression: &Expression,
    parameter_slots: &HashMap<String, usize>,
    state_slots: &HashMap<String, usize>,
    local_slots: &HashMap<String, usize>,
    loop_variable: Option<&str>,
    ops: &mut Vec<EvalOp>,
    depth: &mut usize,
    max_depth: &mut usize,
) -> Result<(), String> {
    match expression {
        Expression::Const { value, .. } => {
            ops.push(EvalOp::Const(*value));
            *depth += 1;
            *max_depth = (*max_depth).max(*depth);
        }
        Expression::Load { path, line } => {
            ops.push(EvalOp::Load(resolve_load(
                path, *line, parameter_slots, state_slots, local_slots, loop_variable,
            )?));
            *depth += 1;
            *max_depth = (*max_depth).max(*depth);
        }
        Expression::Unary { value, .. } => {
            emit_expression(
                value, parameter_slots, state_slots, local_slots, loop_variable,
                ops, depth, max_depth,
            )?;
            ops.push(EvalOp::Negate);
        }
        Expression::Binary { op, left, right, .. } => {
            emit_expression(
                left, parameter_slots, state_slots, local_slots, loop_variable,
                ops, depth, max_depth,
            )?;
            emit_expression(
                right, parameter_slots, state_slots, local_slots, loop_variable,
                ops, depth, max_depth,
            )?;
            let op = match op.as_str() {
                "+" => BinaryOp::Add,
                "-" => BinaryOp::Subtract,
                "*" => BinaryOp::Multiply,
                "/" => BinaryOp::Divide,
                _ => unreachable!("validated binary operator"),
            };
            ops.push(EvalOp::Binary(op));
            *depth -= 1;
        }
        Expression::Call { name, args, .. } => {
            for arg in args {
                emit_expression(
                    arg, parameter_slots, state_slots, local_slots, loop_variable,
                    ops, depth, max_depth,
                )?;
            }
            let intrinsic = match name.as_str() {
                "Vec2" => Intrinsic::Vec2,
                "dot" => Intrinsic::Dot,
                "perpendicular" => Intrinsic::Perpendicular,
                "norm" => Intrinsic::Norm,
                "pow" => Intrinsic::Pow,
                "Motion" => Intrinsic::Motion,
                _ => unreachable!("validated intrinsic"),
            };
            ops.push(EvalOp::Intrinsic(intrinsic));
            *depth -= args.len() - 1;
        }
    }
    Ok(())
}

fn prepare_expression(
    expression: &Expression,
    parameter_slots: &HashMap<String, usize>,
    state_slots: &HashMap<String, usize>,
    local_slots: &HashMap<String, usize>,
    loop_variable: Option<&str>,
) -> Result<PreparedExpression, String> {
    let mut ops = Vec::new();
    let mut depth = 0;
    let mut max_depth = 0;
    emit_expression(
        expression, parameter_slots, state_slots, local_slots, loop_variable,
        &mut ops, &mut depth, &mut max_depth,
    )?;
    debug_assert_eq!(depth, 1);
    Ok(PreparedExpression { ops, stack_capacity: max_depth })
}

fn prepare_target(
    target: &str,
    state_slots: &HashMap<String, usize>,
    local_slots: &HashMap<String, usize>,
) -> PreparedTarget {
    if let Some(name) = target.strip_prefix("self.") {
        PreparedTarget::PrivateState(state_slots[name])
    } else {
        PreparedTarget::Local(local_slots[target])
    }
}

fn prepare_statements(
    body: &[Statement],
    parameter_slots: &HashMap<String, usize>,
    state_slots: &HashMap<String, usize>,
    local_slots: &HashMap<String, usize>,
    loop_variable: Option<&str>,
) -> Result<Vec<PreparedStatement>, String> {
    body.iter().map(|statement| Ok(match statement {
        Statement::Assign { target, value, .. } => PreparedStatement::Assign {
            target: prepare_target(target, state_slots, local_slots),
            value: prepare_expression(value, parameter_slots, state_slots, local_slots, loop_variable)?,
        },
        Statement::AugAssign { target, value, .. } => PreparedStatement::AugAssign {
            target: prepare_target(target, state_slots, local_slots),
            value: prepare_expression(value, parameter_slots, state_slots, local_slots, loop_variable)?,
        },
        Statement::ForEach { variable, body, .. } => PreparedStatement::ForEachNeighbour {
            body: prepare_statements(body, parameter_slots, state_slots, local_slots, Some(variable))?,
        },
        Statement::Return { value, .. } => PreparedStatement::Return {
            value: prepare_expression(value, parameter_slots, state_slots, local_slots, loop_variable)?,
        },
    })).collect()
}

fn binary(op: BinaryOp, left: Value, right: Value) -> Value {
    match (op, left, right) {
        (BinaryOp::Add, Value::Scalar(a), Value::Scalar(b)) => Value::Scalar(a + b),
        (BinaryOp::Add, Value::Vec2(a), Value::Vec2(b)) => Value::Vec2(a + b),
        (BinaryOp::Subtract, Value::Scalar(a), Value::Scalar(b)) => Value::Scalar(a - b),
        (BinaryOp::Subtract, Value::Vec2(a), Value::Vec2(b)) => Value::Vec2(a - b),
        (BinaryOp::Multiply, Value::Scalar(a), Value::Scalar(b)) => Value::Scalar(a * b),
        (BinaryOp::Multiply, Value::Scalar(a), Value::Vec2(b)) => Value::Vec2(b * a),
        (BinaryOp::Multiply, Value::Vec2(a), Value::Scalar(b)) => Value::Vec2(a * b),
        (BinaryOp::Divide, Value::Scalar(a), Value::Scalar(b)) => Value::Scalar(a / b),
        (BinaryOp::Divide, Value::Vec2(a), Value::Scalar(b)) => Value::Vec2(a * (1.0 / b)),
        _ => unreachable!("JS compiler preserves controller expression types"),
    }
}

fn push_load(
    load: PreparedLoad,
    parameters: &[f64],
    private_state: &[f64],
    locals: &[Value],
    observation: &Observation,
    neighbour: Option<&NeighbourObservation>,
    stack: &mut Vec<Value>,
) {
    stack.push(match load {
        PreparedLoad::Heading => Value::Vec2(observation.heading),
        PreparedLoad::EnvironmentalScalar => Value::Scalar(
            observation.environmental_scalar.expect("validated environmental scalar observation")
        ),
        PreparedLoad::NeighbourRelativePosition => {
            Value::Vec2(neighbour.expect("prepared neighbour load inside loop").relative_position)
        }
        PreparedLoad::Parameter(slot) => Value::Scalar(parameters[slot]),
        PreparedLoad::PrivateState(slot) => Value::Scalar(private_state[slot]),
        PreparedLoad::Local(slot) => locals[slot],
    });
}

fn execute_intrinsic(intrinsic: Intrinsic, stack: &mut Vec<Value>) {
    match intrinsic {
        Intrinsic::Vec2 => {
            let y = stack.pop().expect("validated Vec2 y").scalar();
            let x = stack.pop().expect("validated Vec2 x").scalar();
            stack.push(Value::Vec2(Vec2::new(x, y)));
        }
        Intrinsic::Dot => {
            let right = stack.pop().expect("validated dot right").vec2();
            let left = stack.pop().expect("validated dot left").vec2();
            stack.push(Value::Scalar(left.dot(right)));
        }
        Intrinsic::Perpendicular => {
            let value = stack.pop().expect("validated perpendicular value").vec2();
            stack.push(Value::Vec2(Vec2::new(-value.y, value.x)));
        }
        Intrinsic::Norm => {
            let value = stack.pop().expect("validated norm value").vec2();
            stack.push(Value::Scalar(value.norm_squared().sqrt()));
        }
        Intrinsic::Pow => {
            let exponent = stack.pop().expect("validated pow exponent").scalar();
            let base = stack.pop().expect("validated pow base").scalar();
            stack.push(Value::Scalar(base.powf(exponent)));
        }
        Intrinsic::Motion => {
            let turning = stack.pop().expect("validated Motion turning").scalar();
            let forward = stack.pop().expect("validated Motion forward").scalar();
            stack.push(Value::Action(Action { forward, turning }));
        }
    }
}

fn evaluate(
    expression: &PreparedExpression,
    parameters: &[f64],
    private_state: &[f64],
    locals: &[Value],
    observation: &Observation,
    neighbour: Option<&NeighbourObservation>,
    stack: &mut Vec<Value>,
) -> Value {
    stack.clear();
    debug_assert!(stack.capacity() >= expression.stack_capacity);
    for op in &expression.ops {
        match *op {
            EvalOp::Const(value) => stack.push(Value::Scalar(value)),
            EvalOp::Load(load) => {
                push_load(load, parameters, private_state, locals, observation, neighbour, stack);
            }
            EvalOp::Negate => {
                let value = stack.pop().expect("validated unary operand");
                stack.push(match value {
                    Value::Scalar(value) => Value::Scalar(-value),
                    Value::Vec2(value) => Value::Vec2(value * -1.0),
                    Value::Action(_) => unreachable!("cannot negate action"),
                });
            }
            EvalOp::Binary(op) => {
                let right = stack.pop().expect("validated binary right");
                let left = stack.pop().expect("validated binary left");
                stack.push(binary(op, left, right));
            }
            EvalOp::Intrinsic(intrinsic) => execute_intrinsic(intrinsic, stack),
        }
    }
    debug_assert_eq!(stack.len(), 1);
    stack.pop().expect("validated expression result")
}

fn max_stack_in_statements(body: &[PreparedStatement]) -> usize {
    body.iter().map(|statement| match statement {
        PreparedStatement::Assign { value, .. }
        | PreparedStatement::AugAssign { value, .. }
        | PreparedStatement::Return { value } => value.stack_capacity,
        PreparedStatement::ForEachNeighbour { body } => max_stack_in_statements(body),
    }).max().unwrap_or(0)
}

fn assign(target: PreparedTarget, value: Value, private_state: &mut [f64], locals: &mut [Value]) {
    match target {
        PreparedTarget::PrivateState(slot) => private_state[slot] = value.scalar(),
        PreparedTarget::Local(slot) => locals[slot] = value,
    }
}

fn execute_statements(
    body: &[PreparedStatement],
    parameters: &[f64],
    private_state: &mut [f64],
    locals: &mut [Value],
    observation: &Observation,
    neighbour: Option<&NeighbourObservation>,
    eval_stack: &mut Vec<Value>,
) -> Option<Action> {
    for statement in body {
        match statement {
            PreparedStatement::Assign { target, value } => {
                let result = evaluate(
                    value, parameters, private_state, locals, observation, neighbour, eval_stack,
                );
                assign(*target, result, private_state, locals);
            }
            PreparedStatement::AugAssign { target, value } => {
                let right = evaluate(
                    value, parameters, private_state, locals, observation, neighbour, eval_stack,
                );
                match target {
                    PreparedTarget::PrivateState(slot) => private_state[*slot] += right.scalar(),
                    PreparedTarget::Local(slot) => locals[*slot] = binary(BinaryOp::Add, locals[*slot], right),
                }
            }
            PreparedStatement::ForEachNeighbour { body } => {
                for current in &observation.neighbours {
                    if let Some(action) = execute_statements(
                        body, parameters, private_state, locals, observation, Some(current), eval_stack,
                    ) { return Some(action); }
                }
            }
            PreparedStatement::Return { value } => {
                return Some(evaluate(
                    value, parameters, private_state, locals, observation, neighbour, eval_stack,
                ).action());
            }
        }
    }
    None
}

pub struct IrControllerRuntime {
    body: Vec<PreparedStatement>,
    parameters: Vec<f64>,
    private_initial: Vec<f64>,
    private_state: Vec<Vec<f64>>,
    scratch_locals: Vec<Value>,
    scratch_eval_stack: Vec<Value>,
}

impl IrControllerRuntime {
    pub fn from_json(ir_json: &str, parameters_json: &str) -> Result<Self, String> {
        let ir: ControllerIr = serde_json::from_str(ir_json).map_err(|error| format!("invalid controller IR JSON: {error}"))?;
        if ir.schema != "vlab.controller-ir/0.1" { return Err(format!("unsupported controller IR schema '{}'", ir.schema)); }
        if ir.language != "python-vlab/0.1" { return Err(format!("unsupported controller language '{}'", ir.language)); }
        if ir.entry != "step" { return Err("controller IR entry must be 'step'".to_owned()); }

        let supplied: BTreeMap<String, f64> = serde_json::from_str(parameters_json)
            .map_err(|error| format!("invalid controller parameter JSON: {error}"))?;
        let mut parameter_slots = HashMap::new();
        let mut parameters = Vec::with_capacity(ir.parameters.len());
        for (name, value_type) in &ir.parameters {
            if value_type != "scalar" { return Err(format!("parameter '{name}' must be scalar")); }
            let value = supplied.get(name).copied().ok_or_else(|| format!("missing controller parameter '{name}'"))?;
            if !value.is_finite() { return Err(format!("controller parameter '{name}' must be finite")); }
            parameter_slots.insert(name.clone(), parameters.len());
            parameters.push(value);
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
        let mut validated_locals = HashSet::new();
        if !validate_statements(&ir.body, &parameter_names, &state_names, &mut validated_locals, None)? {
            return Err("controller IR has no action return".to_owned());
        }

        let mut local_names = BTreeSet::new();
        collect_local_names(&ir.body, &mut local_names);
        let local_slots: HashMap<_, _> = local_names.into_iter().enumerate().map(|(slot, name)| (name, slot)).collect();
        let body = prepare_statements(&ir.body, &parameter_slots, &state_slots, &local_slots, None)?;
        let eval_stack_capacity = max_stack_in_statements(&body).max(1);

        Ok(Self {
            body,
            parameters,
            private_initial,
            private_state: Vec::new(),
            scratch_locals: vec![Value::Scalar(f64::NAN); local_slots.len()],
            scratch_eval_stack: Vec::with_capacity(eval_stack_capacity),
        })
    }
}

impl ControllerRuntime for IrControllerRuntime {
    fn reset(&mut self, agent_count: usize) {
        self.private_state = vec![self.private_initial.clone(); agent_count];
        self.scratch_locals.fill(Value::Scalar(f64::NAN));
        self.scratch_eval_stack.clear();
    }

    fn step(&mut self, agent_index: usize, observation: &Observation) -> Action {
        self.scratch_locals.fill(Value::Scalar(f64::NAN));
        self.scratch_eval_stack.clear();
        execute_statements(
            &self.body,
            &self.parameters,
            &mut self.private_state[agent_index],
            &mut self.scratch_locals,
            observation,
            None,
            &mut self.scratch_eval_stack,
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
            environmental_scalar: None,
        };
        let action = runtime.step(0, &observation);
        assert!((action.forward - 9.0).abs() < 1e-12);
        assert_eq!(action.turning, 0.0);
        let second = runtime.step(0, &Observation {
            heading: Vec2::new(1.0, 0.0),
            neighbours: vec![NeighbourObservation { relative_position: Vec2::new(1.0, 0.0) }],
            environmental_scalar: None,
        });
        assert!((second.forward - 4.0).abs() < 1e-12);
        assert_eq!(second.turning, 0.0);
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
        let observation = Observation { heading: Vec2::new(1.0, 0.0), neighbours: vec![], environmental_scalar: None };
        assert_eq!(runtime.step(0, &observation).forward, 1.0);
        assert_eq!(runtime.step(0, &observation).forward, 2.0);
        assert_eq!(runtime.step(1, &observation).forward, 1.0);
        runtime.reset(2);
        assert_eq!(runtime.step(0, &observation).forward, 1.0);
    }

    #[test]
    fn prepared_slots_cover_locals_parameters_state_and_neighbour_binding() {
        let ir = r#"{
          "schema":"vlab.controller-ir/0.1","language":"python-vlab/0.1","controller":"Slots","entry":"step",
          "parameters":{"GAIN":"scalar"},"state":[{"name":"counter","type":"scalar","initial":1.0}],
          "body":[
            {"kind":"assign","target":"sum","value":{"kind":"const","value":0.0}},
            {"kind":"for_each","variable":"n","iterable":{"kind":"load","path":"obs.neighbours"},"body":[
              {"kind":"aug_assign","target":"sum","op":"+","value":{"kind":"call","name":"norm","args":[{"kind":"load","path":"n.relative_position"}]}}
            ]},
            {"kind":"aug_assign","target":"self.counter","op":"+","value":{"kind":"const","value":1.0}},
            {"kind":"return","value":{"kind":"call","name":"Motion","args":[
              {"kind":"binary","op":"+","left":{"kind":"binary","op":"*","left":{"kind":"load","path":"sum"},"right":{"kind":"load","path":"GAIN"}},"right":{"kind":"load","path":"self.counter"}},
              {"kind":"const","value":0.0}
            ]}}
          ]
        }"#;
        let mut runtime = compile(ir, r#"{"GAIN":2.0}"#);
        runtime.reset(1);
        let observation = Observation {
            heading: Vec2::new(1.0, 0.0),
            neighbours: vec![
                NeighbourObservation { relative_position: Vec2::new(3.0, 4.0) },
                NeighbourObservation { relative_position: Vec2::new(0.0, 2.0) },
            ],
            environmental_scalar: None,
        };
        assert_eq!(runtime.step(0, &observation).forward, 16.0);
        assert_eq!(runtime.step(0, &Observation { heading: observation.heading, neighbours: vec![], environmental_scalar: None }).forward, 3.0);
    }

    #[test]
    fn stack_bytecode_preserves_nested_left_to_right_expression_order() {
        let ir = r#"{
          "schema":"vlab.controller-ir/0.1","language":"python-vlab/0.1","controller":"Order","entry":"step",
          "parameters":{},"state":[],
          "body":[
            {"kind":"return","value":{"kind":"call","name":"Motion","args":[
              {"kind":"binary","op":"/",
                "left":{"kind":"binary","op":"/","left":{"kind":"const","value":8.0},"right":{"kind":"const","value":4.0}},
                "right":{"kind":"const","value":2.0}},
              {"kind":"const","value":0.0}
            ]}}
          ]
        }"#;
        let mut runtime = compile(ir, "{}");
        runtime.reset(1);
        let observation = Observation { heading: Vec2::new(1.0, 0.0), neighbours: vec![], environmental_scalar: None };
        assert_eq!(runtime.step(0, &observation).forward, 1.0);
    }

    #[test]
    fn environmental_scalar_is_a_local_read_only_controller_input() {
        let ir = r#"{
          "schema":"vlab.controller-ir/0.1","language":"python-vlab/0.1","controller":"ScalarSensor","entry":"step",
          "parameters":{},"state":[],
          "body":[{"kind":"return","value":{"kind":"call","name":"Motion","args":[
            {"kind":"load","path":"obs.environmental_scalar"},{"kind":"const","value":0.0}
          ]}}]
        }"#;
        let mut runtime = compile(ir, "{}");
        runtime.reset(1);
        let observation = Observation {
            heading: Vec2::new(1.0, 0.0),
            neighbours: vec![],
            environmental_scalar: Some(0.375),
        };
        assert_eq!(runtime.step(0, &observation).forward, 0.375);
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
