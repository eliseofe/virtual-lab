use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};

use serde::Deserialize;

use crate::{
    Action, ControllerRuntime, NeighbourObservation, Observation, ScientificRng, Vec2,
    RNG_DOMAIN_CONTROLLER,
};

#[derive(Debug, Clone, Copy)]
enum Value {
    Scalar(f64),
    Vec2(Vec2),
    Bool(bool),
    Action(Action),
}

impl Value {
    fn scalar(self) -> f64 {
        match self {
            Value::Scalar(value) => value,
            _ => unreachable!("validated controller scalar"),
        }
    }
    fn vec2(self) -> Vec2 {
        match self {
            Value::Vec2(value) => value,
            _ => unreachable!("validated controller vector"),
        }
    }
    fn boolean(self) -> bool {
        match self {
            Value::Bool(value) => value,
            _ => unreachable!("validated controller boolean"),
        }
    }
    fn action(self) -> Action {
        match self {
            Value::Action(value) => value,
            _ => unreachable!("validated controller action"),
        }
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
    references: Vec<String>,
    #[serde(default)]
    state: Vec<StateDeclaration>,
    body: Vec<Statement>,
}

#[derive(Debug, Deserialize)]
struct StateDeclaration {
    name: String,
    #[serde(rename = "type")]
    value_type: String,
    initial: StateValue,
    // #577 (D-023): a trait is set per group by the experimenter and is
    // read-only for the robot.
    #[serde(default, rename = "trait")]
    is_trait: bool,
}

/// A private-state value as JSON: a number, or true/false for bool traits.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(untagged)]
pub(crate) enum StateValue {
    Number(f64),
    Bool(bool),
}

impl StateValue {
    pub(crate) fn as_f64(self) -> f64 {
        match self {
            StateValue::Number(value) => value,
            StateValue::Bool(value) => f64::from(u8::from(value)),
        }
    }
}

#[derive(Debug, Clone, Copy)]
struct StateSlot {
    index: usize,
    boolean: bool,
}

type StateSlots = HashMap<String, StateSlot>;

#[derive(Debug, Deserialize)]
struct ConditionalBranch {
    condition: Expression,
    body: Vec<Statement>,
    #[serde(default)]
    line: Option<usize>,
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
    If {
        branches: Vec<ConditionalBranch>,
        #[serde(default)]
        else_body: Vec<Statement>,
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
    BoolConst {
        value: bool,
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
    Compare {
        op: String,
        left: Box<Expression>,
        right: Box<Expression>,
        #[serde(default)]
        line: Option<usize>,
    },
    BoolOp {
        op: String,
        left: Box<Expression>,
        right: Box<Expression>,
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

fn validate_expression(
    expression: &Expression,
    parameters: &HashSet<String>,
    state: &HashSet<String>,
    locals: &HashSet<String>,
    loop_variable: Option<&str>,
) -> Result<(), String> {
    match expression {
        Expression::Const { value, line } => {
            if !value.is_finite() {
                return Err(at_line(*line, "numeric constants must be finite"));
            }
        }
        Expression::BoolConst { .. } => {}
        Expression::Load { path, line } => {
            if path == "obs.heading"
                || path == "obs.neighbours"
                || path == "obs.environmental_scalar"
            {
                return Ok(());
            }
            if let Some(reference_path) = path.strip_prefix("obs.references.") {
                let mut pieces = reference_path.split('.');
                let name = pieces.next().unwrap_or_default();
                let field = pieces.next().unwrap_or_default();
                if pieces.next().is_none()
                    && !name.is_empty()
                    && name.chars().enumerate().all(|(index, c)| {
                        c == '_' || c.is_ascii_alphanumeric() && (index > 0 || !c.is_ascii_digit())
                    })
                    && matches!(field, "available" | "relative_position")
                {
                    return Ok(());
                }
            }
            if let Some(name) = path.strip_prefix("self.") {
                if state.contains(name) {
                    return Ok(());
                }
                return Err(at_line(
                    *line,
                    format!("private state '{name}' is not declared"),
                ));
            }
            if let Some(variable) = loop_variable {
                if path.strip_prefix(variable) == Some(".relative_position") {
                    return Ok(());
                }
            }
            if path.contains('.') {
                return Err(at_line(
                    *line,
                    format!("observation field '{path}' is unavailable"),
                ));
            }
            if parameters.contains(path) || locals.contains(path) {
                return Ok(());
            }
            return Err(at_line(*line, format!("unknown identifier '{path}'")));
        }
        Expression::Unary { op, value, line } => {
            if !matches!(op.as_str(), "-" | "not") {
                return Err(at_line(*line, format!("unsupported unary operator '{op}'")));
            }
            validate_expression(value, parameters, state, locals, loop_variable)?;
        }
        Expression::Compare {
            op,
            left,
            right,
            line,
        } => {
            if !matches!(op.as_str(), "<" | "<=" | ">" | ">=" | "==" | "!=") {
                return Err(at_line(
                    *line,
                    format!("unsupported comparison operator '{op}'"),
                ));
            }
            validate_expression(left, parameters, state, locals, loop_variable)?;
            validate_expression(right, parameters, state, locals, loop_variable)?;
        }
        Expression::BoolOp {
            op,
            left,
            right,
            line,
        } => {
            if !matches!(op.as_str(), "and" | "or") {
                return Err(at_line(
                    *line,
                    format!("unsupported boolean operator '{op}'"),
                ));
            }
            validate_expression(left, parameters, state, locals, loop_variable)?;
            validate_expression(right, parameters, state, locals, loop_variable)?;
        }
        Expression::Binary {
            op,
            left,
            right,
            line,
        } => {
            if !matches!(op.as_str(), "+" | "-" | "*" | "/" | "//" | "%") {
                return Err(at_line(
                    *line,
                    format!("unsupported binary operator '{op}'"),
                ));
            }
            validate_expression(left, parameters, state, locals, loop_variable)?;
            validate_expression(right, parameters, state, locals, loop_variable)?;
        }
        Expression::Call { name, args, line } => {
            let arity = match name.as_str() {
                "Vec2" | "dot" | "atan2" | "pow" | "min" | "max" | "Motion" | "rng.uniform"
                | "rng.normal" => 2,
                "perpendicular" | "norm" | "abs" | "sqrt" | "exp" | "log" | "sin" | "cos"
                | "tan" | "asin" | "acos" | "atan" | "floor" | "ceil" | "rng.bernoulli" => 1,
                _ => return Err(at_line(*line, format!("unsupported call '{name}'"))),
            };
            if args.len() != arity {
                return Err(at_line(*line, format!("{name} expects {arity} arguments")));
            }
            for arg in args {
                validate_expression(arg, parameters, state, locals, loop_variable)?;
            }
        }
    }
    Ok(())
}

fn intersect_local_sets(sets: &[HashSet<String>]) -> HashSet<String> {
    let Some(first) = sets.first() else {
        return HashSet::new();
    };
    let mut out = first.clone();
    out.retain(|name| sets.iter().all(|set| set.contains(name)));
    out
}

// A range argument: numbers and controller parameters combined with arithmetic,
// so its value is fixed for the whole run.
fn validate_run_constant(
    expression: &Expression,
    parameters: &HashSet<String>,
    line: Option<usize>,
) -> Result<(), String> {
    match expression {
        Expression::Const { .. } => Ok(()),
        Expression::Load { path, .. } if parameters.contains(path) => Ok(()),
        Expression::Unary { op, value, .. } if op == "-" => {
            validate_run_constant(value, parameters, line)
        }
        Expression::Binary {
            op, left, right, ..
        } if matches!(op.as_str(), "+" | "-" | "*" | "/" | "//" | "%") => {
            validate_run_constant(left, parameters, line)?;
            validate_run_constant(right, parameters, line)
        }
        _ => Err(at_line(
            line,
            "range arguments must be numbers or controller parameters",
        )),
    }
}

fn run_constant_value(expression: &Expression, parameters: &BTreeMap<String, f64>) -> f64 {
    match expression {
        Expression::Const { value, .. } => *value,
        Expression::Load { path, .. } => parameters[path],
        Expression::Unary { value, .. } => -run_constant_value(value, parameters),
        Expression::Binary {
            op, left, right, ..
        } => {
            let (a, b) = (
                run_constant_value(left, parameters),
                run_constant_value(right, parameters),
            );
            match op.as_str() {
                "+" => a + b,
                "-" => a - b,
                "*" => a * b,
                "/" => a / b,
                "//" => crate::scalar_ops::floor_divide(a, b),
                _ => crate::scalar_ops::modulo(a, b),
            }
        }
        _ => unreachable!("validated run constant"),
    }
}

// With the run's parameter values: every range has integer arguments and a
// nonzero step (the same rule as Initialization's range).
fn check_range_bounds(
    body: &[Statement],
    parameters: &BTreeMap<String, f64>,
) -> Result<(), String> {
    for statement in body {
        match statement {
            Statement::ForEach {
                iterable,
                body,
                line,
                ..
            } => {
                if let Expression::Call { name, args, .. } = iterable {
                    if name == "range" {
                        let values: Vec<f64> = args
                            .iter()
                            .map(|arg| run_constant_value(arg, parameters))
                            .collect();
                        let step = if values.len() == 3 { values[2] } else { 1.0 };
                        if values.iter().any(|v| !v.is_finite() || v.fract() != 0.0) || step == 0.0
                        {
                            return Err(at_line(
                                *line,
                                "range arguments must be integers and step must be nonzero",
                            ));
                        }
                    }
                }
                check_range_bounds(body, parameters)?;
            }
            Statement::If {
                branches,
                else_body,
                ..
            } => {
                for branch in branches {
                    check_range_bounds(&branch.body, parameters)?;
                }
                check_range_bounds(else_body, parameters)?;
            }
            _ => {}
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
            Statement::Assign {
                target,
                value,
                line,
            } => {
                validate_expression(value, parameters, state, locals, loop_variable)?;
                if let Some(name) = target.strip_prefix("self.") {
                    if !state.contains(name) {
                        return Err(at_line(
                            *line,
                            format!("private state '{name}' is not declared"),
                        ));
                    }
                } else {
                    if parameters.contains(target)
                        || target == "obs"
                        || loop_variable == Some(target.as_str())
                    {
                        return Err(at_line(
                            *line,
                            format!("cannot assign to scientific input '{target}'"),
                        ));
                    }
                    locals.insert(target.clone());
                }
            }
            Statement::AugAssign {
                target,
                op,
                value,
                line,
            } => {
                if op != "+" {
                    return Err(at_line(
                        *line,
                        format!("unsupported augmented operator '{op}'"),
                    ));
                }
                validate_expression(value, parameters, state, locals, loop_variable)?;
                if let Some(name) = target.strip_prefix("self.") {
                    if !state.contains(name) {
                        return Err(at_line(
                            *line,
                            format!("private state '{name}' is not declared"),
                        ));
                    }
                } else if !locals.contains(target) {
                    return Err(at_line(
                        *line,
                        format!("local '{target}' must be assigned before '+='"),
                    ));
                }
            }
            Statement::ForEach {
                variable,
                iterable,
                body,
                line,
            } => {
                match iterable {
                    Expression::Load { path, .. } if path == "obs.neighbours" => {
                        if loop_variable.is_some() {
                            return Err(at_line(*line, "nested neighbour loops are not supported"));
                        }
                        let mut nested = locals.clone();
                        validate_statements(body, parameters, state, &mut nested, Some(variable))?;
                    }
                    // #577: range over run constants; the loop variable is a
                    // scalar local of the loop body.
                    Expression::Call { name, args, .. } if name == "range" => {
                        if args.is_empty() || args.len() > 3 {
                            return Err(at_line(*line, "range expects 1, 2 or 3 arguments"));
                        }
                        for arg in args {
                            validate_run_constant(arg, parameters, *line)?;
                        }
                        let mut nested = locals.clone();
                        nested.insert(variable.clone());
                        validate_statements(body, parameters, state, &mut nested, loop_variable)?;
                    }
                    _ => {
                        return Err(at_line(
                            *line,
                            "for loop must iterate over obs.neighbours or range(...)",
                        ))
                    }
                }
            }
            Statement::If {
                branches,
                else_body,
                ..
            } => {
                let before = locals.clone();
                let mut continuing = Vec::new();
                let mut all_return = !else_body.is_empty();

                for branch in branches {
                    validate_expression(
                        &branch.condition,
                        parameters,
                        state,
                        &before,
                        loop_variable,
                    )?;
                    let mut nested = before.clone();
                    let branch_returns = validate_statements(
                        &branch.body,
                        parameters,
                        state,
                        &mut nested,
                        loop_variable,
                    )?;
                    if !branch_returns {
                        continuing.push(nested);
                    }
                    all_return &= branch_returns;
                }

                if else_body.is_empty() {
                    continuing.push(before.clone());
                    all_return = false;
                } else {
                    let mut nested = before.clone();
                    let else_returns = validate_statements(
                        else_body,
                        parameters,
                        state,
                        &mut nested,
                        loop_variable,
                    )?;
                    if !else_returns {
                        continuing.push(nested);
                    }
                    all_return &= else_returns;
                }

                if !continuing.is_empty() {
                    *locals = intersect_local_sets(&continuing);
                }
                returns |= all_return;
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
                if !target.starts_with("self.") {
                    out.insert(target.clone());
                }
            }
            Statement::ForEach {
                variable,
                iterable,
                body,
                ..
            } => {
                if matches!(iterable, Expression::Call { name, .. } if name == "range") {
                    out.insert(variable.clone());
                }
                collect_local_names(body, out)
            }
            Statement::If {
                branches,
                else_body,
                ..
            } => {
                for branch in branches {
                    collect_local_names(&branch.body, out);
                }
                collect_local_names(else_body, out);
            }
            Statement::Return { .. } => {}
        }
    }
}

#[derive(Debug, Clone, Copy)]
enum BinaryOp {
    Add,
    Subtract,
    Multiply,
    Divide,
    FloorDivide,
    Modulo,
}

#[derive(Debug, Clone, Copy)]
enum CompareOp {
    Less,
    LessEqual,
    Greater,
    GreaterEqual,
    Equal,
    NotEqual,
}

#[derive(Debug, Clone, Copy)]
enum BooleanOp {
    And,
    Or,
}

#[derive(Debug, Clone, Copy)]
enum Intrinsic {
    Vec2,
    Dot,
    Perpendicular,
    Norm,
    Abs,
    Sqrt,
    Exp,
    Log,
    Sin,
    Cos,
    Tan,
    Asin,
    Acos,
    Atan,
    Atan2,
    Floor,
    Ceil,
    Pow,
    Min,
    Max,
    Motion,
    RngUniform,
    RngBernoulli,
    RngNormal,
}

#[derive(Debug, Clone, Copy)]
enum PreparedLoad {
    Heading,
    EnvironmentalScalar,
    NeighbourRelativePosition,
    ReferenceAvailable(usize),
    ReferenceRelativePosition(usize),
    Parameter(usize),
    PrivateState(usize),
    PrivateBool(usize),
    Local(usize),
}

#[derive(Debug, Clone, Copy)]
enum EvalOp {
    Const(f64),
    BoolConst(bool),
    Load(PreparedLoad),
    Negate,
    Not,
    Compare(CompareOp),
    Boolean(BooleanOp),
    Binary(BinaryOp),
    Intrinsic(Intrinsic),
}

#[derive(Debug)]
struct PreparedExpression {
    ops: Vec<EvalOp>,
    stack_capacity: usize,
}

#[derive(Debug, Clone, Copy)]
enum PreparedTarget {
    PrivateState(usize),
    Local(usize),
}

#[derive(Debug)]
struct PreparedConditionalBranch {
    condition: PreparedExpression,
    body: Vec<PreparedStatement>,
}

#[derive(Debug)]
enum PreparedStatement {
    Assign {
        target: PreparedTarget,
        value: PreparedExpression,
    },
    AugAssign {
        target: PreparedTarget,
        value: PreparedExpression,
    },
    ForEachNeighbour {
        body: Vec<PreparedStatement>,
    },
    ForRange {
        slot: usize,
        args: Vec<PreparedExpression>,
        body: Vec<PreparedStatement>,
    },
    If {
        branches: Vec<PreparedConditionalBranch>,
        else_body: Vec<PreparedStatement>,
    },
    Return {
        value: PreparedExpression,
    },
}

fn resolve_load(
    path: &str,
    line: Option<usize>,
    parameter_slots: &HashMap<String, usize>,
    reference_slots: &HashMap<String, usize>,
    state_slots: &StateSlots,
    local_slots: &HashMap<String, usize>,
    loop_variable: Option<&str>,
) -> Result<PreparedLoad, String> {
    if path == "obs.heading" {
        return Ok(PreparedLoad::Heading);
    }
    if path == "obs.environmental_scalar" {
        return Ok(PreparedLoad::EnvironmentalScalar);
    }
    if let Some(reference_path) = path.strip_prefix("obs.references.") {
        let mut pieces = reference_path.split('.');
        let name = pieces.next().unwrap_or_default();
        let field = pieces.next().unwrap_or_default();
        if pieces.next().is_none() {
            let slot = *reference_slots.get(name).ok_or_else(|| {
                at_line(
                    line,
                    format!("world reference '{name}' is not declared by the controller IR"),
                )
            })?;
            return match field {
                "available" => Ok(PreparedLoad::ReferenceAvailable(slot)),
                "relative_position" => Ok(PreparedLoad::ReferenceRelativePosition(slot)),
                _ => Err(at_line(
                    line,
                    format!("unknown world reference observation field '{field}'"),
                )),
            };
        }
    }
    if let Some(name) = path.strip_prefix("self.") {
        let slot = *state_slots
            .get(name)
            .ok_or_else(|| at_line(line, "validated private state slot missing"))?;
        return Ok(if slot.boolean {
            PreparedLoad::PrivateBool(slot.index)
        } else {
            PreparedLoad::PrivateState(slot.index)
        });
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
    Err(at_line(
        line,
        "validated controller load could not be prepared",
    ))
}

fn emit_expression(
    expression: &Expression,
    parameter_slots: &HashMap<String, usize>,
    reference_slots: &HashMap<String, usize>,
    state_slots: &StateSlots,
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
        Expression::BoolConst { value, .. } => {
            ops.push(EvalOp::BoolConst(*value));
            *depth += 1;
            *max_depth = (*max_depth).max(*depth);
        }
        Expression::Load { path, line } => {
            ops.push(EvalOp::Load(resolve_load(
                path,
                *line,
                parameter_slots,
                reference_slots,
                state_slots,
                local_slots,
                loop_variable,
            )?));
            *depth += 1;
            *max_depth = (*max_depth).max(*depth);
        }
        Expression::Unary { op, value, .. } => {
            emit_expression(
                value,
                parameter_slots,
                reference_slots,
                state_slots,
                local_slots,
                loop_variable,
                ops,
                depth,
                max_depth,
            )?;
            ops.push(match op.as_str() {
                "-" => EvalOp::Negate,
                "not" => EvalOp::Not,
                _ => unreachable!("validated unary operator"),
            });
        }
        Expression::Compare {
            op, left, right, ..
        } => {
            emit_expression(
                left,
                parameter_slots,
                reference_slots,
                state_slots,
                local_slots,
                loop_variable,
                ops,
                depth,
                max_depth,
            )?;
            emit_expression(
                right,
                parameter_slots,
                reference_slots,
                state_slots,
                local_slots,
                loop_variable,
                ops,
                depth,
                max_depth,
            )?;
            let op = match op.as_str() {
                "<" => CompareOp::Less,
                "<=" => CompareOp::LessEqual,
                ">" => CompareOp::Greater,
                ">=" => CompareOp::GreaterEqual,
                "==" => CompareOp::Equal,
                "!=" => CompareOp::NotEqual,
                _ => unreachable!("validated comparison operator"),
            };
            ops.push(EvalOp::Compare(op));
            *depth -= 1;
        }
        Expression::BoolOp {
            op, left, right, ..
        } => {
            emit_expression(
                left,
                parameter_slots,
                reference_slots,
                state_slots,
                local_slots,
                loop_variable,
                ops,
                depth,
                max_depth,
            )?;
            emit_expression(
                right,
                parameter_slots,
                reference_slots,
                state_slots,
                local_slots,
                loop_variable,
                ops,
                depth,
                max_depth,
            )?;
            ops.push(EvalOp::Boolean(match op.as_str() {
                "and" => BooleanOp::And,
                "or" => BooleanOp::Or,
                _ => unreachable!("validated boolean operator"),
            }));
            *depth -= 1;
        }
        Expression::Binary {
            op, left, right, ..
        } => {
            emit_expression(
                left,
                parameter_slots,
                reference_slots,
                state_slots,
                local_slots,
                loop_variable,
                ops,
                depth,
                max_depth,
            )?;
            emit_expression(
                right,
                parameter_slots,
                reference_slots,
                state_slots,
                local_slots,
                loop_variable,
                ops,
                depth,
                max_depth,
            )?;
            let op = match op.as_str() {
                "+" => BinaryOp::Add,
                "-" => BinaryOp::Subtract,
                "*" => BinaryOp::Multiply,
                "/" => BinaryOp::Divide,
                "//" => BinaryOp::FloorDivide,
                "%" => BinaryOp::Modulo,
                _ => unreachable!("validated binary operator"),
            };
            ops.push(EvalOp::Binary(op));
            *depth -= 1;
        }
        Expression::Call { name, args, .. } => {
            for arg in args {
                emit_expression(
                    arg,
                    parameter_slots,
                    reference_slots,
                    state_slots,
                    local_slots,
                    loop_variable,
                    ops,
                    depth,
                    max_depth,
                )?;
            }
            let intrinsic = match name.as_str() {
                "Vec2" => Intrinsic::Vec2,
                "dot" => Intrinsic::Dot,
                "perpendicular" => Intrinsic::Perpendicular,
                "norm" => Intrinsic::Norm,
                "abs" => Intrinsic::Abs,
                "sqrt" => Intrinsic::Sqrt,
                "exp" => Intrinsic::Exp,
                "log" => Intrinsic::Log,
                "sin" => Intrinsic::Sin,
                "cos" => Intrinsic::Cos,
                "tan" => Intrinsic::Tan,
                "asin" => Intrinsic::Asin,
                "acos" => Intrinsic::Acos,
                "atan" => Intrinsic::Atan,
                "atan2" => Intrinsic::Atan2,
                "floor" => Intrinsic::Floor,
                "ceil" => Intrinsic::Ceil,
                "pow" => Intrinsic::Pow,
                "min" => Intrinsic::Min,
                "max" => Intrinsic::Max,
                "Motion" => Intrinsic::Motion,
                "rng.uniform" => Intrinsic::RngUniform,
                "rng.bernoulli" => Intrinsic::RngBernoulli,
                "rng.normal" => Intrinsic::RngNormal,
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
    reference_slots: &HashMap<String, usize>,
    state_slots: &StateSlots,
    local_slots: &HashMap<String, usize>,
    loop_variable: Option<&str>,
) -> Result<PreparedExpression, String> {
    let mut ops = Vec::new();
    let mut depth = 0;
    let mut max_depth = 0;
    emit_expression(
        expression,
        parameter_slots,
        reference_slots,
        state_slots,
        local_slots,
        loop_variable,
        &mut ops,
        &mut depth,
        &mut max_depth,
    )?;
    debug_assert_eq!(depth, 1);
    Ok(PreparedExpression {
        ops,
        stack_capacity: max_depth,
    })
}

/// Traits are set by the experimenter per group and are read-only for the
/// robot (#577, D-023).
fn check_trait_writes(body: &[Statement], traits: &HashSet<String>) -> Result<(), String> {
    for statement in body {
        match statement {
            Statement::Assign { target, line, .. } | Statement::AugAssign { target, line, .. } => {
                if let Some(name) = target.strip_prefix("self.") {
                    if traits.contains(name) {
                        return Err(at_line(
                            *line,
                            format!("trait '{name}' is read-only: it is set per group by the experimenter"),
                        ));
                    }
                }
            }
            Statement::ForEach { body, .. } => check_trait_writes(body, traits)?,
            Statement::If {
                branches,
                else_body,
                ..
            } => {
                for branch in branches {
                    check_trait_writes(&branch.body, traits)?;
                }
                check_trait_writes(else_body, traits)?;
            }
            Statement::Return { .. } => {}
        }
    }
    Ok(())
}

fn prepare_target(
    target: &str,
    state_slots: &StateSlots,
    local_slots: &HashMap<String, usize>,
) -> PreparedTarget {
    if let Some(name) = target.strip_prefix("self.") {
        PreparedTarget::PrivateState(state_slots[name].index)
    } else {
        PreparedTarget::Local(local_slots[target])
    }
}

fn prepare_statements(
    body: &[Statement],
    parameter_slots: &HashMap<String, usize>,
    reference_slots: &HashMap<String, usize>,
    state_slots: &StateSlots,
    local_slots: &HashMap<String, usize>,
    loop_variable: Option<&str>,
) -> Result<Vec<PreparedStatement>, String> {
    body.iter()
        .map(|statement| {
            Ok(match statement {
                Statement::Assign { target, value, .. } => PreparedStatement::Assign {
                    target: prepare_target(target, state_slots, local_slots),
                    value: prepare_expression(
                        value,
                        parameter_slots,
                        reference_slots,
                        state_slots,
                        local_slots,
                        loop_variable,
                    )?,
                },
                Statement::AugAssign { target, value, .. } => PreparedStatement::AugAssign {
                    target: prepare_target(target, state_slots, local_slots),
                    value: prepare_expression(
                        value,
                        parameter_slots,
                        reference_slots,
                        state_slots,
                        local_slots,
                        loop_variable,
                    )?,
                },
                Statement::ForEach {
                    variable,
                    iterable: Expression::Call { name, args, .. },
                    body,
                    ..
                } if name == "range" => PreparedStatement::ForRange {
                    slot: local_slots[variable],
                    args: args
                        .iter()
                        .map(|arg| {
                            prepare_expression(
                                arg,
                                parameter_slots,
                                reference_slots,
                                state_slots,
                                local_slots,
                                loop_variable,
                            )
                        })
                        .collect::<Result<_, _>>()?,
                    body: prepare_statements(
                        body,
                        parameter_slots,
                        reference_slots,
                        state_slots,
                        local_slots,
                        loop_variable,
                    )?,
                },
                Statement::ForEach { variable, body, .. } => PreparedStatement::ForEachNeighbour {
                    body: prepare_statements(
                        body,
                        parameter_slots,
                        reference_slots,
                        state_slots,
                        local_slots,
                        Some(variable),
                    )?,
                },
                Statement::If {
                    branches,
                    else_body,
                    ..
                } => PreparedStatement::If {
                    branches: branches
                        .iter()
                        .map(|branch| {
                            Ok(PreparedConditionalBranch {
                                condition: prepare_expression(
                                    &branch.condition,
                                    parameter_slots,
                                    reference_slots,
                                    state_slots,
                                    local_slots,
                                    loop_variable,
                                )?,
                                body: prepare_statements(
                                    &branch.body,
                                    parameter_slots,
                                    reference_slots,
                                    state_slots,
                                    local_slots,
                                    loop_variable,
                                )?,
                            })
                        })
                        .collect::<Result<Vec<_>, String>>()?,
                    else_body: prepare_statements(
                        else_body,
                        parameter_slots,
                        reference_slots,
                        state_slots,
                        local_slots,
                        loop_variable,
                    )?,
                },
                Statement::Return { value, .. } => PreparedStatement::Return {
                    value: prepare_expression(
                        value,
                        parameter_slots,
                        reference_slots,
                        state_slots,
                        local_slots,
                        loop_variable,
                    )?,
                },
            })
        })
        .collect()
}

fn compare(op: CompareOp, left: Value, right: Value) -> Value {
    let left = left.scalar();
    let right = right.scalar();
    Value::Bool(match op {
        CompareOp::Less => left < right,
        CompareOp::LessEqual => left <= right,
        CompareOp::Greater => left > right,
        CompareOp::GreaterEqual => left >= right,
        CompareOp::Equal => left == right,
        CompareOp::NotEqual => left != right,
    })
}

fn boolean(op: BooleanOp, left: Value, right: Value) -> Value {
    let left = left.boolean();
    let right = right.boolean();
    Value::Bool(match op {
        BooleanOp::And => left && right,
        BooleanOp::Or => left || right,
    })
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
        (BinaryOp::FloorDivide, Value::Scalar(a), Value::Scalar(b)) => {
            Value::Scalar(crate::scalar_ops::floor_divide(a, b))
        }
        (BinaryOp::Modulo, Value::Scalar(a), Value::Scalar(b)) => {
            Value::Scalar(crate::scalar_ops::modulo(a, b))
        }
        _ => unreachable!("JS compiler preserves controller expression types"),
    }
}

fn push_load(
    load: PreparedLoad,
    parameters: &[f64],
    private_state: &[f64],
    locals: &[Value],
    reference_names: &[String],
    observation: &Observation,
    neighbour: Option<&NeighbourObservation>,
    stack: &mut Vec<Value>,
) {
    stack.push(match load {
        PreparedLoad::Heading => Value::Vec2(observation.heading),
        PreparedLoad::EnvironmentalScalar => Value::Scalar(
            observation
                .environmental_scalar
                .expect("validated environmental scalar observation"),
        ),
        PreparedLoad::NeighbourRelativePosition => Value::Vec2(
            neighbour
                .expect("prepared neighbour load inside loop")
                .relative_position,
        ),
        PreparedLoad::ReferenceAvailable(slot) => {
            Value::Bool(observation.references.contains_key(&reference_names[slot]))
        }
        PreparedLoad::ReferenceRelativePosition(slot) => Value::Vec2(
            *observation
                .references
                .get(&reference_names[slot])
                .expect("reference relative_position read requires available observation"),
        ),
        PreparedLoad::Parameter(slot) => Value::Scalar(parameters[slot]),
        PreparedLoad::PrivateState(slot) => Value::Scalar(private_state[slot]),
        PreparedLoad::PrivateBool(slot) => Value::Bool(private_state[slot] != 0.0),
        PreparedLoad::Local(slot) => locals[slot],
    });
}

fn execute_intrinsic(intrinsic: Intrinsic, stack: &mut Vec<Value>, rng: &mut ScientificRng) {
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
        Intrinsic::Abs => {
            let value = stack.pop().expect("validated abs value").scalar();
            stack.push(Value::Scalar(value.abs()));
        }
        Intrinsic::Sqrt => {
            let value = stack.pop().expect("validated sqrt value").scalar();
            stack.push(Value::Scalar(value.sqrt()));
        }
        Intrinsic::Exp => {
            let value = stack.pop().expect("validated exp value").scalar();
            stack.push(Value::Scalar(value.exp()));
        }
        Intrinsic::Log => {
            let value = stack.pop().expect("validated log value").scalar();
            stack.push(Value::Scalar(value.ln()));
        }
        Intrinsic::Sin => {
            let value = stack.pop().expect("validated sin value").scalar();
            stack.push(Value::Scalar(value.sin()));
        }
        Intrinsic::Cos => {
            let value = stack.pop().expect("validated cos value").scalar();
            stack.push(Value::Scalar(value.cos()));
        }
        Intrinsic::Tan => {
            let value = stack.pop().expect("validated tan value").scalar();
            stack.push(Value::Scalar(value.tan()));
        }
        Intrinsic::Asin => {
            let value = stack.pop().expect("validated asin value").scalar();
            stack.push(Value::Scalar(value.asin()));
        }
        Intrinsic::Acos => {
            let value = stack.pop().expect("validated acos value").scalar();
            stack.push(Value::Scalar(value.acos()));
        }
        Intrinsic::Atan => {
            let value = stack.pop().expect("validated atan value").scalar();
            stack.push(Value::Scalar(value.atan()));
        }
        Intrinsic::Atan2 => {
            let x = stack.pop().expect("validated atan2 x").scalar();
            let y = stack.pop().expect("validated atan2 y").scalar();
            stack.push(Value::Scalar(y.atan2(x)));
        }
        Intrinsic::Floor => {
            let value = stack.pop().expect("validated floor value").scalar();
            stack.push(Value::Scalar(value.floor()));
        }
        Intrinsic::Ceil => {
            let value = stack.pop().expect("validated ceil value").scalar();
            stack.push(Value::Scalar(value.ceil()));
        }
        Intrinsic::Pow => {
            let exponent = stack.pop().expect("validated pow exponent").scalar();
            let base = stack.pop().expect("validated pow base").scalar();
            stack.push(Value::Scalar(base.powf(exponent)));
        }
        Intrinsic::Min => {
            let right = stack.pop().expect("validated min right").scalar();
            let left = stack.pop().expect("validated min left").scalar();
            stack.push(Value::Scalar(left.min(right)));
        }
        Intrinsic::Max => {
            let right = stack.pop().expect("validated max right").scalar();
            let left = stack.pop().expect("validated max left").scalar();
            stack.push(Value::Scalar(left.max(right)));
        }
        Intrinsic::Motion => {
            let turning = stack.pop().expect("validated Motion turning").scalar();
            let forward = stack.pop().expect("validated Motion forward").scalar();
            assert!(
                forward.is_finite() && turning.is_finite(),
                "controller Motion requires finite scalar arguments"
            );
            stack.push(Value::Action(Action { forward, turning }));
        }
        Intrinsic::RngUniform => {
            let upper = stack.pop().expect("validated rng.uniform upper").scalar();
            let lower = stack.pop().expect("validated rng.uniform lower").scalar();
            assert!(
                lower.is_finite() && upper.is_finite(),
                "rng.uniform bounds must be finite"
            );
            assert!(upper >= lower, "rng.uniform requires upper >= lower");
            let value = lower + (upper - lower) * rng.unit();
            assert!(
                value.is_finite(),
                "rng.uniform produced a non-finite result"
            );
            stack.push(Value::Scalar(value));
        }
        Intrinsic::RngBernoulli => {
            let probability = stack
                .pop()
                .expect("validated rng.bernoulli probability")
                .scalar();
            assert!(
                probability.is_finite() && (0.0..=1.0).contains(&probability),
                "rng.bernoulli probability must be finite and in [0, 1]"
            );
            stack.push(Value::Bool(rng.unit() < probability));
        }
        Intrinsic::RngNormal => {
            let stddev = stack.pop().expect("validated rng.normal stddev").scalar();
            let mean = stack.pop().expect("validated rng.normal mean").scalar();
            assert!(mean.is_finite(), "rng.normal mean must be finite");
            assert!(
                stddev.is_finite() && stddev >= 0.0,
                "rng.normal stddev must be finite and non-negative"
            );
            let u1 = 1.0 - rng.unit();
            let u2 = rng.unit();
            let z = (-2.0 * u1.ln()).sqrt() * (std::f64::consts::TAU * u2).cos();
            let value = mean + stddev * z;
            assert!(value.is_finite(), "rng.normal produced a non-finite result");
            stack.push(Value::Scalar(value));
        }
    }
}

fn evaluate(
    expression: &PreparedExpression,
    parameters: &[f64],
    private_state: &[f64],
    locals: &[Value],
    reference_names: &[String],
    observation: &Observation,
    neighbour: Option<&NeighbourObservation>,
    rng: &mut ScientificRng,
    stack: &mut Vec<Value>,
) -> Value {
    stack.clear();
    debug_assert!(stack.capacity() >= expression.stack_capacity);
    for op in &expression.ops {
        match *op {
            EvalOp::Const(value) => stack.push(Value::Scalar(value)),
            EvalOp::BoolConst(value) => stack.push(Value::Bool(value)),
            EvalOp::Load(load) => {
                push_load(
                    load,
                    parameters,
                    private_state,
                    locals,
                    reference_names,
                    observation,
                    neighbour,
                    stack,
                );
            }
            EvalOp::Negate => {
                let value = stack.pop().expect("validated unary operand");
                stack.push(match value {
                    Value::Scalar(value) => Value::Scalar(-value),
                    Value::Vec2(value) => Value::Vec2(value * -1.0),
                    Value::Bool(_) | Value::Action(_) => {
                        unreachable!("cannot negate non-numeric value")
                    }
                });
            }
            EvalOp::Not => {
                let value = stack.pop().expect("validated boolean operand").boolean();
                stack.push(Value::Bool(!value));
            }
            EvalOp::Compare(op) => {
                let right = stack.pop().expect("validated comparison right");
                let left = stack.pop().expect("validated comparison left");
                stack.push(compare(op, left, right));
            }
            EvalOp::Boolean(op) => {
                let right = stack.pop().expect("validated boolean right");
                let left = stack.pop().expect("validated boolean left");
                stack.push(boolean(op, left, right));
            }
            EvalOp::Binary(op) => {
                let right = stack.pop().expect("validated binary right");
                let left = stack.pop().expect("validated binary left");
                stack.push(binary(op, left, right));
            }
            EvalOp::Intrinsic(intrinsic) => execute_intrinsic(intrinsic, stack, rng),
        }
    }
    debug_assert_eq!(stack.len(), 1);
    stack.pop().expect("validated expression result")
}

fn max_stack_in_statements(body: &[PreparedStatement]) -> usize {
    body.iter()
        .map(|statement| match statement {
            PreparedStatement::Assign { value, .. }
            | PreparedStatement::AugAssign { value, .. }
            | PreparedStatement::Return { value } => value.stack_capacity,
            PreparedStatement::ForEachNeighbour { body } => max_stack_in_statements(body),
            PreparedStatement::ForRange { args, body, .. } => args
                .iter()
                .map(|arg| arg.stack_capacity)
                .max()
                .unwrap_or(0)
                .max(max_stack_in_statements(body)),
            PreparedStatement::If {
                branches,
                else_body,
            } => {
                let branch_max = branches
                    .iter()
                    .map(|branch| {
                        branch
                            .condition
                            .stack_capacity
                            .max(max_stack_in_statements(&branch.body))
                    })
                    .max()
                    .unwrap_or(0);
                branch_max.max(max_stack_in_statements(else_body))
            }
        })
        .max()
        .unwrap_or(0)
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
    reference_names: &[String],
    observation: &Observation,
    neighbour: Option<&NeighbourObservation>,
    rng: &mut ScientificRng,
    eval_stack: &mut Vec<Value>,
) -> Option<Action> {
    for statement in body {
        match statement {
            PreparedStatement::Assign { target, value } => {
                let result = evaluate(
                    value,
                    parameters,
                    private_state,
                    locals,
                    reference_names,
                    observation,
                    neighbour,
                    rng,
                    eval_stack,
                );
                assign(*target, result, private_state, locals);
            }
            PreparedStatement::AugAssign { target, value } => {
                let right = evaluate(
                    value,
                    parameters,
                    private_state,
                    locals,
                    reference_names,
                    observation,
                    neighbour,
                    rng,
                    eval_stack,
                );
                match target {
                    PreparedTarget::PrivateState(slot) => private_state[*slot] += right.scalar(),
                    PreparedTarget::Local(slot) => {
                        locals[*slot] = binary(BinaryOp::Add, locals[*slot], right)
                    }
                }
            }
            PreparedStatement::ForRange { slot, args, body } => {
                let mut values = [0.0; 3];
                for (index, arg) in args.iter().enumerate() {
                    values[index] = evaluate(
                        arg,
                        parameters,
                        private_state,
                        locals,
                        reference_names,
                        observation,
                        neighbour,
                        rng,
                        eval_stack,
                    )
                    .scalar();
                }
                // Integer arguments and a nonzero step are checked when the
                // runtime is built (check_range_bounds).
                let (start, stop, step) = match args.len() {
                    1 => (0, values[0] as i64, 1),
                    2 => (values[0] as i64, values[1] as i64, 1),
                    _ => (values[0] as i64, values[1] as i64, values[2] as i64),
                };
                let mut current = start;
                while (step > 0 && current < stop) || (step < 0 && current > stop) {
                    locals[*slot] = Value::Scalar(current as f64);
                    if let Some(action) = execute_statements(
                        body,
                        parameters,
                        private_state,
                        locals,
                        reference_names,
                        observation,
                        neighbour,
                        rng,
                        eval_stack,
                    ) {
                        return Some(action);
                    }
                    current += step;
                }
            }
            PreparedStatement::ForEachNeighbour { body } => {
                for current in &observation.neighbours {
                    if let Some(action) = execute_statements(
                        body,
                        parameters,
                        private_state,
                        locals,
                        reference_names,
                        observation,
                        Some(current),
                        rng,
                        eval_stack,
                    ) {
                        return Some(action);
                    }
                }
            }
            PreparedStatement::If {
                branches,
                else_body,
            } => {
                let mut matched = false;
                for branch in branches {
                    if evaluate(
                        &branch.condition,
                        parameters,
                        private_state,
                        locals,
                        reference_names,
                        observation,
                        neighbour,
                        rng,
                        eval_stack,
                    )
                    .boolean()
                    {
                        matched = true;
                        if let Some(action) = execute_statements(
                            &branch.body,
                            parameters,
                            private_state,
                            locals,
                            reference_names,
                            observation,
                            neighbour,
                            rng,
                            eval_stack,
                        ) {
                            return Some(action);
                        }
                        break;
                    }
                }
                if !matched {
                    if let Some(action) = execute_statements(
                        else_body,
                        parameters,
                        private_state,
                        locals,
                        reference_names,
                        observation,
                        neighbour,
                        rng,
                        eval_stack,
                    ) {
                        return Some(action);
                    }
                }
            }
            PreparedStatement::Return { value } => {
                return Some(
                    evaluate(
                        value,
                        parameters,
                        private_state,
                        locals,
                        reference_names,
                        observation,
                        neighbour,
                        rng,
                        eval_stack,
                    )
                    .action(),
                );
            }
        }
    }
    None
}

pub struct IrControllerRuntime {
    body: Vec<PreparedStatement>,
    parameters: Vec<f64>,
    private_initial: Vec<f64>,
    private_state_slots: StateSlots,
    private_state: Vec<Vec<f64>>,
    reference_names: Vec<String>,
    root_seed: u32,
    controller_rngs: Vec<ScientificRng>,
    scratch_locals: Vec<Value>,
    scratch_eval_stack: Vec<Value>,
}

impl IrControllerRuntime {
    pub fn from_json(ir_json: &str, parameters_json: &str) -> Result<Self, String> {
        let ir: ControllerIr = serde_json::from_str(ir_json)
            .map_err(|error| format!("invalid controller IR JSON: {error}"))?;
        if ir.schema != "vlab.controller-ir/0.1" {
            return Err(format!("unsupported controller IR schema '{}'", ir.schema));
        }
        if ir.language != "python-vlab/0.1" {
            return Err(format!("unsupported controller language '{}'", ir.language));
        }
        if ir.entry != "step" {
            return Err("controller IR entry must be 'step'".to_owned());
        }

        let supplied: BTreeMap<String, f64> = serde_json::from_str(parameters_json)
            .map_err(|error| format!("invalid controller parameter JSON: {error}"))?;
        let mut parameter_slots = HashMap::new();
        let mut parameters = Vec::with_capacity(ir.parameters.len());
        for (name, value_type) in &ir.parameters {
            if value_type != "scalar" {
                return Err(format!("parameter '{name}' must be scalar"));
            }
            let value = supplied
                .get(name)
                .copied()
                .ok_or_else(|| format!("missing controller parameter '{name}'"))?;
            if !value.is_finite() {
                return Err(format!("controller parameter '{name}' must be finite"));
            }
            parameter_slots.insert(name.clone(), parameters.len());
            parameters.push(value);
        }
        for name in supplied.keys() {
            if !ir.parameters.contains_key(name) {
                return Err(format!(
                    "parameter value '{name}' was supplied but is not declared by the controller"
                ));
            }
        }

        let mut state_slots: StateSlots = HashMap::new();
        let mut private_initial = Vec::new();
        let mut traits = HashSet::new();
        for declaration in &ir.state {
            let boolean = match (declaration.value_type.as_str(), declaration.initial) {
                ("scalar", StateValue::Number(_)) => false,
                ("bool", StateValue::Bool(_)) if declaration.is_trait => true,
                ("bool", _) => {
                    return Err(format!(
                        "private state '{}' may be bool only as a trait with a true/false default",
                        declaration.name
                    ))
                }
                _ => {
                    return Err(format!(
                        "private state '{}' must be scalar or a bool trait",
                        declaration.name
                    ))
                }
            };
            let initial = declaration.initial.as_f64();
            if !initial.is_finite() {
                return Err(format!(
                    "private state '{}' initial value must be finite",
                    declaration.name
                ));
            }
            let slot = StateSlot {
                index: private_initial.len(),
                boolean,
            };
            if state_slots.insert(declaration.name.clone(), slot).is_some() {
                return Err(format!(
                    "duplicate private state declaration '{}'",
                    declaration.name
                ));
            }
            if declaration.is_trait {
                traits.insert(declaration.name.clone());
            }
            private_initial.push(initial);
        }

        let mut reference_slots = HashMap::new();
        for (slot, name) in ir.references.iter().enumerate() {
            let valid = !name.is_empty()
                && name.chars().enumerate().all(|(index, c)| {
                    c == '_' || c.is_ascii_alphanumeric() && (index > 0 || !c.is_ascii_digit())
                });
            if !valid {
                return Err(format!("invalid world reference name '{name}'"));
            }
            if reference_slots.insert(name.clone(), slot).is_some() {
                return Err(format!(
                    "duplicate world reference name '{name}' in controller IR"
                ));
            }
        }

        let parameter_names: HashSet<_> = ir.parameters.keys().cloned().collect();
        let state_names: HashSet<_> = state_slots.keys().cloned().collect();
        let mut validated_locals = HashSet::new();
        if !validate_statements(
            &ir.body,
            &parameter_names,
            &state_names,
            &mut validated_locals,
            None,
        )? {
            return Err("controller IR has no action return".to_owned());
        }
        check_range_bounds(&ir.body, &supplied)?;
        check_trait_writes(&ir.body, &traits)?;

        let mut local_names = BTreeSet::new();
        collect_local_names(&ir.body, &mut local_names);
        let local_slots: HashMap<_, _> = local_names
            .into_iter()
            .enumerate()
            .map(|(slot, name)| (name, slot))
            .collect();
        let body = prepare_statements(
            &ir.body,
            &parameter_slots,
            &reference_slots,
            &state_slots,
            &local_slots,
            None,
        )?;
        let eval_stack_capacity = max_stack_in_statements(&body).max(1);

        Ok(Self {
            body,
            parameters,
            private_initial,
            private_state_slots: state_slots,
            private_state: Vec::new(),
            reference_names: ir.references,
            root_seed: 0,
            controller_rngs: Vec::new(),
            scratch_locals: vec![Value::Scalar(f64::NAN); local_slots.len()],
            scratch_eval_stack: Vec::with_capacity(eval_stack_capacity),
        })
    }
}

impl ControllerRuntime for IrControllerRuntime {
    fn set_run_seed(&mut self, seed: u32) {
        self.root_seed = seed;
    }

    fn reset(&mut self, agent_count: usize) {
        let profiles = vec![BTreeMap::new(); agent_count];
        self.reset_with_private_state(agent_count, &profiles)
            .expect("empty private-state initialization must be valid");
    }

    fn reset_with_private_state(
        &mut self,
        agent_count: usize,
        private_state: &[BTreeMap<String, f64>],
    ) -> Result<(), String> {
        if private_state.len() != agent_count {
            return Err(format!(
                "controller private-state profile count {} does not match agent count {agent_count}",
                private_state.len()
            ));
        }
        self.private_state = vec![self.private_initial.clone(); agent_count];
        for (agent_index, profile) in private_state.iter().enumerate() {
            for (name, value) in profile {
                let declared = self.private_state_slots.get(name).copied().ok_or_else(|| {
                    format!(
                        "agent {agent_index} assigns undeclared controller private state '{name}'"
                    )
                })?;
                if declared.boolean && *value != 0.0 && *value != 1.0 {
                    return Err(format!(
                        "agent {agent_index} trait '{name}' must be true or false"
                    ));
                }
                let slot = declared.index;
                if !value.is_finite() {
                    return Err(format!(
                        "agent {agent_index} private state '{name}' must be finite"
                    ));
                }
                self.private_state[agent_index][slot] = *value;
            }
        }
        self.controller_rngs = (0..agent_count)
            .map(|agent_index| {
                ScientificRng::for_domain(self.root_seed, RNG_DOMAIN_CONTROLLER, agent_index as u64)
                    .expect("static controller RNG domain is valid")
            })
            .collect();
        self.scratch_locals.fill(Value::Scalar(f64::NAN));
        self.scratch_eval_stack.clear();
        Ok(())
    }

    fn step(&mut self, agent_index: usize, observation: &Observation) -> Action {
        self.scratch_locals.fill(Value::Scalar(f64::NAN));
        self.scratch_eval_stack.clear();
        execute_statements(
            &self.body,
            &self.parameters,
            &mut self.private_state[agent_index],
            &mut self.scratch_locals,
            &self.reference_names,
            observation,
            None,
            &mut self.controller_rngs[agent_index],
            &mut self.scratch_eval_stack,
        )
        .expect("validated controller always returns an action")
    }

    fn scientific_private_state_value(&self, agent_index: usize, name: &str) -> Option<f64> {
        let slot = self.private_state_slots.get(name).map(|slot| slot.index)?;
        self.private_state.get(agent_index)?.get(slot).copied()
    }

    fn scientific_private_state_is_bool(&self, name: &str) -> bool {
        self.private_state_slots
            .get(name)
            .is_some_and(|slot| slot.boolean)
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
                NeighbourObservation {
                    relative_position: Vec2::new(0.5, 1.0),
                },
                NeighbourObservation {
                    relative_position: Vec2::new(1.0, -1.0),
                },
            ],
            environmental_scalar: None,
            references: BTreeMap::new(),
        };
        let action = runtime.step(0, &observation);
        assert!((action.forward - 9.0).abs() < 1e-12);
        assert_eq!(action.turning, 0.0);
        let second = runtime.step(
            0,
            &Observation {
                heading: Vec2::new(1.0, 0.0),
                neighbours: vec![NeighbourObservation {
                    relative_position: Vec2::new(1.0, 0.0),
                }],
                environmental_scalar: None,
                references: BTreeMap::new(),
            },
        );
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
        let observation = Observation {
            heading: Vec2::new(1.0, 0.0),
            neighbours: vec![],
            environmental_scalar: None,
            references: BTreeMap::new(),
        };
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
                NeighbourObservation {
                    relative_position: Vec2::new(3.0, 4.0),
                },
                NeighbourObservation {
                    relative_position: Vec2::new(0.0, 2.0),
                },
            ],
            environmental_scalar: None,
            references: BTreeMap::new(),
        };
        assert_eq!(runtime.step(0, &observation).forward, 16.0);
        assert_eq!(
            runtime
                .step(
                    0,
                    &Observation {
                        heading: observation.heading,
                        neighbours: vec![],
                        environmental_scalar: None,
                        references: BTreeMap::new()
                    }
                )
                .forward,
            3.0
        );
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
        let observation = Observation {
            heading: Vec2::new(1.0, 0.0),
            neighbours: vec![],
            environmental_scalar: None,
            references: BTreeMap::new(),
        };
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
            references: BTreeMap::new(),
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

    #[test]
    fn loop_only_return_is_rejected_before_execution() {
        let invalid = r#"{
          "schema":"vlab.controller-ir/0.1","language":"python-vlab/0.1","controller":"LoopOnly","entry":"step",
          "parameters":{},"state":[],
          "body":[
            {"kind":"for_each","variable":"n","iterable":{"kind":"load","path":"obs.neighbours"},"body":[
              {"kind":"return","value":{"kind":"call","name":"Motion","args":[
                {"kind":"const","value":1.0},{"kind":"const","value":0.0}
              ]}}
            ]}
          ]
        }"#;
        assert!(IrControllerRuntime::from_json(invalid, "{}").is_err());
    }
    #[test]
    fn floor_division_and_remainder_follow_python_semantics() {
        let ir = r#"{
          "schema":"vlab.controller-ir/0.1","language":"python-vlab/0.1","controller":"Ops","entry":"step",
          "parameters":{"X":"scalar"},"state":[],
          "body":[
            {"kind":"return","value":{"kind":"call","name":"Motion","args":[
              {"kind":"binary","op":"//","left":{"kind":"load","path":"X"},"right":{"kind":"const","value":2.0}},
              {"kind":"binary","op":"%","left":{"kind":"unary","op":"-","value":{"kind":"load","path":"X"}},"right":{"kind":"const","value":3.0}}
            ]}}
          ]
        }"#;
        let mut runtime = compile(ir, r#"{"X":7.0}"#);
        runtime.reset(1);
        let observation = Observation {
            heading: Vec2::new(1.0, 0.0),
            neighbours: vec![],
            environmental_scalar: None,
            references: BTreeMap::new(),
        };
        let motion = runtime.step(0, &observation);
        assert_eq!(motion.forward, 3.0);
        assert_eq!(motion.turning, 2.0);
    }

    #[test]
    fn range_loops_over_run_constants_and_checks_their_bounds() {
        let ir = r#"{
          "schema":"vlab.controller-ir/0.1","language":"python-vlab/0.1","controller":"Sum","entry":"step",
          "parameters":{"K":"scalar"},"state":[],
          "body":[
            {"kind":"assign","target":"total","value":{"kind":"const","value":0.0}},
            {"kind":"for_each","variable":"k","iterable":{"kind":"call","name":"range","args":[{"kind":"load","path":"K"}]},
             "body":[{"kind":"aug_assign","target":"total","op":"+","value":{"kind":"load","path":"k"}}]},
            {"kind":"assign","target":"odd","value":{"kind":"const","value":0.0}},
            {"kind":"for_each","variable":"j","iterable":{"kind":"call","name":"range","args":[
              {"kind":"const","value":1.0},{"kind":"binary","op":"+","left":{"kind":"load","path":"K"},"right":{"kind":"const","value":3.0}},{"kind":"const","value":2.0}]},
             "body":[{"kind":"aug_assign","target":"odd","op":"+","value":{"kind":"load","path":"j"}}]},
            {"kind":"return","value":{"kind":"call","name":"Motion","args":[
              {"kind":"load","path":"total"},{"kind":"load","path":"odd"}
            ]}}
          ]
        }"#;
        let mut runtime = compile(ir, r#"{"K":4.0}"#);
        runtime.reset(1);
        let observation = Observation {
            heading: Vec2::new(1.0, 0.0),
            neighbours: vec![],
            environmental_scalar: None,
            references: BTreeMap::new(),
        };
        let motion = runtime.step(0, &observation);
        assert_eq!(motion.forward, 6.0, "0 + 1 + 2 + 3");
        assert_eq!(motion.turning, 9.0, "range(1, 7, 2): 1 + 3 + 5");
        let error = IrControllerRuntime::from_json(ir, r#"{"K":2.5}"#)
            .err()
            .unwrap();
        assert!(
            error.contains("range arguments must be integers"),
            "{error}"
        );
    }

    #[test]
    fn bool_traits_are_read_as_booleans_and_cannot_be_written() {
        let ir = r#"{
          "schema":"vlab.controller-ir/0.1","language":"python-vlab/0.1","controller":"Informed","entry":"step",
          "parameters":{},"state":[{"name":"informed","type":"bool","initial":false,"trait":true}],
          "body":[
            {"kind":"if","branches":[{"condition":{"kind":"load","path":"self.informed"},
              "body":[{"kind":"return","value":{"kind":"call","name":"Motion","args":[{"kind":"const","value":1.0},{"kind":"const","value":0.0}]}}]}],
             "else_body":[{"kind":"return","value":{"kind":"call","name":"Motion","args":[{"kind":"const","value":0.0},{"kind":"const","value":0.0}]}}]}
          ]
        }"#;
        let mut runtime = compile(ir, "{}");
        let profiles = vec![
            BTreeMap::from([("informed".to_owned(), 1.0)]),
            BTreeMap::new(),
        ];
        runtime.reset_with_private_state(2, &profiles).unwrap();
        let observation = Observation {
            heading: Vec2::new(1.0, 0.0),
            neighbours: vec![],
            environmental_scalar: None,
            references: BTreeMap::new(),
        };
        assert_eq!(runtime.step(0, &observation).forward, 1.0, "informed robot");
        assert_eq!(runtime.step(1, &observation).forward, 0.0, "default false");
        let bad = vec![BTreeMap::from([("informed".to_owned(), 0.5)])];
        assert!(runtime.reset_with_private_state(1, &bad).is_err());

        let writes = ir.replace(
            r#""body":["#,
            r#""body":[{"kind":"assign","target":"self.informed","value":{"kind":"bool_const","value":true}},"#,
        );
        let error = IrControllerRuntime::from_json(&writes, "{}").err().unwrap();
        assert!(error.contains("trait 'informed' is read-only"), "{error}");

        let untraited = ir.replace(r#","trait":true"#, "");
        let error = IrControllerRuntime::from_json(&untraited, "{}")
            .err()
            .unwrap();
        assert!(error.contains("may be bool only as a trait"), "{error}");
    }

    #[test]
    fn piecewise_condition_assigns_branch_local_before_motion() {
        let ir = r#"{
          "schema":"vlab.controller-ir/0.1","language":"python-vlab/0.1","controller":"Piecewise","entry":"step",
          "parameters":{"X":"scalar"},"state":[],
          "body":[
            {"kind":"if","branches":[
              {"condition":{"kind":"compare","op":"<","left":{"kind":"load","path":"X"},"right":{"kind":"const","value":0.0}},
               "body":[{"kind":"assign","target":"speed","value":{"kind":"const","value":0.0}}]},
              {"condition":{"kind":"compare","op":"<=","left":{"kind":"load","path":"X"},"right":{"kind":"const","value":1.0}},
               "body":[{"kind":"assign","target":"speed","value":{"kind":"const","value":0.5}}]}
            ],
            "else_body":[{"kind":"assign","target":"speed","value":{"kind":"const","value":1.0}}]},
            {"kind":"return","value":{"kind":"call","name":"Motion","args":[
              {"kind":"load","path":"speed"},{"kind":"const","value":0.0}
            ]}}
          ]
        }"#;
        let mut runtime = compile(ir, r#"{"X":0.5}"#);
        runtime.reset(1);
        let observation = Observation {
            heading: Vec2::new(1.0, 0.0),
            neighbours: vec![],
            environmental_scalar: None,
            references: BTreeMap::new(),
        };
        assert_eq!(runtime.step(0, &observation).forward, 0.5);
    }

    #[test]
    fn boolean_composition_and_exhaustive_branch_returns_execute() {
        let ir = r#"{
          "schema":"vlab.controller-ir/0.1","language":"python-vlab/0.1","controller":"Bool","entry":"step",
          "parameters":{"X":"scalar"},"state":[],
          "body":[
            {"kind":"if","branches":[
              {"condition":{"kind":"bool_op","op":"and",
                "left":{"kind":"compare","op":">=","left":{"kind":"load","path":"X"},"right":{"kind":"const","value":0.0}},
                "right":{"kind":"unary","op":"not","value":{"kind":"bool_const","value":false}}},
               "body":[{"kind":"return","value":{"kind":"call","name":"Motion","args":[
                 {"kind":"const","value":1.0},{"kind":"const","value":0.0}
               ]}}]}
            ],
            "else_body":[{"kind":"return","value":{"kind":"call","name":"Motion","args":[
              {"kind":"const","value":0.0},{"kind":"const","value":0.0}
            ]}}]}
          ]
        }"#;
        let mut runtime = compile(ir, r#"{"X":1.0}"#);
        runtime.reset(1);
        let observation = Observation {
            heading: Vec2::new(1.0, 0.0),
            neighbours: vec![],
            environmental_scalar: None,
            references: BTreeMap::new(),
        };
        assert_eq!(runtime.step(0, &observation).forward, 1.0);
    }

    #[test]
    fn non_exhaustive_branch_local_is_rejected_before_execution() {
        let invalid = r#"{
          "schema":"vlab.controller-ir/0.1","language":"python-vlab/0.1","controller":"Undefined","entry":"step",
          "parameters":{"X":"scalar"},"state":[],
          "body":[
            {"kind":"if","branches":[
              {"condition":{"kind":"compare","op":">=","left":{"kind":"load","path":"X"},"right":{"kind":"const","value":0.0}},
               "body":[{"kind":"assign","target":"speed","value":{"kind":"const","value":1.0}}]}
            ],"else_body":[]},
            {"kind":"return","value":{"kind":"call","name":"Motion","args":[
              {"kind":"load","path":"speed"},{"kind":"const","value":0.0}
            ]}}
          ]
        }"#;
        assert!(IrControllerRuntime::from_json(invalid, r#"{"X":1.0}"#).is_err());
    }

    #[test]
    fn standard_scalar_math_intrinsics_use_native_f64_operations() {
        fn unary(intrinsic: Intrinsic, input: f64) -> f64 {
            let mut stack = vec![Value::Scalar(input)];
            let mut rng = ScientificRng::for_domain(0, RNG_DOMAIN_CONTROLLER, 0).unwrap();
            execute_intrinsic(intrinsic, &mut stack, &mut rng);
            stack.pop().unwrap().scalar()
        }
        fn binary(intrinsic: Intrinsic, left: f64, right: f64) -> f64 {
            let mut stack = vec![Value::Scalar(left), Value::Scalar(right)];
            let mut rng = ScientificRng::for_domain(0, RNG_DOMAIN_CONTROLLER, 0).unwrap();
            execute_intrinsic(intrinsic, &mut stack, &mut rng);
            stack.pop().unwrap().scalar()
        }

        assert_eq!(unary(Intrinsic::Abs, -2.0), 2.0);
        assert_eq!(unary(Intrinsic::Sqrt, 4.0), 2.0);
        assert_eq!(unary(Intrinsic::Exp, 0.0), 1.0);
        assert_eq!(unary(Intrinsic::Log, 1.0), 0.0);
        assert_eq!(unary(Intrinsic::Sin, 0.0), 0.0);
        assert_eq!(unary(Intrinsic::Cos, 0.0), 1.0);
        assert_eq!(unary(Intrinsic::Tan, 0.0), 0.0);
        assert_eq!(unary(Intrinsic::Asin, 0.0), 0.0);
        assert_eq!(unary(Intrinsic::Acos, 1.0), 0.0);
        assert_eq!(unary(Intrinsic::Atan, 0.0), 0.0);
        assert!((binary(Intrinsic::Atan2, 1.0, 1.0) - std::f64::consts::FRAC_PI_4).abs() < 1e-12);
        assert_eq!(unary(Intrinsic::Floor, 1.9), 1.0);
        assert_eq!(unary(Intrinsic::Ceil, 1.1), 2.0);
        assert_eq!(binary(Intrinsic::Pow, 2.0, 3.0), 8.0);
        assert_eq!(binary(Intrinsic::Min, 2.0, 3.0), 2.0);
        assert_eq!(binary(Intrinsic::Max, 2.0, 3.0), 3.0);
    }

    #[test]
    #[should_panic(expected = "controller Motion requires finite scalar arguments")]
    fn non_finite_controller_action_fails_loudly() {
        let mut stack = vec![Value::Scalar(f64::NAN), Value::Scalar(0.0)];
        let mut rng = ScientificRng::for_domain(0, RNG_DOMAIN_CONTROLLER, 0).unwrap();
        execute_intrinsic(Intrinsic::Motion, &mut stack, &mut rng);
    }

    #[test]
    fn heterogeneous_private_state_initialization_is_per_agent_and_reproducible() {
        let ir = r#"{
          "schema":"vlab.controller-ir/0.1","language":"python-vlab/0.1","controller":"Roles","entry":"step",
          "parameters":{},"state":[{"name":"role","type":"scalar","initial":0.0}],
          "body":[
            {"kind":"return","value":{"kind":"call","name":"Motion","args":[
              {"kind":"load","path":"self.role"},{"kind":"const","value":0.0}
            ]}}
          ]
        }"#;
        let mut runtime = compile(ir, "{}");
        let mut profiles = vec![BTreeMap::new(), BTreeMap::new(), BTreeMap::new()];
        profiles[0].insert("role".to_owned(), 1.0);
        profiles[1].insert("role".to_owned(), 2.0);
        runtime.reset_with_private_state(3, &profiles).unwrap();

        let observation = Observation {
            heading: Vec2::new(1.0, 0.0),
            neighbours: vec![],
            environmental_scalar: None,
            references: BTreeMap::new(),
        };
        assert_eq!(runtime.step(0, &observation).forward, 1.0);
        assert_eq!(runtime.step(1, &observation).forward, 2.0);
        assert_eq!(runtime.step(2, &observation).forward, 0.0);

        runtime.reset_with_private_state(3, &profiles).unwrap();
        assert_eq!(runtime.step(0, &observation).forward, 1.0);
        assert_eq!(runtime.step(1, &observation).forward, 2.0);
        assert_eq!(runtime.step(2, &observation).forward, 0.0);
    }

    #[test]
    fn heterogeneous_private_state_rejects_undeclared_fields() {
        let ir = r#"{
          "schema":"vlab.controller-ir/0.1","language":"python-vlab/0.1","controller":"Roles","entry":"step",
          "parameters":{},"state":[{"name":"role","type":"scalar","initial":0.0}],
          "body":[
            {"kind":"return","value":{"kind":"call","name":"Motion","args":[
              {"kind":"load","path":"self.role"},{"kind":"const","value":0.0}
            ]}}
          ]
        }"#;
        let mut runtime = compile(ir, "{}");
        let mut profiles = vec![BTreeMap::new()];
        profiles[0].insert("unknown".to_owned(), 1.0);
        let error = runtime.reset_with_private_state(1, &profiles).unwrap_err();
        assert!(error.contains("undeclared controller private state 'unknown'"));
    }

    #[test]
    fn named_reference_observation_requires_availability_and_reads_relative_position() {
        let ir = r#"{
          "schema":"vlab.controller-ir/0.1","language":"python-vlab/0.1","controller":"Reference","entry":"step",
          "parameters":{},"references":["goal"],"state":[],
          "body":[
            {"kind":"if","branches":[{
              "condition":{"kind":"load","path":"obs.references.goal.available"},
              "body":[{"kind":"return","value":{"kind":"call","name":"Motion","args":[
                {"kind":"call","name":"norm","args":[{"kind":"load","path":"obs.references.goal.relative_position"}]},
                {"kind":"const","value":0.0}
              ]}}]
            }],"else_body":[{"kind":"return","value":{"kind":"call","name":"Motion","args":[
              {"kind":"const","value":0.0},{"kind":"const","value":0.0}
            ]}}]}
          ]
        }"#;
        let mut runtime = compile(ir, "{}");
        runtime.reset(1);

        let mut references = BTreeMap::new();
        references.insert("goal".to_owned(), Vec2::new(0.3, 0.4));
        let informed = Observation {
            heading: Vec2::new(1.0, 0.0),
            neighbours: vec![],
            environmental_scalar: None,
            references,
        };
        assert!((runtime.step(0, &informed).forward - 0.5).abs() < 1e-12);

        let uninformed = Observation {
            heading: Vec2::new(1.0, 0.0),
            neighbours: vec![],
            environmental_scalar: None,
            references: BTreeMap::new(),
        };
        assert_eq!(runtime.step(0, &uninformed).forward, 0.0);
    }

