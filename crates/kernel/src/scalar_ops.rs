//! Scalar operators shared by every authoring language (#577).
//!
//! Floor division and remainder follow the authoring languages' Python
//! semantics and match Initialization's JavaScript evaluator exactly:
//! `a // b = floor(a / b)` and `a % b = ((a % b) + b) % b` (the remainder takes
//! the sign of the divisor), where the inner `%` is the IEEE fmod that both
//! Rust's `f64 %` and JavaScript's `%` compute.

pub(crate) fn floor_divide(a: f64, b: f64) -> f64 {
    (a / b).floor()
}

pub(crate) fn modulo(a: f64, b: f64) -> f64 {
    ((a % b) + b) % b
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn floor_division_and_remainder_follow_python() {
        assert_eq!(floor_divide(7.0, 2.0), 3.0);
        assert_eq!(floor_divide(-7.0, 2.0), -4.0);
        assert_eq!(floor_divide(7.5, -2.0), -4.0);
        assert_eq!(modulo(7.0, 3.0), 1.0);
        assert_eq!(modulo(-7.0, 3.0), 2.0);
        assert_eq!(modulo(7.0, -3.0), -2.0);
        assert_eq!(modulo(5.5, 2.0), 1.5);
        assert!(floor_divide(1.0, 0.0).is_infinite());
        assert!(modulo(1.0, 0.0).is_nan());
    }
}
