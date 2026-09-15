mod multi_resolution_periodic_grid;

use std::collections::BTreeSet;
use std::hint::black_box;
use std::time::Instant;

use multi_resolution_periodic_grid::{
    MultiResolutionPeriodicGrid, RadiusMatchedGridReference,
};
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
    Clustered {
        cluster_fraction: f64,
        cluster_span_fraction: f64,
    },
    BoundaryBands {
        band_offset_fraction: f64,
    },
}

trait BenchmarkStrategy {
    fn id(&self) -> &'static str;
    fn rebuild(&mut self, state: &[AgentPhysicalState], arena_size: f64);
    fn query(
        &self,
        state: &[AgentPhysicalState],
        agent_index: usize,
        radius: f64,
        arena_size: f64,
        out: &mut Vec<usize>,
    );
}

#[derive(Default)]
struct BruteForceStrategy {
    index: BruteForceNeighbourIndex,
}

impl BenchmarkStrategy for BruteForceStrategy {
    fn id(&self) -> &'static str { "brute-force" }

    fn rebuild(&mut self, state: &[AgentPhysicalState], arena_size: f64) {
        self.index.rebuild(state, arena_size);
    }

    fn query(
        &self,
        state: &[AgentPhysicalState],
        agent_index: usize,
        radius: f64,
        arena_size: f64,
        out: &mut Vec<usize>,
    ) {
        self.index.query(state, agent_index, radius, arena_size, out);
    }
}

#[derive(Default)]
struct CurrentPeriodicGridStrategy {
    index: PeriodicGridNeighbourIndex,
}

impl BenchmarkStrategy for CurrentPeriodicGridStrategy {
    fn id(&self) -> &'static str { "current-periodic-grid" }

    fn rebuild(&mut self, state: &[AgentPhysicalState], arena_size: f64) {
        self.index.rebuild(state, arena_size);
    }

    fn query(
        &self,
        state: &[AgentPhysicalState],
        agent_index: usize,
        radius: f64,
        arena_size: f64,
        out: &mut Vec<usize>,
    ) {
        self.index.query(state, agent_index, radius, arena_size, out);
    }
}

#[derive(Default)]
struct MultiResolutionGridStrategy {
    index: MultiResolutionPeriodicGrid,
}

impl BenchmarkStrategy for MultiResolutionGridStrategy {
    fn id(&self) -> &'static str { "multi-resolution-periodic-grid" }

    fn rebuild(&mut self, state: &[AgentPhysicalState], arena_size: f64) {
        self.index.rebuild(state, arena_size);
    }

    fn query(
        &self,
        state: &[AgentPhysicalState],
        agent_index: usize,
        radius: f64,
        arena_size: f64,
        out: &mut Vec<usize>,
    ) {
        self.index.query(state, agent_index, radius, arena_size, out);
    }
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
    assert!((0.0..=1.0).contains(&cluster_fraction));
    assert!(cluster_span_fraction > 0.0 && cluster_span_fraction < 1.0);
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

    let spread = uniform_grid(spread_count, arena);
    for (j, mut agent) in spread.into_iter().enumerate() {
        agent.heading_angle = ((clustered_count + j) % 64) as f64 * 0.03125;
        state.push(agent);
    }
    state
}

