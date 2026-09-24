//! Behaviour-preservation reference runs (#425).
//!
//! Replays the simulator input recorded by `web/scripts/reference-runs.mjs`
//! (the exact arguments the browser worker passes to `MetricProbeSimulation`)
//! and compares final agent state, clocks and every metric sample bit-for-bit
//! with the recorded expectation in `tests/reference/`.
//!
//! Each Experiment is also replayed with a different advance chunking; the
//! scientific result must not depend on how the worker batches ticks.
//!
//! Regenerate expectations only for an intended scientific change:
//! `VLAB_UPDATE_REFERENCE=1 cargo test -p vlab-kernel --test reference_runs`

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{json, Value};
use vlab_kernel::MetricProbeSimulation;

const CHUNKINGS: [u32; 2] = [100, 7];

fn input_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../web/tests/fixtures/reference")
}

fn expected_dir() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/reference")
}

fn text<'a>(input: &'a Value, key: &str) -> &'a str {
    input[key]
        .as_str()
        .unwrap_or_else(|| panic!("reference input missing string '{key}'"))
}

fn bits(input: &Value, key: &str) -> f64 {
    let raw = text(input, &format!("{key}_bits"));
    let hex = raw
        .strip_prefix("0x")
        .unwrap_or_else(|| panic!("'{key}_bits' must start with 0x"));
    f64::from_bits(
        u64::from_str_radix(hex, 16).unwrap_or_else(|_| panic!("'{key}_bits' is not hex")),
    )
}

fn hex(value: f64) -> String {
    format!("0x{:016x}", value.to_bits())
}

/// Metric samples are kept as the kernel's own JSON text so that comparison is
/// exact without re-parsing floating-point numbers.
fn drain_samples(simulation: &mut MetricProbeSimulation, out: &mut Vec<String>) {
    let batch = simulation
        .drain_metric_samples_json(u32::MAX)
        .unwrap_or_else(|_| panic!("metric drain failed"));
    let start = batch.find("\"samples\":[").expect("batch has samples") + "\"samples\":[".len();
    let end = batch[start..]
        .find("],\"buffer\"")
        .expect("batch has buffer")
        + start;
    let samples = &batch[start..end];
    if samples.is_empty() {
        return;
    }
    let trimmed = samples
        .strip_prefix('{')
        .and_then(|s| s.strip_suffix('}'))
        .expect("sample objects");
    out.extend(trimmed.split("},{").map(|sample| format!("{{{sample}}}")));
}

fn run(input: &Value, ticks: u32, chunk: u32) -> Value {
    let kernel = &input["kernel_input"];
    let mut simulation = MetricProbeSimulation::new(
        text(kernel, "initial_state_json"),
        text(kernel, "world_references_json"),
        kernel["seed"].as_u64().expect("seed") as u32,
        bits(kernel, "physics_dt"),
        bits(kernel, "control_dt"),
        bits(kernel, "metric_dt"),
        bits(kernel, "interaction_radius"),
        bits(kernel, "arena_size"),
        bits(kernel, "sensor_noise"),
        bits(kernel, "max_forward_speed"),
        bits(kernel, "max_angular_speed"),
        text(kernel, "environment_ir_json"),
        text(kernel, "controller_ir_json"),
        text(kernel, "metrics_ir_json"),
        text(kernel, "parameters_json"),
    )
    .unwrap_or_else(|_| panic!("reference simulation could not be constructed"));

    let mut samples = Vec::new();
    let mut remaining = ticks;
    while remaining > 0 {
        let step = remaining.min(chunk);
        simulation
            .advance_ticks(step)
            .unwrap_or_else(|_| panic!("advance failed"));
        drain_samples(&mut simulation, &mut samples);
        remaining -= step;
    }
    simulation
        .finalize_metrics()
        .unwrap_or_else(|_| panic!("finalize failed"));
    drain_samples(&mut simulation, &mut samples);

    json!({
        "physics_ticks": simulation.physics_ticks(),
        "control_updates": simulation.control_updates(),
        "scientific_time_bits": hex(simulation.scientific_time()),
        "neighbour_strategy": simulation.neighbour_strategy(),
        "final_state_bits": simulation.snapshot_state().into_iter().map(hex).collect::<Vec<_>>(),
        "metric_samples": samples,
    })
}

#[test]
fn reference_runs_are_bit_identical() {
    let update = std::env::var("VLAB_UPDATE_REFERENCE").is_ok_and(|value| value == "1");
    let mut inputs: Vec<PathBuf> = fs::read_dir(input_dir())
        .expect("reference inputs exist; run node web/scripts/reference-runs.mjs --update")
        .map(|entry| entry.expect("readable entry").path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "json"))
        .collect();
    inputs.sort();
    assert!(!inputs.is_empty(), "no reference inputs found");

    let mut failures = Vec::new();
    for path in &inputs {
        let input: Value = serde_json::from_str(&fs::read_to_string(path).expect("readable input"))
            .expect("reference input is JSON");
        let id = input["id"].as_str().expect("reference id").to_owned();
        let ticks = input["ticks"].as_u64().expect("reference ticks") as u32;

        let outputs: Vec<Value> = CHUNKINGS
            .iter()
            .map(|&chunk| run(&input, ticks, chunk))
            .collect();
        if outputs.windows(2).any(|pair| pair[0] != pair[1]) {
            failures.push(format!("{id}: result depends on advance chunking"));
            continue;
        }
        let actual = format!(
            "{}\n",
            serde_json::to_string_pretty(&outputs[0]).expect("serializable")
        );
        let expected_path = expected_dir().join(format!("{id}.expected.json"));

        if update {
            fs::create_dir_all(expected_dir()).expect("expected dir");
            fs::write(&expected_path, &actual).expect("write expectation");
            continue;
        }
        match fs::read_to_string(&expected_path) {
            Ok(expected) if expected == actual => {}
            Ok(_) => failures.push(format!(
                "{id}: trajectory or metric samples differ from the recorded reference"
            )),
            Err(_) => failures.push(format!(
                "{id}: no recorded expectation at {}",
                expected_path.display()
            )),
        }
    }
    assert!(
        failures.is_empty(),
        "reference runs failed:\n  {}",
        failures.join("\n  ")
    );
}
