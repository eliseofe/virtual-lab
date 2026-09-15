mod faithful_argos_rab;

use std::hint::black_box;
use std::time::Instant;

use faithful_argos_rab::{brute_force_rab_routes, FaithfulArgosRabGrid, RabRouteStats};
use serde::Deserialize;
use vlab_kernel::{AgentPhysicalState, Vec2};

const MATRIX_JSON: &str = include_str!("../../../benchmarks/neighbour_search_matrix.json");

#[derive(Debug, Deserialize)]
struct Matrix {
    version: u32,
    ci_smoke_scenarios: Vec<Scenario>,
}

#[derive(Debug, Deserialize)]
struct Scenario {
    id: String,
    agents: usize,
    arena_size: f64,
    radii: Vec<f64>,
    distribution: Distribution,
}

#[derive(Debug, Deserialize, Clone, Copy)]
#[serde(tag = "kind", rename_all = "kebab-case")]
enum Distribution {
    UniformGrid,
    Clustered {
        cluster_fraction: f64,
        cluster_span_fraction: f64,
    },
    BoundaryBands {
        band_offset_fraction: f64,
    },
}

fn median_ms(repetitions: usize, mut f: impl FnMut()) -> f64 {
    let mut samples = Vec::with_capacity(repetitions);
    for _ in 0..repetitions {
        let started = Instant::now();
        f();
        samples.push(started.elapsed().as_secs_f64() * 1000.0);
    }
    samples.sort_by(|a, b| a.partial_cmp(b).expect("finite benchmark timing"));
    samples[samples.len() / 2]
}

fn uniform_grid(count: usize, arena: f64) -> Vec<AgentPhysicalState> {
    let side = (count.max(1) as f64).sqrt().ceil() as usize;
    let spacing = arena / side as f64;
    let half = arena / 2.0;
    (0..count)
        .map(|i| AgentPhysicalState {
            position: Vec2::new(
                -half + ((i % side) as f64 + 0.5) * spacing,
                -half + ((i / side) as f64 + 0.5) * spacing,
            ),
            heading_angle: (i % 64) as f64 * 0.03125,
        })
        .collect()
}

fn clustered(
    count: usize,
    arena: f64,
    cluster_fraction: f64,
    cluster_span_fraction: f64,
) -> Vec<AgentPhysicalState> {
    let clustered_count = ((count as f64) * cluster_fraction).round() as usize;
    let spread_count = count.saturating_sub(clustered_count);
    let cluster_span = arena * cluster_span_fraction;
    let cluster_side = (clustered_count.max(1) as f64).sqrt().ceil() as usize;
    let cluster_spacing = cluster_span / cluster_side as f64;
    let cluster_center = -arena * 0.2;
    let cluster_min = cluster_center - cluster_span / 2.0;

    let mut state = Vec::with_capacity(count);
    for i in 0..clustered_count {
        state.push(AgentPhysicalState {
            position: Vec2::new(
                cluster_min + ((i % cluster_side) as f64 + 0.5) * cluster_spacing,
                cluster_min + ((i / cluster_side) as f64 + 0.5) * cluster_spacing,
            ),
            heading_angle: (i % 64) as f64 * 0.03125,
        });
    }

    for (j, mut agent) in uniform_grid(spread_count, arena).into_iter().enumerate() {
        agent.heading_angle = ((clustered_count + j) % 64) as f64 * 0.03125;
        state.push(agent);
    }
    state
}

fn boundary_bands(count: usize, arena: f64, band_offset_fraction: f64) -> Vec<AgentPhysicalState> {
    let half = arena / 2.0;
    let offset = arena * band_offset_fraction;
    let per_side = ((count + 3) / 4).max(1);
    let spacing = arena / per_side as f64;

    (0..count)
        .map(|i| {
            let side = i % 4;
            let slot = i / 4;
            let along = -half + (slot as f64 + 0.5) * spacing;
            let position = match side {
                0 => Vec2::new(-half + offset, along),
                1 => Vec2::new(half - offset, along),
                2 => Vec2::new(along, -half + offset),
                _ => Vec2::new(along, half - offset),
            };
            AgentPhysicalState {
                position,
                heading_angle: (i % 64) as f64 * 0.03125,
            }
        })
        .collect()
}

fn state_for(scenario: &Scenario) -> Vec<AgentPhysicalState> {
    match scenario.distribution {
        Distribution::UniformGrid => uniform_grid(scenario.agents, scenario.arena_size),
        Distribution::Clustered {
            cluster_fraction,
            cluster_span_fraction,
        } => clustered(
            scenario.agents,
            scenario.arena_size,
            cluster_fraction,
            cluster_span_fraction,
        ),
        Distribution::BoundaryBands {
            band_offset_fraction,
        } => boundary_bands(scenario.agents, scenario.arena_size, band_offset_fraction),
    }
}

