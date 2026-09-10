use std::collections::{BTreeMap, HashMap};

use serde::Deserialize;

use crate::{Action, ControllerRuntime, Observation, Vec2};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Type {
    Scalar,
    Vec2,
    Action,
}

#[derive(Debug, Clone, Copy)]
enum Value {
    Scalar(f64),
    Vec2(Vec2),
    Action(Action),
}

impl Value {
    fn scalar(self) -> f64 {
        match self {
            Value::Scalar(value) => value,
            _ => unreachable!("validated bytecode type invariant"),
        }
    }

    fn vec2(self) -> Vec2 {
        match self {
            Value::Vec2(value) => value,
            _ => unreachable!("validated bytecode type invariant"),
        }
    }

    fn action(self) -> Action {
        match self {
            Value::Action(value) => value,
            _ => unreachable!("validated bytecode type invariant"),
        }
    }
}

#[derive(Debug, Clone)]
enum Instruction {
    PushScalar(f64),
    PushVec2(Vec2),
    LoadParameter(usize),
    LoadObservationHeading,
    LoadNeighbourRelativePosition,
    LoadLocal(usize),
    StoreLocal(usize),
    LoadPrivateState(usize),
    StorePrivateState(usize),
    AddScalar,
    AddVec2,
    SubScalar,
    SubVec2,
    MulScalar,
    MulScalarVec2,
    MulVec2Scalar,
    DivScalar,
    DivVec2Scalar,
    NegScalar,
    NegVec2,
    Dot,
    Perpendicular,
    Norm,
    MakeMotion,
    BeginNeighbours { end_pc: usize },
    NextNeighbour { body_pc: usize },
    ReturnAction,
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

struct Lowerer<'a> {
    parameter_slots: HashMap<String, usize>,
    parameter_values: Vec<f64>,
    state_slots: HashMap<String, usize>,
    state_initial: Vec<f64>,
    local_slots: HashMap<String, usize>,
    local_types: HashMap<String, Type>,
    instructions: Vec<Instruction>,
    active_loop_variable: Option<&'a str>,
    returned: bool,
}

impl<'a> Lowerer<'a> {
    fn new(ir: &ControllerIr, parameter_values: &BTreeMap<String, f64>) -> Result<Self, String> {
        if ir.schema != "vlab.controller-ir/0.1" {
            return Err(format!("unsupported controller IR schema '{}'", ir.schema));
        }
        if ir.language != "python-vlab/0.1" {
            return Err(format!("unsupported controller language '{}'", ir.language));
        }
        if ir.entry != "step" {
            return Err("controller IR entry must be 'step'".to_owned());
        }

        for name in parameter_values.keys() {
            if !ir.parameters.contains_key(name) {
                return Err(format!("parameter value '{name}' was supplied but is not declared by the controller"));
            }
        }

        let mut parameter_slots = HashMap::new();
        let mut runtime_parameters = Vec::new();
        for (name, value_type) in &ir.parameters {
            if value_type != "scalar" {
                return Err(format!("parameter '{name}' must be scalar in python-vlab/0.1"));
            }
            let value = parameter_values
                .get(name)
                .copied()
                .ok_or_else(|| format!("missing controller parameter '{name}'"))?;
            if !value.is_finite() {
                return Err(format!("controller parameter '{name}' must be finite"));
            }
            parameter_slots.insert(name.clone(), runtime_parameters.len());
            runtime_parameters.push(value);
        }

        let mut state_slots = HashMap::new();
        let mut state_initial = Vec::new();
        for declaration in &ir.state {
            if declaration.value_type != "scalar" {
                return Err(format!("private state '{}' must be scalar in python-vlab/0.1", declaration.name));
            }
            if !declaration.initial.is_finite() {
                return Err(format!("private state '{}' initial value must be finite", declaration.name));
            }
            if state_slots.insert(declaration.name.clone(), state_initial.len()).is_some() {
                return Err(format!("duplicate private state declaration '{}'", declaration.name));
            }
            state_initial.push(declaration.initial);
        }

        Ok(Self {
            parameter_slots,
            parameter_values: runtime_parameters,
            state_slots,
            state_initial,
            local_slots: HashMap::new(),
            local_types: HashMap::new(),
            instructions: Vec::new(),
            active_loop_variable: None,
            returned: false,
        })
    }

