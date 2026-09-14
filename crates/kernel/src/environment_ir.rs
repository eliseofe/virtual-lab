use serde::Deserialize;

use crate::Vec2;

#[derive(Debug, Deserialize)]
struct EnvironmentIr {
    schema: String,
    language: String,
    entry: String,
    expression: Expression,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum Expression {
    Const { value: f64 },
    X,
    Y,
    Unary { op: String, value: Box<Expression> },
    Binary { op: String, left: Box<Expression>, right: Box<Expression> },
    Call { name: String, args: Vec<Expression> },
}

fn validate_expression(expression: &Expression) -> Result<(), String> {
    match expression {
        Expression::Const { value } => {
            if !value.is_finite() {
                return Err("environment scalar constants must be finite".to_owned());
            }
        }
        Expression::X | Expression::Y => {}
        Expression::Unary { op, value } => {
            if op != "-" {
                return Err(format!("unsupported environment unary operator '{op}'"));
            }
            validate_expression(value)?;
        }
        Expression::Binary { op, left, right } => {
            if !matches!(op.as_str(), "+" | "-" | "*" | "/") {
                return Err(format!("unsupported environment binary operator '{op}'"));
            }
            validate_expression(left)?;
            validate_expression(right)?;
        }
        Expression::Call { name, args } => {
            let arity = match name.as_str() {
                "sqrt" | "abs" | "sin" | "cos" | "exp" => 1,
                "pow" | "min" | "max" => 2,
                _ => return Err(format!("unsupported environment intrinsic '{name}'")),
            };
            if args.len() != arity {
                return Err(format!("environment intrinsic '{name}' expects {arity} arguments"));
            }
            for arg in args {
                validate_expression(arg)?;
            }
        }
    }
    Ok(())
}

fn evaluate(expression: &Expression, position: Vec2) -> f64 {
    match expression {
        Expression::Const { value } => *value,
        Expression::X => position.x,
        Expression::Y => position.y,
        Expression::Unary { op, value } => match op.as_str() {
            "-" => -evaluate(value, position),
            _ => unreachable!("validated environment unary operator"),
        },
        Expression::Binary { op, left, right } => {
            let left = evaluate(left, position);
            let right = evaluate(right, position);
            match op.as_str() {
                "+" => left + right,
                "-" => left - right,
                "*" => left * right,
                "/" => left / right,
                _ => unreachable!("validated environment binary operator"),
            }
        }
        Expression::Call { name, args } => {
            let first = evaluate(&args[0], position);
            match name.as_str() {
                "sqrt" => first.sqrt(),
                "abs" => first.abs(),
                "sin" => first.sin(),
                "cos" => first.cos(),
                "exp" => first.exp(),
                "pow" => first.powf(evaluate(&args[1], position)),
                "min" => first.min(evaluate(&args[1], position)),
                "max" => first.max(evaluate(&args[1], position)),
                _ => unreachable!("validated environment intrinsic"),
            }
        }
    }
}

#[derive(Debug)]
pub struct EnvironmentRuntime {
    expression: Option<Expression>,
}

impl Default for EnvironmentRuntime {
    fn default() -> Self {
        Self { expression: None }
    }
}

impl EnvironmentRuntime {
    pub fn from_json(json: &str) -> Result<Self, String> {
        let parsed: Option<EnvironmentIr> = serde_json::from_str(json)
            .map_err(|error| format!("invalid environment IR JSON: {error}"))?;
        let Some(ir) = parsed else {
            return Ok(Self::default());
        };
        if ir.schema != "vlab.environment-scalar-ir/0.1" {
            return Err(format!("unsupported environment IR schema '{}'", ir.schema));
        }
        if ir.language != "python-vlab/0.1" {
            return Err(format!("unsupported environment language '{}'", ir.language));
        }
        if ir.entry != "environmental_scalar(x, y, config)" {
            return Err("environment IR entry must be environmental_scalar(x, y, config)".to_owned());
        }
        validate_expression(&ir.expression)?;
        Ok(Self { expression: Some(ir.expression) })
    }

    pub fn has_scalar(&self) -> bool {
        self.expression.is_some()
    }

    pub fn sample(&self, position: Vec2) -> Option<f64> {
        let value = evaluate(self.expression.as_ref()?, position);
        assert!(value.is_finite(), "environmental_scalar evaluated to a non-finite value");
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
    fn unsupported_environment_intrinsic_is_rejected_before_run() {
        let json = r#"{
          "schema":"vlab.environment-scalar-ir/0.1",
          "language":"python-vlab/0.1",
          "entry":"environmental_scalar(x, y, config)",
          "expression":{"kind":"call","name":"random","args":[{"kind":"x"}]}
        }"#;
        assert!(EnvironmentRuntime::from_json(json).is_err());
    }
}
