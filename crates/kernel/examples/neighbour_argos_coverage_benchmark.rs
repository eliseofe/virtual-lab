mod argos_coverage_stamping;

use std::hint::black_box;
use std::time::Instant;

use argos_coverage_stamping::{CoverageStampingNeighbourIndex, QueryStats};
use serde::Deserialize;
use vlab_kernel::{
    AgentPhysicalState, BruteForceNeighbourIndex, NeighbourIndex, PeriodicGridNeighbourIndex, Vec2,
};

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
        Distribution::Clustered { cluster_fraction, cluster_span_fraction } => clustered(
            scenario.agents,
            scenario.arena_size,
            cluster_fraction,
            cluster_span_fraction,
        ),
        Distribution::BoundaryBands { band_offset_fraction } => {
            boundary_bands(scenario.agents, scenario.arena_size, band_offset_fraction)
        }
    }
}

fn validate_exactness(scenario: &Scenario, state: &[AgentPhysicalState]) {
    let mut oracle = BruteForceNeighbourIndex;
    let mut candidate = CoverageStampingNeighbourIndex::default();
    oracle.rebuild(state, scenario.arena_size);
    candidate.rebuild(state, scenario.arena_size);

    let mut expected = Vec::new();
    let mut actual = Vec::new();
    for &radius in &scenario.radii {
        for agent in 0..state.len() {
            oracle.query(state, agent, radius, scenario.arena_size, &mut expected);
            candidate.query(state, agent, radius, scenario.arena_size, &mut actual);
            assert_eq!(
                actual, expected,
                "coverage-stamping exactness failure scenario={} radius={} agent={}",
                scenario.id, radius, agent
            );
        }
    }
}

fn profile_index<I: NeighbourIndex>(
    id: &str,
    index: &mut I,
    scenario: &Scenario,
    state: &[AgentPhysicalState],
) {
    let repetitions = 3;
    let rebuild_ms = median_ms(repetitions, || {
        index.rebuild(black_box(state), scenario.arena_size);
    });
    index.rebuild(state, scenario.arena_size);

    let mut accepted = 0usize;
    let query_ms = median_ms(repetitions, || {
        let mut out = Vec::new();
        let mut total = 0usize;
        for &radius in &scenario.radii {
            for agent in 0..state.len() {
                index.query(state, agent, radius, scenario.arena_size, &mut out);
                total += out.len();
            }
        }
        accepted = total;
        black_box(total);
    });

    let query_count = state.len() * scenario.radii.len();
    let radii = scenario.radii.iter().map(|r| format!("{r:.6}")).collect::<Vec<_>>().join(";");
    println!(
        "profile,{},{},{},{:.6},\"{}\",{:.6},{:.6},{},{:.6}",
        id,
        scenario.id,
        scenario.agents,
        scenario.arena_size,
        radii,
        rebuild_ms,
        query_ms,
        query_count,
        accepted as f64 / query_count as f64,
    );
}

fn profile_coverage_diagnostics(
    candidate: &mut CoverageStampingNeighbourIndex,
    scenario: &Scenario,
    state: &[AgentPhysicalState],
) {
    candidate.rebuild(state, scenario.arena_size);
    let mut total = QueryStats::default();
    let mut out = Vec::new();
    for &radius in &scenario.radii {
        for agent in 0..state.len() {
            total += candidate.query_with_stats(
                state,
                agent,
                radius,
                scenario.arena_size,
                &mut out,
            );
        }
    }

    let queries = (state.len() * scenario.radii.len()) as f64;
    let entries_per_agent = candidate.index_entries() as f64 / state.len() as f64;
    let duplicate_entries = total.raw_candidate_entries.saturating_sub(total.unique_candidates);
    println!(
        "coverage_metrics,{},{},{},{},{:.3},{:.3},{:.3},{:.3},{:.3},{:.3},{:.3}",
        scenario.id,
        candidate.cells_per_axis(),
        candidate.stamp_span_cells(),
        candidate.index_entries(),
        entries_per_agent,
        total.visited_cells as f64 / queries,
        total.raw_candidate_entries as f64 / queries,
        total.unique_candidates as f64 / queries,
        duplicate_entries as f64 / queries,
        total.exact_distance_checks as f64 / queries,
        total.accepted as f64 / queries,
    );
}

fn main() {
    let matrix: Matrix = serde_json::from_str(MATRIX_JSON).expect("parse neighbour-search matrix");
    assert_eq!(matrix.version, 1);

    println!("vlab_argos_coverage_benchmark_version=1");
    println!("candidate=argos-style-fixed-one-cell-coverage-halo");
    println!("semantic_adaptation=coverage-halo-is-simulator-infrastructure-not-scientific-range");
    println!("profile_schema=row_type,strategy,scenario,agents,arena_size,radii,rebuild_median_ms,query_all_radii_median_ms,total_queries,avg_neighbours");
    println!("coverage_metrics_schema=row_type,scenario,cells_per_axis,stamp_span_cells,index_entries,entries_per_agent,avg_visited_cells,avg_raw_candidate_entries,avg_unique_candidates,avg_duplicate_entries_suppressed,avg_exact_distance_checks,avg_neighbours");

    for scenario in &matrix.ci_smoke_scenarios {
        let state = state_for(scenario);
        validate_exactness(scenario, &state);
        println!("validated,{}", scenario.id);

        let mut current = PeriodicGridNeighbourIndex::default();
        profile_index("current-periodic-grid", &mut current, scenario, &state);

        let mut candidate = CoverageStampingNeighbourIndex::default();
        profile_index("argos-coverage-stamping", &mut candidate, scenario, &state);
        profile_coverage_diagnostics(&mut candidate, scenario, &state);
    }

    println!("validation=coverage-stamping-matches-brute-force-across-all-frozen-ci-scenarios-and-radii");
}
