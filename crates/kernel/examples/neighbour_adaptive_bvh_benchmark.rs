mod adaptive_periodic_bvh;
mod multi_resolution_periodic_grid;

use std::collections::BTreeSet;
use std::hint::black_box;
use std::time::Instant;

use adaptive_periodic_bvh::AdaptivePeriodicBvh;
use multi_resolution_periodic_grid::MultiResolutionPeriodicGrid;
use serde::Deserialize;
use vlab_kernel::{
    AgentPhysicalState, BruteForceNeighbourIndex, NeighbourIndex, PeriodicGridNeighbourIndex, Vec2,
};

const MATRIX_JSON: &str = include_str!("../../../benchmarks/neighbour_search_matrix.json");

#[derive(Debug, Deserialize)]
struct Matrix {
    version: u32,
    seed: u64,
    full_tournament_axes: FullTournamentAxes,
    ci_smoke_scenarios: Vec<Scenario>,
}

#[derive(Debug, Deserialize)]
struct FullTournamentAxes {
    agent_counts: Vec<usize>,
    densities: Vec<f64>,
    radius_sets: Vec<Vec<f64>>,
    distributions: Vec<String>,
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
    Clustered { cluster_fraction: f64, cluster_span_fraction: f64 },
    BoundaryBands { band_offset_fraction: f64 },
}

fn median_ms(repetitions: usize, mut f: impl FnMut()) -> f64 {
    let mut samples = Vec::with_capacity(repetitions);
    for _ in 0..repetitions {
        let started = Instant::now();
        f();
        samples.push(started.elapsed().as_secs_f64() * 1000.0);
    }
    samples.sort_by(|a, b| a.partial_cmp(b).expect("finite timing"));
    samples[samples.len() / 2]
}

fn uniform_grid(count: usize, arena: f64) -> Vec<AgentPhysicalState> {
    let side = (count.max(1) as f64).sqrt().ceil() as usize;
    let spacing = arena / side as f64;
    let half = arena / 2.0;
    (0..count)
        .map(|i| AgentPhysicalState {
            metadata: Default::default(), position: Vec2::new(
                -half + ((i % side) as f64 + 0.5) * spacing,
                -half + ((i / side) as f64 + 0.5) * spacing,
            ),
            heading_angle: (i % 64) as f64 * 0.03125,
        })
        .collect()
}

fn clustered(count: usize, arena: f64, cluster_fraction: f64, cluster_span_fraction: f64) -> Vec<AgentPhysicalState> {
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
            metadata: Default::default(), position: Vec2::new(
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
            AgentPhysicalState { metadata: Default::default(), position, heading_angle: (i % 64) as f64 * 0.03125 }
        })
        .collect()
}

fn state_for(scenario: &Scenario) -> Vec<AgentPhysicalState> {
    match scenario.distribution {
        Distribution::UniformGrid => uniform_grid(scenario.agents, scenario.arena_size),
        Distribution::Clustered { cluster_fraction, cluster_span_fraction } => {
            clustered(scenario.agents, scenario.arena_size, cluster_fraction, cluster_span_fraction)
        }
        Distribution::BoundaryBands { band_offset_fraction } => {
            boundary_bands(scenario.agents, scenario.arena_size, band_offset_fraction)
        }
    }
}

fn validate_matrix(matrix: &Matrix) {
    assert_eq!(matrix.version, 1);
    assert!(matrix.seed > 0);
    assert!(!matrix.ci_smoke_scenarios.is_empty());
    assert!(!matrix.full_tournament_axes.agent_counts.is_empty());
    assert!(!matrix.full_tournament_axes.densities.is_empty());
    assert!(matrix.full_tournament_axes.radius_sets.iter().any(|r| r.len() > 1));
    let distributions: BTreeSet<&str> = matrix.full_tournament_axes.distributions.iter().map(String::as_str).collect();
    for required in ["uniform-grid", "clustered", "boundary-bands"] {
        assert!(distributions.contains(required));
    }
}

fn validate_exactness(scenario: &Scenario, state: &[AgentPhysicalState]) {
    let mut brute = BruteForceNeighbourIndex::default();
    let mut current = PeriodicGridNeighbourIndex::default();
    let mut multi = MultiResolutionPeriodicGrid::default();
    let mut bvh = AdaptivePeriodicBvh::default();
    brute.rebuild(state, scenario.arena_size);
    current.rebuild(state, scenario.arena_size);
    multi.rebuild(state, scenario.arena_size);
    bvh.rebuild(state, scenario.arena_size);
    let tree_shape = (bvh.node_count(), bvh.leaf_count(), bvh.max_depth(), bvh.index_entries());

    let mut expected = Vec::new();
    let mut actual = Vec::new();
    for &radius in &scenario.radii {
        for agent in 0..state.len() {
            brute.query(state, agent, radius, scenario.arena_size, &mut expected);
            current.query(state, agent, radius, scenario.arena_size, &mut actual);
            assert_eq!(actual, expected, "current exactness failure scenario={} radius={} agent={}", scenario.id, radius, agent);
            multi.query(state, agent, radius, scenario.arena_size, &mut actual);
            assert_eq!(actual, expected, "multi-resolution exactness failure scenario={} radius={} agent={}", scenario.id, radius, agent);
            bvh.query(state, agent, radius, scenario.arena_size, &mut actual);
            assert_eq!(actual, expected, "BVH exactness failure scenario={} radius={} agent={}", scenario.id, radius, agent);
        }
        assert_eq!(tree_shape, (bvh.node_count(), bvh.leaf_count(), bvh.max_depth(), bvh.index_entries()), "query radius changed BVH structure");
    }
}

