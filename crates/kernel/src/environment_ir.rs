use serde::Deserialize;

use crate::Vec2;

#[derive(Debug, Deserialize)]
struct EnvironmentIr {
    schema: String,
    language: String,
    entry: String,
    // vlab.environment-scalar-ir/0.1: one return expression.
    #[serde(default)]
    expression: Option<Expression>,
    // vlab.environment-scalar-ir/0.2 (#577): locals, += and if/elif/else.
    #[serde(default)]
    body: Option<Vec<Statement>>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum Expression {
    Const {
        value: f64,
    },
    BoolConst {
        value: bool,
    },
    X,
    Y,
    Local {
        name: String,
    },
    Unary {
        op: String,
        value: Box<Expression>,
    },
    Not {
        value: Box<Expression>,
    },
    Binary {
        op: String,
        left: Box<Expression>,
        right: Box<Expression>,
    },
    Compare {
        op: String,
        left: Box<Expression>,
        right: Box<Expression>,
    },
    BoolOp {
        op: String,
        left: Box<Expression>,
        right: Box<Expression>,
    },
    Call {
        name: String,
        args: Vec<Expression>,
    },
}

#[derive(Debug, Deserialize)]
struct Branch {
    condition: Expression,
    body: Vec<Statement>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum Statement {
    Assign {
        target: String,
        value: Expression,
    },
    AugAssign {
        target: String,
        value: Expression,
    },
    If {
        branches: Vec<Branch>,
        #[serde(default)]
        else_body: Vec<Statement>,
    },
    Return {
        value: Expression,
    },
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Kind {
    Scalar,
    Bool,
}

#[derive(Debug, Clone, Copy)]
enum Value {
    Scalar(f64),
    Bool(bool),
}

impl Value {
    fn scalar(self) -> f64 {
        match self {
            Value::Scalar(value) => value,
            Value::Bool(_) => unreachable!("validated environment scalar"),
        }
    }
    fn boolean(self) -> bool {
        match self {
            Value::Bool(value) => value,
            Value::Scalar(_) => unreachable!("validated environment boolean"),
        }
    }
}

type Locals = Vec<(String, Kind)>;

fn local_kind(locals: &Locals, name: &str) -> Option<Kind> {
    locals
        .iter()
        .rev()
        .find(|(local, _)| local == name)
        .map(|(_, kind)| *kind)
}

fn expect_kind(found: Kind, expected: Kind, what: &str) -> Result<(), String> {
    if found == expected {
        Ok(())
    } else {
        Err(format!("environment {what} has the wrong type"))
    }
}

fn validate_expression(expression: &Expression, locals: &Locals) -> Result<Kind, String> {
    match expression {
        Expression::Const { value } => {
            if !value.is_finite() {
                return Err("environment scalar constants must be finite".to_owned());
            }
            Ok(Kind::Scalar)
        }
        Expression::BoolConst { .. } => Ok(Kind::Bool),
        Expression::X | Expression::Y => Ok(Kind::Scalar),
        Expression::Local { name } => local_kind(locals, name)
            .ok_or_else(|| format!("environment local '{name}' is used before it is assigned")),
        Expression::Unary { op, value } => {
            if op != "-" {
                return Err(format!("unsupported environment unary operator '{op}'"));
            }
            expect_kind(
                validate_expression(value, locals)?,
                Kind::Scalar,
                "unary operand",
            )?;
            Ok(Kind::Scalar)
        }
        Expression::Not { value } => {
            expect_kind(
                validate_expression(value, locals)?,
                Kind::Bool,
                "'not' operand",
            )?;
            Ok(Kind::Bool)
        }
        Expression::Binary { op, left, right } => {
            if !matches!(op.as_str(), "+" | "-" | "*" | "/" | "//" | "%") {
                return Err(format!("unsupported environment binary operator '{op}'"));
            }
            expect_kind(validate_expression(left, locals)?, Kind::Scalar, "operand")?;
            expect_kind(validate_expression(right, locals)?, Kind::Scalar, "operand")?;
            Ok(Kind::Scalar)
        }
        Expression::Compare { op, left, right } => {
            if !matches!(op.as_str(), "<" | "<=" | ">" | ">=" | "==" | "!=") {
                return Err(format!("unsupported environment comparison '{op}'"));
            }
            expect_kind(
                validate_expression(left, locals)?,
                Kind::Scalar,
                "comparison operand",
            )?;
            expect_kind(
                validate_expression(right, locals)?,
                Kind::Scalar,
                "comparison operand",
            )?;
            Ok(Kind::Bool)
        }
        Expression::BoolOp { op, left, right } => {
            if !matches!(op.as_str(), "and" | "or") {
                return Err(format!("unsupported environment boolean operator '{op}'"));
            }
            expect_kind(
                validate_expression(left, locals)?,
                Kind::Bool,
                "boolean operand",
            )?;
            expect_kind(
                validate_expression(right, locals)?,
                Kind::Bool,
                "boolean operand",
            )?;
            Ok(Kind::Bool)
        }
        Expression::Call { name, args } => {
            let arity = match name.as_str() {
                "abs" | "sqrt" | "exp" | "log" | "sin" | "cos" | "tan" | "asin" | "acos"
                | "atan" | "floor" | "ceil" => 1,
                "atan2" | "pow" | "min" | "max" => 2,
                _ => return Err(format!("unsupported environment intrinsic '{name}'")),
            };
            if args.len() != arity {
                return Err(format!(
                    "environment intrinsic '{name}' expects {arity} arguments"
                ));
            }
            for arg in args {
                expect_kind(
                    validate_expression(arg, locals)?,
                    Kind::Scalar,
                    "intrinsic argument",
                )?;
            }
            Ok(Kind::Scalar)
        }
    }
}

/// Checks types and definite assignment; returns the locals assigned on every
/// continuing path, or None when every path has returned.
fn validate_block(body: &[Statement], locals: &Locals) -> Result<Option<Locals>, String> {
    let mut current = locals.clone();
    for (index, statement) in body.iter().enumerate() {
        match statement {
            Statement::Assign { target, value } => {
                let kind = validate_expression(value, &current)?;
                if let Some(previous) = local_kind(&current, target) {
                    expect_kind(kind, previous, "assignment")?;
                } else {
                    current.push((target.clone(), kind));
                }
            }
            Statement::AugAssign { target, value } => {
                if local_kind(&current, target) != Some(Kind::Scalar) {
                    return Err(format!(
                        "environment local '{target}' must be a number before '+='"
                    ));
                }
                expect_kind(
                    validate_expression(value, &current)?,
                    Kind::Scalar,
                    "'+=' value",
                )?;
            }
            Statement::Return { value } => {
                expect_kind(
                    validate_expression(value, &current)?,
                    Kind::Scalar,
                    "return value",
                )?;
                if index + 1 != body.len() {
                    return Err("environment statement after return is never reached".to_owned());
                }
                return Ok(None);
            }
            Statement::If {
                branches,
                else_body,
            } => {
                let mut continuing = Vec::new();
                for branch in branches {
                    expect_kind(
                        validate_expression(&branch.condition, &current)?,
                        Kind::Bool,
                        "condition",
                    )?;
                    if let Some(after) = validate_block(&branch.body, &current)? {
                        continuing.push(after);
                    }
                }
                if let Some(after) = validate_block(else_body, &current)? {
                    continuing.push(after);
                }
                if continuing.is_empty() {
                    if index + 1 != body.len() {
                        return Err(
                            "environment statement after return is never reached".to_owned()
                        );
                    }
                    return Ok(None);
                }
                let first = continuing[0].clone();
                current = first
                    .into_iter()
                    .filter(|(name, kind)| {
                        continuing
                            .iter()
                            .all(|after| local_kind(after, name) == Some(*kind))
                    })
                    .collect();
            }
        }
    }
    Ok(Some(current))
}

fn lookup(locals: &[(String, Value)], name: &str) -> Value {
    locals
        .iter()
        .rev()
        .find(|(local, _)| local == name)
        .map(|(_, value)| *value)
        .expect("validated environment local")
}

fn evaluate(expression: &Expression, position: Vec2, locals: &[(String, Value)]) -> Value {
    let scalar = |expression: &Expression| evaluate(expression, position, locals).scalar();
    match expression {
        Expression::Const { value } => Value::Scalar(*value),
        Expression::BoolConst { value } => Value::Bool(*value),
        Expression::X => Value::Scalar(position.x),
        Expression::Y => Value::Scalar(position.y),
        Expression::Local { name } => lookup(locals, name),
        Expression::Unary { value, .. } => Value::Scalar(-scalar(value)),
        Expression::Not { value } => Value::Bool(!evaluate(value, position, locals).boolean()),
        Expression::Binary { op, left, right } => {
            let left = scalar(left);
            let right = scalar(right);
            Value::Scalar(match op.as_str() {
                "+" => left + right,
                "-" => left - right,
                "*" => left * right,
                "/" => left / right,
                "//" => crate::scalar_ops::floor_divide(left, right),
                "%" => crate::scalar_ops::modulo(left, right),
                _ => unreachable!("validated environment binary operator"),
            })
        }
        Expression::Compare { op, left, right } => {
            let left = scalar(left);
            let right = scalar(right);
            Value::Bool(match op.as_str() {
                "<" => left < right,
                "<=" => left <= right,
                ">" => left > right,
                ">=" => left >= right,
                "==" => left == right,
                "!=" => left != right,
                _ => unreachable!("validated environment comparison"),
            })
        }
        Expression::BoolOp { op, left, right } => {
            // Both sides are always evaluated, as in every Lab language (#577).
            let left = evaluate(left, position, locals).boolean();
            let right = evaluate(right, position, locals).boolean();
            Value::Bool(if op == "and" {
                left && right
            } else {
                left || right
            })
        }
        Expression::Call { name, args } => {
            let first = scalar(&args[0]);
            Value::Scalar(match name.as_str() {
                "abs" => first.abs(),
                "sqrt" => first.sqrt(),
                "exp" => first.exp(),
                "log" => first.ln(),
                "sin" => first.sin(),
                "cos" => first.cos(),
                "tan" => first.tan(),
                "asin" => first.asin(),
                "acos" => first.acos(),
                "atan" => first.atan(),
                "atan2" => first.atan2(scalar(&args[1])),
                "floor" => first.floor(),
                "ceil" => first.ceil(),
                "pow" => first.powf(scalar(&args[1])),
                "min" => first.min(scalar(&args[1])),
                "max" => first.max(scalar(&args[1])),
                _ => unreachable!("validated environment intrinsic"),
            })
        }
    }
}

fn run(body: &[Statement], position: Vec2, locals: &mut Vec<(String, Value)>) -> Option<f64> {
    for statement in body {
        match statement {
            Statement::Assign { target, value } => {
                let value = evaluate(value, position, locals);
                match locals.iter_mut().rev().find(|(name, _)| name == target) {
                    Some(slot) => slot.1 = value,
                    None => locals.push((target.clone(), value)),
                }
            }
            Statement::AugAssign { target, value } => {
                let increment = evaluate(value, position, locals).scalar();
                let slot = locals
                    .iter_mut()
                    .rev()
                    .find(|(name, _)| name == target)
                    .expect("validated environment local");
                slot.1 = Value::Scalar(slot.1.scalar() + increment);
            }
            Statement::Return { value } => return Some(evaluate(value, position, locals).scalar()),
            Statement::If {
                branches,
                else_body,
            } => {
                let chosen = branches
                    .iter()
                    .find(|branch| evaluate(&branch.condition, position, locals).boolean())
                    .map_or(else_body.as_slice(), |branch| branch.body.as_slice());
                if let Some(value) = run(chosen, position, locals) {
                    return Some(value);
                }
            }
        }
    }
    None
}

#[derive(Debug, Default)]
pub struct EnvironmentRuntime {
    body: Option<Vec<Statement>>,
}

impl EnvironmentRuntime {
    pub fn from_json(json: &str) -> Result<Self, String> {
        let parsed: Option<EnvironmentIr> = serde_json::from_str(json)
            .map_err(|error| format!("invalid environment IR JSON: {error}"))?;
        let Some(ir) = parsed else {
            return Ok(Self::default());
        };
        let body = match (ir.schema.as_str(), ir.expression, ir.body) {
            ("vlab.environment-scalar-ir/0.1", Some(expression), None) => {
                vec![Statement::Return { value: expression }]
            }
            ("vlab.environment-scalar-ir/0.2", None, Some(body)) => body,
            ("vlab.environment-scalar-ir/0.1" | "vlab.environment-scalar-ir/0.2", _, _) => {
                return Err(
                    "environment IR must carry an expression (0.1) or a body (0.2)".to_owned(),
                )
            }
            (schema, _, _) => return Err(format!("unsupported environment IR schema '{schema}'")),
        };
        if ir.language != "python-vlab/0.1" {
            return Err(format!(
                "unsupported environment language '{}'",
                ir.language
            ));
        }
        if ir.entry != "environmental_scalar(x, y, config)" {
            return Err(
                "environment IR entry must be environmental_scalar(x, y, config)".to_owned(),
            );
        }
        if validate_block(&body, &Vec::new())?.is_some() {
            return Err("environmental_scalar must return a number on every path".to_owned());
        }
        Ok(Self { body: Some(body) })
    }

    pub fn has_scalar(&self) -> bool {
        self.body.is_some()
    }

    pub fn sample(&self, position: Vec2) -> Option<f64> {
        let mut locals = Vec::new();
        let value = run(self.body.as_ref()?, position, &mut locals)
            .expect("validated environment body returns on every path");
        assert!(
            value.is_finite(),
            "environmental_scalar evaluated to a non-finite value"
        );
        Some(value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn absent_environment_is_explicitly_none() {
        let runtime = EnvironmentRuntime::from_json("null").unwrap();
        assert!(!runtime.has_scalar());
        assert_eq!(runtime.sample(Vec2::new(1.0, 2.0)), None);
    }

    #[test]
    fn scalar_environment_uses_position_and_compiled_constants() {
        let json = r#"{
          "schema":"vlab.environment-scalar-ir/0.1",
          "language":"python-vlab/0.1",
          "entry":"environmental_scalar(x, y, config)",
          "expression":{"kind":"binary","op":"+",
            "left":{"kind":"binary","op":"*","left":{"kind":"const","value":2.0},"right":{"kind":"x"}},
            "right":{"kind":"y"}}
        }"#;
        let runtime = EnvironmentRuntime::from_json(json).unwrap();
        assert!(runtime.has_scalar());
        assert_eq!(runtime.sample(Vec2::new(3.0, 4.0)), Some(10.0));
    }

    #[test]
    fn statements_bind_locals_branch_and_return_on_every_path() {
        // d2 = x*x + y*y; if d2 < 1: return 1.0 elif x > 0 and not (y > 0): v = 0.5 else: v = 0.0; v += 0.1; return v
        let json = r#"{
          "schema":"vlab.environment-scalar-ir/0.2",
          "language":"python-vlab/0.1",
          "entry":"environmental_scalar(x, y, config)",
          "body":[
            {"kind":"assign","target":"d2","value":{"kind":"binary","op":"+",
              "left":{"kind":"binary","op":"*","left":{"kind":"x"},"right":{"kind":"x"}},
              "right":{"kind":"binary","op":"*","left":{"kind":"y"},"right":{"kind":"y"}}}},
            {"kind":"if","branches":[
              {"condition":{"kind":"compare","op":"<","left":{"kind":"local","name":"d2"},"right":{"kind":"const","value":1.0}},
               "body":[{"kind":"return","value":{"kind":"const","value":1.0}}]},
              {"condition":{"kind":"bool_op","op":"and",
                 "left":{"kind":"compare","op":">","left":{"kind":"x"},"right":{"kind":"const","value":0.0}},
                 "right":{"kind":"not","value":{"kind":"compare","op":">","left":{"kind":"y"},"right":{"kind":"const","value":0.0}}}},
               "body":[{"kind":"assign","target":"v","value":{"kind":"const","value":0.5}}]}],
             "else_body":[{"kind":"assign","target":"v","value":{"kind":"const","value":0.0}}]},
            {"kind":"aug_assign","target":"v","op":"+","value":{"kind":"const","value":0.25}},
            {"kind":"return","value":{"kind":"local","name":"v"}}
          ]
        }"#;
        let runtime = EnvironmentRuntime::from_json(json).unwrap();
        assert_eq!(runtime.sample(Vec2::new(0.5, 0.5)), Some(1.0));
        assert_eq!(runtime.sample(Vec2::new(3.0, -1.0)), Some(0.75));
        assert_eq!(runtime.sample(Vec2::new(-3.0, 1.0)), Some(0.25));

        let no_return = json.replace(
            r#",
            {"kind":"return","value":{"kind":"local","name":"v"}}"#,
            "",
        );
        assert!(EnvironmentRuntime::from_json(&no_return)
            .unwrap_err()
            .contains("must return a number on every path"));
        let unassigned = json.replace(
            r#""else_body":[{"kind":"assign","target":"v","value":{"kind":"const","value":0.0}}]"#,
            r#""else_body":[]"#,
        );
        assert!(EnvironmentRuntime::from_json(&unassigned)
            .unwrap_err()
            .contains("before '+='"));
        let bool_condition = json.replace(r#"{"kind":"compare","op":"<","left":{"kind":"local","name":"d2"},"right":{"kind":"const","value":1.0}}"#, r#"{"kind":"local","name":"d2"}"#);
        assert!(EnvironmentRuntime::from_json(&bool_condition)
            .unwrap_err()
            .contains("condition has the wrong type"));
    }

    #[test]
    fn unsupported_environment_intrinsic_is_rejected_before_run() {
        let json = r#"{
          "schema":"vlab.environment-scalar-ir/0.1",
          "language":"python-vlab/0.1",
          "entry":"environmental_scalar(x, y, config)",
          "expression":{"kind":"call","name":"random","args":[{"kind":"x"}]}
        }"#;
        assert!(EnvironmentRuntime::from_json(json).is_err());
    }
    #[test]
    fn standard_scalar_math_intrinsics_match_native_f64_operations() {
        fn scalar_call(name: &str, args: &[f64]) -> f64 {
            let expression = Expression::Call {
                name: name.to_owned(),
                args: args
                    .iter()
                    .map(|value| Expression::Const { value: *value })
                    .collect(),
            };
            evaluate(&expression, Vec2::ZERO, &[]).scalar()
        }

        assert_eq!(scalar_call("abs", &[-2.0]), 2.0);
        assert_eq!(scalar_call("sqrt", &[4.0]), 2.0);
        assert_eq!(scalar_call("exp", &[0.0]), 1.0);
        assert_eq!(scalar_call("log", &[1.0]), 0.0);
        assert_eq!(scalar_call("sin", &[0.0]), 0.0);
        assert_eq!(scalar_call("cos", &[0.0]), 1.0);
        assert_eq!(scalar_call("tan", &[0.0]), 0.0);
        assert_eq!(scalar_call("asin", &[0.0]), 0.0);
        assert_eq!(scalar_call("acos", &[1.0]), 0.0);
        assert_eq!(scalar_call("atan", &[0.0]), 0.0);
        assert!((scalar_call("atan2", &[1.0, 1.0]) - std::f64::consts::FRAC_PI_4).abs() < 1e-12);
        assert_eq!(scalar_call("floor", &[1.9]), 1.0);
        assert_eq!(scalar_call("ceil", &[1.1]), 2.0);
        assert_eq!(scalar_call("pow", &[2.0, 3.0]), 8.0);
        assert_eq!(scalar_call("min", &[2.0, 3.0]), 2.0);
        assert_eq!(scalar_call("max", &[2.0, 3.0]), 3.0);
    }
}