    fn local_slot(&mut self, name: &str, value_type: Type, line: Option<usize>) -> Result<usize, String> {
        if let Some(existing_type) = self.local_types.get(name) {
            if *existing_type != value_type {
                return Err(at_line(line, format!("local '{name}' changes type")));
            }
            return Ok(self.local_slots[name]);
        }
        let slot = self.local_slots.len();
        self.local_slots.insert(name.to_owned(), slot);
        self.local_types.insert(name.to_owned(), value_type);
        Ok(slot)
    }

    fn existing_target(&self, target: &str, line: Option<usize>) -> Result<(Target, Type), String> {
        if let Some(name) = target.strip_prefix("self.") {
            let slot = self
                .state_slots
                .get(name)
                .copied()
                .ok_or_else(|| at_line(line, format!("private state '{name}' is not declared")))?;
            return Ok((Target::PrivateState(slot), Type::Scalar));
        }
        let slot = self
            .local_slots
            .get(target)
            .copied()
            .ok_or_else(|| at_line(line, format!("local '{target}' must be assigned before '+='")))?;
        Ok((Target::Local(slot), self.local_types[target]))
    }

    fn assignment_target(&mut self, target: &str, value_type: Type, line: Option<usize>) -> Result<Target, String> {
        if let Some(name) = target.strip_prefix("self.") {
            let slot = self
                .state_slots
                .get(name)
                .copied()
                .ok_or_else(|| at_line(line, format!("private state '{name}' is not declared")))?;
            if value_type != Type::Scalar {
                return Err(at_line(line, format!("private state '{name}' is scalar")));
            }
            return Ok(Target::PrivateState(slot));
        }
        if self.parameter_slots.contains_key(target) || target == "obs" {
            return Err(at_line(line, format!("cannot assign to scientific input '{target}'")));
        }
        if self.active_loop_variable == Some(target) {
            return Err(at_line(line, format!("cannot assign to loop observation '{target}'")));
        }
        Ok(Target::Local(self.local_slot(target, value_type, line)?))
    }

    fn emit_load_target(&mut self, target: Target) {
        self.instructions.push(match target {
            Target::Local(slot) => Instruction::LoadLocal(slot),
            Target::PrivateState(slot) => Instruction::LoadPrivateState(slot),
        });
    }

    fn emit_store_target(&mut self, target: Target) {
        self.instructions.push(match target {
            Target::Local(slot) => Instruction::StoreLocal(slot),
            Target::PrivateState(slot) => Instruction::StorePrivateState(slot),
        });
    }

    fn lower_statements(&mut self, body: &'a [Statement]) -> Result<(), String> {
        for statement in body {
            match statement {
                Statement::Assign { target, value, line } => {
                    let value_type = self.lower_expression(value)?;
                    let target = self.assignment_target(target, value_type, *line)?;
                    self.emit_store_target(target);
                }
                Statement::AugAssign { target, op, value, line } => {
                    if op != "+" {
                        return Err(at_line(*line, format!("unsupported augmented operator '{op}'")));
                    }
                    let (target, left_type) = self.existing_target(target, *line)?;
                    self.emit_load_target(target);
                    let right_type = self.lower_expression(value)?;
                    let result_type = self.emit_binary("+", left_type, right_type, *line)?;
                    if result_type != left_type {
                        return Err(at_line(*line, "augmented assignment changes target type"));
                    }
                    self.emit_store_target(target);
                }
                Statement::ForEach { variable, iterable, body, line } => {
                    match iterable {
                        Expression::Load { path, .. } if path == "obs.neighbours" => {}
                        _ => return Err(at_line(*line, "for loop must iterate over obs.neighbours")),
                    }
                    if self.active_loop_variable.is_some() {
                        return Err(at_line(*line, "nested neighbour loops are not supported"));
                    }
                    let begin_pc = self.instructions.len();
                    self.instructions.push(Instruction::BeginNeighbours { end_pc: usize::MAX });
                    let body_pc = self.instructions.len();
                    let previous = self.active_loop_variable.replace(variable.as_str());
                    self.lower_statements(body)?;
                    self.active_loop_variable = previous;
                    self.instructions.push(Instruction::NextNeighbour { body_pc });
                    let end_pc = self.instructions.len();
                    self.instructions[begin_pc] = Instruction::BeginNeighbours { end_pc };
                }
                Statement::Return { value, line } => {
                    let value_type = self.lower_expression(value)?;
                    if value_type != Type::Action {
                        return Err(at_line(*line, "controller step must return Motion/action"));
                    }
                    self.instructions.push(Instruction::ReturnAction);
                    self.returned = true;
                }
            }
        }
        Ok(())
    }