fn equal_ranges(count: usize, range: f64) -> Vec<f64> {
    vec![range; count]
}

fn heterogeneous_ranges(count: usize, range_set: &[f64]) -> Vec<f64> {
    assert!(!range_set.is_empty());
    (0..count).map(|i| range_set[i % range_set.len()]).collect()
}

fn validate_case(
    label: &str,
    scenario: &Scenario,
    state: &[AgentPhysicalState],
    ranges: &[f64],
) {
    let expected = brute_force_rab_routes(state, ranges, scenario.arena_size);
    let mut candidate = FaithfulArgosRabGrid::default();
    candidate.rebuild(state, ranges, scenario.arena_size);
    let (actual, _) = candidate.build_routes_with_stats(state, ranges, scenario.arena_size);
    assert_eq!(
        actual, expected,
        "faithful ARGoS RAB exactness failure scenario={} case={}",
        scenario.id, label
    );
}

fn sum_links(routes: &[Vec<usize>]) -> usize {
    routes.iter().map(Vec::len).sum()
}

fn profile_case(
    label: &str,
    scenario: &Scenario,
    state: &[AgentPhysicalState],
    ranges: &[f64],
) {
    let repetitions = 3;
    let mut grid = FaithfulArgosRabGrid::default();

    let rebuild_ms = median_ms(repetitions, || {
        grid.rebuild(
            black_box(state),
            black_box(ranges),
            scenario.arena_size,
        );
    });
    grid.rebuild(state, ranges, scenario.arena_size);

    let mut last_stats = RabRouteStats::default();
    let route_ms = median_ms(repetitions, || {
        let (routes, stats) = grid.build_routes_with_stats(
            black_box(state),
            black_box(ranges),
            scenario.arena_size,
        );
        black_box(sum_links(&routes));
        last_stats = stats;
    });

    let brute_force_ms = median_ms(repetitions, || {
        let routes = brute_force_rab_routes(
            black_box(state),
            black_box(ranges),
            scenario.arena_size,
        );
        black_box(sum_links(&routes));
    });

    let entries_per_agent = grid.index_entries() as f64 / state.len().max(1) as f64;
    let receivers = state.len().max(1) as f64;
    println!(
        "profile,{},{},{},{:.6},{},{:.6},{:.6},{:.6},{},{:.6},{},{},{},{},{},{:.6}",
        scenario.id,
        label,
        state.len(),
        scenario.arena_size,
        grid.cells_per_axis(),
        grid.cell_size(),
        rebuild_ms,
        route_ms,
        grid.index_entries(),
        entries_per_agent,
        last_stats.receiver_point_lookups,
        last_stats.raw_bucket_entries,
        last_stats.pair_references,
        last_stats.duplicate_pair_references,
        last_stats.exact_pair_distance_checks,
        last_stats.directed_links as f64 / receivers,
    );
    println!(
        "oracle_timing,{},{},{:.6}",
        scenario.id, label, brute_force_ms
    );
}

fn main() {
    let matrix: Matrix = serde_json::from_str(MATRIX_JSON).expect("parse neighbour-search matrix");
    assert_eq!(matrix.version, 1);

    println!("vlab_faithful_argos_rab_benchmark_version=1");
    println!("source_model=argos3-master-rab-medium-and-rab-equipped-entity-grid-updater");
    println!("semantics=transmitter-owned-range,point-receiver-lookup,pair-distance-once,directional-range-tests");
    println!("isolation=equal-message-size,no-occlusion,2d-periodic-virtual-lab-benchmark-world");
    println!("grid_policy=argos-default-approximately-one-world-unit-per-cell,independent-of-rab-range");
    println!("profile_schema=row_type,scenario,range_case,agents,arena_size,cells_per_axis,cell_size,rebuild_median_ms,route_build_median_ms,index_entries,entries_per_agent,receiver_point_lookups,raw_bucket_entries,pair_references,duplicate_pair_references,exact_pair_distance_checks,avg_directed_links_per_receiver");
    println!("oracle_schema=row_type,scenario,range_case,brute_force_route_median_ms");

    for scenario in &matrix.ci_smoke_scenarios {
        let state = state_for(scenario);

        for &range in &scenario.radii {
            let label = format!("equal-{range:.6}");
            let ranges = equal_ranges(state.len(), range);
            validate_case(&label, scenario, &state, &ranges);
            println!("validated,{},{label}", scenario.id);
            profile_case(&label, scenario, &state, &ranges);
        }

        if scenario.radii.len() > 1 {
            let label = "heterogeneous-cyclic";
            let ranges = heterogeneous_ranges(state.len(), &scenario.radii);
            validate_case(label, scenario, &state, &ranges);
            println!("validated,{},{}", scenario.id, label);
            profile_case(label, scenario, &state, &ranges);
        }
    }

    println!("validation=faithful-argos-rab-grid-matches-transmitter-range-brute-force-oracle");
}