fn profile_current(scenario: &Scenario, state: &[AgentPhysicalState]) -> (f64, f64) {
    let mut index = PeriodicGridNeighbourIndex::default();
    let rebuild = median_ms(3, || index.rebuild(black_box(state), scenario.arena_size));
    index.rebuild(state, scenario.arena_size);
    let query = median_ms(3, || {
        let mut out = Vec::new();
        let mut total = 0usize;
        for &radius in &scenario.radii {
            for agent in 0..state.len() {
                index.query(state, agent, radius, scenario.arena_size, &mut out);
                total += out.len();
            }
        }
        black_box(total);
    });
    (rebuild, query)
}

fn profile_multi(scenario: &Scenario, state: &[AgentPhysicalState]) -> (f64, f64) {
    let mut index = MultiResolutionPeriodicGrid::default();
    let rebuild = median_ms(3, || index.rebuild(black_box(state), scenario.arena_size));
    index.rebuild(state, scenario.arena_size);
    let query = median_ms(3, || {
        let mut out = Vec::new();
        let mut total = 0usize;
        for &radius in &scenario.radii {
            for agent in 0..state.len() {
                index.query(state, agent, radius, scenario.arena_size, &mut out);
                total += out.len();
            }
        }
        black_box(total);
    });
    (rebuild, query)
}

fn profile_bvh(scenario: &Scenario, state: &[AgentPhysicalState]) -> (f64, f64, AdaptivePeriodicBvh) {
    let mut index = AdaptivePeriodicBvh::default();
    let rebuild = median_ms(3, || index.rebuild(black_box(state), scenario.arena_size));
    index.rebuild(state, scenario.arena_size);
    let query = median_ms(3, || {
        let mut out = Vec::new();
        let mut total = 0usize;
        for &radius in &scenario.radii {
            for agent in 0..state.len() {
                index.query(state, agent, radius, scenario.arena_size, &mut out);
                total += out.len();
            }
        }
        black_box(total);
    });
    (rebuild, query, index)
}

fn print_bvh_diagnostics(scenario: &Scenario, state: &[AgentPhysicalState], index: &AdaptivePeriodicBvh) {
    println!(
        "tree,adaptive-periodic-bvh,{},{},{},{},{},{}",
        scenario.id,
        index.leaf_capacity(),
        index.node_count(),
        index.leaf_count(),
        index.max_depth(),
        index.index_entries(),
    );
    for &radius in &scenario.radii {
        let mut out = Vec::new();
        let mut nodes = 0usize;
        let mut leaves = 0usize;
        let mut candidates = 0usize;
        let mut accepted = 0usize;
        for agent in 0..state.len() {
            let stats = index.query_with_stats(state, agent, radius, scenario.arena_size, &mut out);
            nodes += stats.visited_nodes;
            leaves += stats.visited_leaves;
            candidates += stats.candidate_checks;
            accepted += out.len();
        }
        let q = state.len() as f64;
        println!(
            "bvh_diagnostic,{},{:.6},{:.3},{:.3},{:.3},{:.3}",
            scenario.id,
            radius,
            nodes as f64 / q,
            leaves as f64 / q,
            candidates as f64 / q,
            accepted as f64 / q,
        );
    }
}

fn main() {
    let matrix: Matrix = serde_json::from_str(MATRIX_JSON).expect("valid frozen neighbour matrix");
    validate_matrix(&matrix);
    println!("vlab_adaptive_bvh_benchmark_version=1");
    println!("matrix_version={}", matrix.version);
    println!("matrix_seed={}", matrix.seed);
    println!("correctness_contract=brute-force-exact-sorted-multi-radius-single-rebuild");
    println!("bvh_policy=balanced-widest-axis-median-split;leaf-capacity=8;periodic-translated-query-images;exact-minimum-image-final-test");
    println!("profile_schema=row_type,strategy,scenario,agents,arena_size,radii,rebuild_median_ms,query_all_radii_median_ms,total_queries");
    println!("tree_schema=row_type,strategy,scenario,leaf_capacity,node_count,leaf_count,max_depth,index_entries");
    println!("bvh_diagnostic_schema=row_type,scenario,radius,avg_nodes_visited,avg_leaves_visited,avg_candidate_checks,avg_neighbours");

    for scenario in &matrix.ci_smoke_scenarios {
        let state = state_for(scenario);
        validate_exactness(scenario, &state);
        println!("validated,{}", scenario.id);
        let radii = scenario.radii.iter().map(|r| format!("{r:.6}")).collect::<Vec<_>>().join(";");
        let queries = scenario.agents * scenario.radii.len();
        let (current_rebuild, current_query) = profile_current(scenario, &state);
        let (multi_rebuild, multi_query) = profile_multi(scenario, &state);
        let (bvh_rebuild, bvh_query, bvh) = profile_bvh(scenario, &state);
        println!("profile,current-periodic-grid,{},{},{:.6},\"{}\",{:.6},{:.6},{}", scenario.id, scenario.agents, scenario.arena_size, radii, current_rebuild, current_query, queries);
        println!("profile,multi-resolution-periodic-grid,{},{},{:.6},\"{}\",{:.6},{:.6},{}", scenario.id, scenario.agents, scenario.arena_size, radii, multi_rebuild, multi_query, queries);
        println!("profile,adaptive-periodic-bvh,{},{},{:.6},\"{}\",{:.6},{:.6},{}", scenario.id, scenario.agents, scenario.arena_size, radii, bvh_rebuild, bvh_query, queries);
        print_bvh_diagnostics(scenario, &state, &bvh);
    }
    println!("validation=all-ci-scenarios-current-grid-multi-resolution-and-adaptive-bvh-match-brute-force-across-all-radii");
}