    fn lower_expression(&mut self, expression: &'a Expression) -> Result<Type, String> {
        match expression {
            Expression::Const { value, line } => {
                if !value.is_finite() {
                    return Err(at_line(*line, "numeric constants must be finite"));
                }
                self.instructions.push(Instruction::PushScalar(*value));
                Ok(Type::Scalar)
            }
            Expression::Load { path, line } => {
                if path == "obs.heading" {
                    self.instructions.push(Instruction::LoadObservationHeading);
                    return Ok(Type::Vec2);
                }
                if path == "obs.neighbours" {
                    return Err(at_line(*line, "obs.neighbours is iterable only"));
                }
                if let Some(name) = path.strip_prefix("self.") {
                    let slot = self
                        .state_slots
                        .get(name)
                        .copied()
                        .ok_or_else(|| at_line(*line, format!("private state '{name}' is not declared")))?;
                    self.instructions.push(Instruction::LoadPrivateState(slot));
                    return Ok(Type::Scalar);
                }
                if let Some(loop_variable) = self.active_loop_variable {
                    if path == format!("{loop_variable}.relative_position") {
                        self.instructions.push(Instruction::LoadNeighbourRelativePosition);
                        return Ok(Type::Vec2);
                    }
                }
                if path.contains('.') {
                    return Err(at_line(*line, format!("observation field '{path}' is unavailable")));
                }
                if let Some(slot) = self.local_slots.get(path).copied() {
                    self.instructions.push(Instruction::LoadLocal(slot));
                    return Ok(self.local_types[path]);
                }
                if let Some(slot) = self.parameter_slots.get(path).copied() {
                    self.instructions.push(Instruction::LoadParameter(slot));
                    return Ok(Type::Scalar);
                }
                Err(at_line(*line, format!("unknown identifier '{path}'")))
            }
            Expression::Unary { op, value, line } => {
                if op != "-" {
                    return Err(at_line(*line, format!("unsupported unary operator '{op}'")));
                }
                let value_type = self.lower_expression(value)?;
                self.instructions.push(match value_type {
                    Type::Scalar => Instruction::NegScalar,
                    Type::Vec2 => Instruction::NegVec2,
                    Type::Action => return Err(at_line(*line, "cannot negate an action")),
                });
                Ok(value_type)
            }
            Expression::Binary { op, left, right, line } => {
                let left_type = self.lower_expression(left)?;
                let right_type = self.lower_expression(right)?;
                self.emit_binary(op, left_type, right_type, *line)
            }
            Expression::Call { name, args, line } => self.lower_call(name, args, *line),
        }
    }