    fn stochastic_runtime() -> IrControllerRuntime {
        compile(
            r#"{
          "schema":"vlab.controller-ir/0.1","language":"python-vlab/0.1","controller":"Stochastic","entry":"step",
          "parameters":{},"state":[],
          "body":[
            {"kind":"if","branches":[
              {"condition":{"kind":"call","name":"rng.bernoulli","args":[{"kind":"const","value":0.5}]},
               "body":[{"kind":"return","value":{"kind":"call","name":"Motion","args":[
                 {"kind":"call","name":"rng.uniform","args":[{"kind":"const","value":0.0},{"kind":"const","value":1.0}]},
                 {"kind":"call","name":"rng.normal","args":[{"kind":"const","value":0.0},{"kind":"const","value":0.25}]}
               ]}}]}
            ],"else_body":[
              {"kind":"return","value":{"kind":"call","name":"Motion","args":[
                {"kind":"call","name":"rng.uniform","args":[{"kind":"const","value":0.0},{"kind":"const","value":1.0}]},
                {"kind":"call","name":"rng.normal","args":[{"kind":"const","value":0.0},{"kind":"const","value":0.25}]}
              ]}}
            ]}
          ]
        }"#,
            "{}",
        )
    }

    fn empty_observation() -> Observation {
        Observation {
            heading: Vec2::new(1.0, 0.0),
            neighbours: vec![],
            environmental_scalar: None,
            references: BTreeMap::new(),
        }
    }