fn boundary_bands(count: usize, arena: f64, band_offset_fraction: f64) -> Vec<AgentPhysicalState> {
    assert!(band_offset_fraction > 0.0 && band_offset_fraction < 0.5);
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

fn validate_matrix(matrix: &Matrix) {
    assert_eq!(matrix.version, 1, "unsupported neighbour-search matrix version");
    assert!(matrix.seed > 0, "benchmark seed must be recorded and non-zero");
    assert!(!matrix.ci_smoke_scenarios.is_empty());
    assert!(!matrix.full_tournament_axes.agent_counts.is_empty());
    assert!(!matrix.full_tournament_axes.densities.is_empty());
    assert!(matrix.full_tournament_axes.radius_sets.iter().any(|r| r.len() > 1));

    let distributions: BTreeSet<&str> = matrix
        .full_tournament_axes
        .distributions
        .iter()
        .map(String::as_str)
        .collect();
    for required in ["uniform-grid", "clustered", "boundary-bands"] {
        assert!(distributions.contains(required), "missing full-matrix distribution {required}");
    }

    let mut has_multi_radius = false;
    let mut has_wide_ratio = false;
    let mut has_clustered = false;
    let mut has_boundary = false;
    for scenario in &matrix.ci_smoke_scenarios {
        assert!(scenario.agents > 1);
        assert!(scenario.arena_size > 0.0);
        assert!(!scenario.radii.is_empty());
        assert!(scenario.radii.iter().all(|r| *r > 0.0));
        if scenario.radii.len() > 1 { has_multi_radius = true; }
        let min = scenario.radii.iter().copied().fold(f64::INFINITY, f64::min);
        let max = scenario.radii.iter().copied().fold(0.0_f64, f64::max);
        if max / min >= 50.0 { has_wide_ratio = true; }
        match scenario.distribution {
            Distribution::Clustered { .. } => has_clustered = true,
            Distribution::BoundaryBands { .. } => has_boundary = true,
            Distribution::UniformGrid => {}
        }
    }
    assert!(has_multi_radius, "CI matrix must include simultaneous radii");
    assert!(has_wide_ratio, "CI matrix must include a large min/max radius ratio");
    assert!(has_clustered, "CI matrix must include clustered occupancy");
    assert!(has_boundary, "CI matrix must include periodic-boundary occupancy");
}

fn validate_exactness(scenario: &Scenario, state: &[AgentPhysicalState]) {
    let mut oracle = BruteForceStrategy::default();
    let mut current = CurrentPeriodicGridStrategy::default();
    let mut multi = MultiResolutionGridStrategy::default();
    oracle.rebuild(state, scenario.arena_size);
    current.rebuild(state, scenario.arena_size);
    multi.rebuild(state, scenario.arena_size);
    let hierarchy_before = multi.index.level_geometry();

    let mut expected = Vec::new();
    let mut actual = Vec::new();
    let mut reference = RadiusMatchedGridReference::default();
    for &radius in &scenario.radii {
        reference.rebuild_for_radius(state, scenario.arena_size, radius);
        for agent in 0..state.len() {
            oracle.query(state, agent, radius, scenario.arena_size, &mut expected);

            current.query(state, agent, radius, scenario.arena_size, &mut actual);
            assert_eq!(
                actual, expected,
                "current-grid exactness failure scenario={} radius={} agent={}",
                scenario.id, radius, agent
            );

            multi.query(state, agent, radius, scenario.arena_size, &mut actual);
            assert_eq!(
                actual, expected,
                "multi-resolution exactness failure scenario={} radius={} agent={}",
                scenario.id, radius, agent
            );

            reference.query_with_stats(
                state,
                agent,
                radius,
                scenario.arena_size,
                &mut actual,
            );
            assert_eq!(
                actual, expected,
                "radius-matched reference exactness failure scenario={} radius={} agent={}",
                scenario.id, radius, agent
            );
        }
        assert_eq!(
            multi.index.level_geometry(),
            hierarchy_before,
            "query radius changed multi-resolution hierarchy geometry"
        );
    }
}

fn profile_strategy(
    strategy: &mut dyn BenchmarkStrategy,
    scenario: &Scenario,
    state: &[AgentPhysicalState],
) {
    let repetitions = 3;
    let rebuild_ms = median_ms(repetitions, || {
        strategy.rebuild(black_box(state), scenario.arena_size);
    });
    strategy.rebuild(state, scenario.arena_size);

    let mut accepted = 0usize;
    let query_ms = median_ms(repetitions, || {
        let mut out = Vec::new();
        let mut total = 0usize;
        for &radius in &scenario.radii {
            for agent in 0..state.len() {
                strategy.query(state, agent, radius, scenario.arena_size, &mut out);
                total += out.len();
            }
        }
        accepted = total;
        black_box(total);
    });

    let query_count = state.len() * scenario.radii.len();
    let avg_neighbours = accepted as f64 / query_count as f64;
    let radii = scenario
        .radii
        .iter()
        .map(|r| format!("{r:.6}"))
        .collect::<Vec<_>>()
        .join(";");

    println!(
        "profile,{},{},{},{:.6},\"{}\",{:.6},{:.6},{},{:.6}",
        strategy.id(),
        scenario.id,
        scenario.agents,
        scenario.arena_size,
        radii,
        rebuild_ms,
        query_ms,
        query_count,
        avg_neighbours,
    );
}

fn profile_multi_resolution_diagnostics(scenario: &Scenario, state: &[AgentPhysicalState]) {
    let mut index = MultiResolutionPeriodicGrid::default();
    index.rebuild(state, scenario.arena_size);
    let geometry = index
        .level_geometry()
        .into_iter()
        .enumerate()
        .map(|(level, (cells, cell_size))| format!("{level}:{cells}:{cell_size:.6}"))
        .collect::<Vec<_>>()
        .join(";");
    println!(
        "hierarchy,multi-resolution-periodic-grid,{},{},{},\"{}\"",
        scenario.id,
        index.level_count(),
        index.index_entries(),
        geometry,
    );

    for &radius in &scenario.radii {
        let mut out = Vec::new();
        let mut accepted = 0usize;
        let mut visited_cells = 0usize;
        let mut candidate_checks = 0usize;
        let mut selected_level = None;
        let mut cells_per_axis = 0usize;
        let mut cell_size = 0.0;
        for agent in 0..state.len() {
            let stats = index.query_with_stats(
                state,
                agent,
                radius,
                scenario.arena_size,
                &mut out,
            );
            if let Some(level) = selected_level {
                assert_eq!(level, stats.level_index, "radius selected inconsistent hierarchy levels");
            } else {
                selected_level = Some(stats.level_index);
                cells_per_axis = stats.cells_per_axis;
                cell_size = stats.cell_size;
            }
            accepted += out.len();
            visited_cells += stats.visited_cells;
            candidate_checks += stats.candidate_checks;
        }
        let queries = state.len();
        println!(
            "multi_resolution_diagnostic,{},{:.6},{},{},{:.6},{},{:.3},{:.3},{:.3}",
            scenario.id,
            radius,
            selected_level.expect("non-empty scenario"),
            cells_per_axis,
            cell_size,
            index.index_entries(),
            visited_cells as f64 / queries as f64,
            candidate_checks as f64 / queries as f64,
            accepted as f64 / queries as f64,
        );
    }
}

fn profile_radius_matched_reference(scenario: &Scenario, state: &[AgentPhysicalState]) {
    let repetitions = 3;
    for &radius in &scenario.radii {
        let mut reference = RadiusMatchedGridReference::default();
        let rebuild_ms = median_ms(repetitions, || {
            reference.rebuild_for_radius(black_box(state), scenario.arena_size, radius);
        });
        reference.rebuild_for_radius(state, scenario.arena_size, radius);

        let mut accepted = 0usize;
        let query_ms = median_ms(repetitions, || {
            let mut out = Vec::new();
            let mut total = 0usize;
            for agent in 0..state.len() {
                reference.query_with_stats(
                    state,
                    agent,
                    radius,
                    scenario.arena_size,
                    &mut out,
                );
                total += out.len();
            }
            accepted = total;
            black_box(total);
        });

        let mut out = Vec::new();
        let mut visited_cells = 0usize;
        let mut candidate_checks = 0usize;
        for agent in 0..state.len() {
            let stats = reference.query_with_stats(
                state,
                agent,
                radius,
                scenario.arena_size,
                &mut out,
            );
            visited_cells += stats.visited_cells;
            candidate_checks += stats.candidate_checks;
        }

        println!(
            "reference_profile,radius-matched-per-radius,{},{:.6},{},{:.6},{},{:.6},{:.6},{},{:.3},{:.3},{:.3}",
            scenario.id,
            radius,
            reference.cells_per_axis(),
            reference.cell_size(),
            reference.index_entries(state.len()),
            rebuild_ms,
            query_ms,
            state.len(),
            visited_cells as f64 / state.len() as f64,
            candidate_checks as f64 / state.len() as f64,
            accepted as f64 / state.len() as f64,
        );
    }
}

fn main() {
    let matrix: Matrix = serde_json::from_str(MATRIX_JSON).expect("parse neighbour-search matrix");
    validate_matrix(&matrix);

    println!("vlab_neighbour_strategy_benchmark_version=2");
    println!("matrix_version={}", matrix.version);
    println!("matrix_seed={}", matrix.seed);
    println!("correctness_contract=brute-force-exact-sorted-multi-radius-single-rebuild");
    println!("profile_schema=row_type,strategy,scenario,agents,arena_size,radii,rebuild_median_ms,query_all_radii_median_ms,total_queries,avg_neighbours");
    println!("hierarchy_schema=row_type,strategy,scenario,level_count,index_entries,level_geometry_level:cells_per_axis:cell_size");
    println!("multi_resolution_diagnostic_schema=row_type,scenario,radius,selected_level,cells_per_axis,cell_size,index_entries,avg_visited_cells,avg_candidate_checks,avg_neighbours");
    println!("reference_profile_schema=row_type,strategy,scenario,radius,cells_per_axis,cell_size,index_entries,rebuild_median_ms,query_all_agents_median_ms,total_queries,avg_visited_cells,avg_candidate_checks,avg_neighbours");
    println!("multi_resolution_geometry_policy=population-and-arena-only;finest=4*ceil(sqrt(N));coarsen-by-approximately-2-to-one-cell");
    println!("radius_matched_reference_policy=performance-reference-only;rebuilds-separately-per-radius;not-admissible-general-strategy");

    for scenario in &matrix.ci_smoke_scenarios {
        let state = state_for(scenario);
        validate_exactness(scenario, &state);
        println!("validated,{}", scenario.id);

        let mut oracle = BruteForceStrategy::default();
        profile_strategy(&mut oracle, scenario, &state);

        let mut current = CurrentPeriodicGridStrategy::default();
        profile_strategy(&mut current, scenario, &state);

        let mut multi = MultiResolutionGridStrategy::default();
        profile_strategy(&mut multi, scenario, &state);
        profile_multi_resolution_diagnostics(scenario, &state);
        profile_radius_matched_reference(scenario, &state);
    }

    println!("validation=all-ci-scenarios-current-grid-and-multi-resolution-match-brute-force-across-all-radii");
}