    fn emit_binary(&mut self, op: &str, left: Type, right: Type, line: Option<usize>) -> Result<Type, String> {
        let (instruction, result) = match (op, left, right) {
            ("+", Type::Scalar, Type::Scalar) => (Instruction::AddScalar, Type::Scalar),
            ("+", Type::Vec2, Type::Vec2) => (Instruction::AddVec2, Type::Vec2),
            ("-", Type::Scalar, Type::Scalar) => (Instruction::SubScalar, Type::Scalar),
            ("-", Type::Vec2, Type::Vec2) => (Instruction::SubVec2, Type::Vec2),
            ("*", Type::Scalar, Type::Scalar) => (Instruction::MulScalar, Type::Scalar),
            ("*", Type::Scalar, Type::Vec2) => (Instruction::MulScalarVec2, Type::Vec2),
            ("*", Type::Vec2, Type::Scalar) => (Instruction::MulVec2Scalar, Type::Vec2),
            ("/", Type::Scalar, Type::Scalar) => (Instruction::DivScalar, Type::Scalar),
            ("/", Type::Vec2, Type::Scalar) => (Instruction::DivVec2Scalar, Type::Vec2),
            _ => return Err(at_line(line, format!("operator '{op}' cannot combine {left:?} and {right:?}"))),
        };
        self.instructions.push(instruction);
        Ok(result)
    }

    fn lower_call(&mut self, name: &str, args: &'a [Expression], line: Option<usize>) -> Result<Type, String> {
        match name {
            "Vec2" => {
                self.require_args(name, args, &[Type::Scalar, Type::Scalar], line)?;
                self.instructions.push(Instruction::PushVec2(Vec2::ZERO));
                Ok(Type::Vec2)
            }
            "dot" => {
                self.require_args(name, args, &[Type::Vec2, Type::Vec2], line)?;
                self.instructions.push(Instruction::Dot);
                Ok(Type::Scalar)
            }
            "perpendicular" => {
                self.require_args(name, args, &[Type::Vec2], line)?;
                self.instructions.push(Instruction::Perpendicular);
                Ok(Type::Vec2)
            }
            "norm" => {
                self.require_args(name, args, &[Type::Vec2], line)?;
                self.instructions.push(Instruction::Norm);
                Ok(Type::Scalar)
            }
            "Motion" => {
                self.require_args(name, args, &[Type::Scalar, Type::Scalar], line)?;
                self.instructions.push(Instruction::MakeMotion);
                Ok(Type::Action)
            }
            _ => Err(at_line(line, format!("unsupported call '{name}'"))),
        }
    }

    fn require_args(&mut self, name: &str, args: &'a [Expression], expected: &[Type], line: Option<usize>) -> Result<(), String> {
        if args.len() != expected.len() {
            return Err(at_line(line, format!("{name} expects {} arguments", expected.len())));
        }
        for (index, (argument, expected_type)) in args.iter().zip(expected.iter()).enumerate() {
            let actual = self.lower_expression(argument)?;
            if actual != *expected_type {
                return Err(at_line(line, format!("{name} argument {} expects {expected_type:?}, got {actual:?}", index + 1)));
            }
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy)]
enum Target {
    Local(usize),
    PrivateState(usize),
}

/// Executable controller produced once from versioned IR. This is not a
/// Python interpreter: source parsing/type checking occurs before this point,
/// and the Rust runtime executes compact validated scientific bytecode.
pub struct IrControllerRuntime {
    instructions: Vec<Instruction>,
    parameters: Vec<f64>,
    local_count: usize,
    private_initial: Vec<f64>,
    private_state: Vec<Vec<f64>>,
}

impl IrControllerRuntime {
    pub fn from_json(ir_json: &str, parameters_json: &str) -> Result<Self, String> {
        let ir: ControllerIr = serde_json::from_str(ir_json)
            .map_err(|error| format!("invalid controller IR JSON: {error}"))?;
        let parameters: BTreeMap<String, f64> = serde_json::from_str(parameters_json)
            .map_err(|error| format!("invalid controller parameter JSON: {error}"))?;
        let mut lowerer = Lowerer::new(&ir, &parameters)?;
        lowerer.lower_statements(&ir.body)?;
        if !lowerer.returned {
            return Err("controller IR has no action return".to_owned());
        }
        Ok(Self {
            instructions: lowerer.instructions,
            parameters: lowerer.parameter_values,
            local_count: lowerer.local_slots.len(),
            private_initial: lowerer.state_initial,
            private_state: Vec::new(),
        })
    }