    #[test]
    fn controller_stochasticity_replays_exactly_after_reset() {
        let mut runtime = stochastic_runtime();
        runtime.set_run_seed(2026);
        runtime.reset(2);
        let observation = empty_observation();
        let first = [
            runtime.step(0, &observation),
            runtime.step(1, &observation),
            runtime.step(0, &observation),
        ];
        runtime.reset(2);
        let replay = [
            runtime.step(0, &observation),
            runtime.step(1, &observation),
            runtime.step(0, &observation),
        ];
        assert_eq!(first, replay);
        assert!(first
            .iter()
            .all(|action| action.forward >= 0.0 && action.forward < 1.0));
        assert!(first.iter().all(|action| action.turning.is_finite()));
    }

    #[test]
    fn controller_stochastic_streams_are_independent_per_agent() {
        let observation = empty_observation();

        let mut extra_agent_zero_draws = stochastic_runtime();
        extra_agent_zero_draws.set_run_seed(2026);
        extra_agent_zero_draws.reset(2);
        for _ in 0..100 {
            let _ = extra_agent_zero_draws.step(0, &observation);
        }
        let agent_one_after = extra_agent_zero_draws.step(1, &observation);

        let mut untouched_agent_one = stochastic_runtime();
        untouched_agent_one.set_run_seed(2026);
        untouched_agent_one.reset(2);
        let agent_one_first = untouched_agent_one.step(1, &observation);

        assert_eq!(agent_one_after, agent_one_first);
    }

