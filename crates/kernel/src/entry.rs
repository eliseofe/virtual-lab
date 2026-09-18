mod metrics_ir;
pub use metrics_ir::MetricProbeSimulation;

include!("lib.rs");
mod portable;
pub use portable::PortableRuntime;