    fn pop(stack: &mut Vec<Value>) -> Value {
        stack.pop().expect("validated bytecode stack invariant")
    }
}

impl ControllerRuntime for IrControllerRuntime {
    fn reset(&mut self, agent_count: usize) {
        self.private_state = vec![self.private_initial.clone(); agent_count];
    }

    fn step(&mut self, agent_index: usize, observation: &Observation) -> Action {
        let mut stack: Vec<Value> = Vec::with_capacity(16);
        let mut locals: Vec<Option<Value>> = vec![None; self.local_count];
        let mut current_neighbour = 0usize;
        let mut pc = 0usize;

        while pc < self.instructions.len() {
            match self.instructions[pc].clone() {
                Instruction::PushScalar(value) => stack.push(Value::Scalar(value)),
                Instruction::PushVec2(marker) => {
                    debug_assert_eq!(marker, Vec2::ZERO);
                    let y = Self::pop(&mut stack).scalar();
                    let x = Self::pop(&mut stack).scalar();
                    stack.push(Value::Vec2(Vec2::new(x, y)));
                }
                Instruction::LoadParameter(slot) => stack.push(Value::Scalar(self.parameters[slot])),
                Instruction::LoadObservationHeading => stack.push(Value::Vec2(observation.heading)),
                Instruction::LoadNeighbourRelativePosition => {
                    stack.push(Value::Vec2(observation.neighbours[current_neighbour].relative_position));
                }
                Instruction::LoadLocal(slot) => stack.push(locals[slot].expect("validated definite local assignment")),
                Instruction::StoreLocal(slot) => locals[slot] = Some(Self::pop(&mut stack)),
                Instruction::LoadPrivateState(slot) => stack.push(Value::Scalar(self.private_state[agent_index][slot])),
                Instruction::StorePrivateState(slot) => self.private_state[agent_index][slot] = Self::pop(&mut stack).scalar(),
                Instruction::AddScalar => {
                    let right = Self::pop(&mut stack).scalar();
                    let left = Self::pop(&mut stack).scalar();
                    stack.push(Value::Scalar(left + right));
                }
                Instruction::AddVec2 => {
                    let right = Self::pop(&mut stack).vec2();
                    let left = Self::pop(&mut stack).vec2();
                    stack.push(Value::Vec2(left + right));
                }
                Instruction::SubScalar => {
                    let right = Self::pop(&mut stack).scalar();
                    let left = Self::pop(&mut stack).scalar();
                    stack.push(Value::Scalar(left - right));
                }
                Instruction::SubVec2 => {
                    let right = Self::pop(&mut stack).vec2();
                    let left = Self::pop(&mut stack).vec2();
                    stack.push(Value::Vec2(left - right));
                }
                Instruction::MulScalar => {
                    let right = Self::pop(&mut stack).scalar();
                    let left = Self::pop(&mut stack).scalar();
                    stack.push(Value::Scalar(left * right));
                }
                Instruction::MulScalarVec2 => {
                    let right = Self::pop(&mut stack).vec2();
                    let left = Self::pop(&mut stack).scalar();
                    stack.push(Value::Vec2(right * left));
                }
                Instruction::MulVec2Scalar => {
                    let right = Self::pop(&mut stack).scalar();
                    let left = Self::pop(&mut stack).vec2();
                    stack.push(Value::Vec2(left * right));
                }
                Instruction::DivScalar => {
                    let right = Self::pop(&mut stack).scalar();
                    let left = Self::pop(&mut stack).scalar();
                    stack.push(Value::Scalar(left / right));
                }
                Instruction::DivVec2Scalar => {
                    let right = Self::pop(&mut stack).scalar();
                    let left = Self::pop(&mut stack).vec2();
                    stack.push(Value::Vec2(left * (1.0 / right)));
                }
                Instruction::NegScalar => {
                    let value = Self::pop(&mut stack).scalar();
                    stack.push(Value::Scalar(-value));
                }
                Instruction::NegVec2 => {
                    let value = Self::pop(&mut stack).vec2();
                    stack.push(Value::Vec2(value * -1.0));
                }
                Instruction::Dot => {
                    let right = Self::pop(&mut stack).vec2();
                    let left = Self::pop(&mut stack).vec2();
                    stack.push(Value::Scalar(left.dot(right)));
                }
                Instruction::Perpendicular => {
                    let value = Self::pop(&mut stack).vec2();
                    stack.push(Value::Vec2(Vec2::new(-value.y, value.x)));
                }
                Instruction::Norm => {
                    let value = Self::pop(&mut stack).vec2();
                    stack.push(Value::Scalar(value.norm_squared().sqrt()));
                }
                Instruction::MakeMotion => {
                    let turning = Self::pop(&mut stack).scalar();
                    let forward = Self::pop(&mut stack).scalar();
                    stack.push(Value::Action(Action { forward, turning }));
                }
                Instruction::BeginNeighbours { end_pc } => {
                    if observation.neighbours.is_empty() {
                        pc = end_pc;
                        continue;
                    }
                    current_neighbour = 0;
                }
                Instruction::NextNeighbour { body_pc } => {
                    current_neighbour += 1;
                    if current_neighbour < observation.neighbours.len() {
                        pc = body_pc;
                        continue;
                    }
                }
                Instruction::ReturnAction => return Self::pop(&mut stack).action(),
            }
            pc += 1;
        }
        unreachable!("validated controller bytecode always returns an action")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::NeighbourObservation;

    fn compile(ir: &str, parameters: &str) -> IrControllerRuntime {
        IrControllerRuntime::from_json(ir, parameters).unwrap()
    }

    #[test]
    fn bytecode_executes_vector_math_and_motion() {
        let ir = r#"{
          "schema":"vlab.controller-ir/0.1","language":"python-vlab/0.1","controller":"Probe","entry":"step",
          "parameters":{"GAIN":"scalar"},"state":[],
          "body":[
            {"kind":"assign","target":"f","line":3,"value":{"kind":"call","name":"Vec2","line":3,"args":[{"kind":"const","value":0.0,"line":3},{"kind":"const","value":0.0,"line":3}]}},
            {"kind":"for_each","variable":"n","line":4,"iterable":{"kind":"load","path":"obs.neighbours","line":4},"body":[
              {"kind":"aug_assign","target":"f","op":"+","line":5,"value":{"kind":"load","path":"n.relative_position","line":5}}
            ]},
            {"kind":"return","line":6,"value":{"kind":"call","name":"Motion","line":6,"args":[
              {"kind":"binary","op":"*","line":6,"left":{"kind":"load","path":"GAIN","line":6},"right":{"kind":"call","name":"dot","line":6,"args":[{"kind":"load","path":"f","line":6},{"kind":"load","path":"obs.heading","line":6}]}},
              {"kind":"const","value":0.0,"line":6}
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
        assert!((action.forward - 3.0).abs() < 1e-12);
        assert_eq!(action.turning, 0.0);
    }

    #[test]
    fn private_state_is_independent_per_agent_and_resets() {
        let ir = r#"{
          "schema":"vlab.controller-ir/0.1","language":"python-vlab/0.1","controller":"Stateful","entry":"step",
          "parameters":{},"state":[{"name":"counter","type":"scalar","initial":0.0}],
          "body":[
            {"kind":"aug_assign","target":"self.counter","op":"+","line":4,"value":{"kind":"const","value":1.0,"line":4}},
            {"kind":"return","line":5,"value":{"kind":"call","name":"Motion","line":5,"args":[{"kind":"load","path":"self.counter","line":5},{"kind":"const","value":0.0,"line":5}]}}
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