    #[test]
    fn controller_stochasticity_is_seeded_by_the_run_seed() {
        let observation = empty_observation();
        let mut a = stochastic_runtime();
        a.set_run_seed(2026);
        a.reset(1);
        let first = a.step(0, &observation);

        let mut b = stochastic_runtime();
        b.set_run_seed(2027);
        b.reset(1);
        let second = b.step(0, &observation);

        assert_ne!(first, second);
    }

    #[test]
    fn bernoulli_endpoint_probabilities_are_deterministic_and_still_consume_draws() {
        let mut zero = ScientificRng::for_domain(2026, RNG_DOMAIN_CONTROLLER, 0).unwrap();
        let mut one = ScientificRng::for_domain(2026, RNG_DOMAIN_CONTROLLER, 0).unwrap();

        let mut zero_stack = vec![Value::Scalar(0.0)];
        execute_intrinsic(Intrinsic::RngBernoulli, &mut zero_stack, &mut zero);
        assert!(!zero_stack.pop().unwrap().boolean());

        let mut one_stack = vec![Value::Scalar(1.0)];
        execute_intrinsic(Intrinsic::RngBernoulli, &mut one_stack, &mut one);
        assert!(one_stack.pop().unwrap().boolean());

        assert_eq!(zero.next_u64(), one.next_u64());
    }
}
