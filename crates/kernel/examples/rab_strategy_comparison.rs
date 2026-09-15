mod adaptive_periodic_bvh;
mod faithful_argos_rab;
mod multi_resolution_periodic_grid;

use std::collections::BTreeSet;
use std::hint::black_box;
use std::time::Instant;

use adaptive_periodic_bvh::AdaptivePeriodicBvh;
use faithful_argos_rab::{brute_force_rab_routes, FaithfulArgosRabGrid, RabRouteStats};
use multi_resolution_periodic_grid::MultiResolutionPeriodicGrid;
use serde::Deserialize;
use vlab_kernel::{AgentPhysicalState, NeighbourIndex, PeriodicGridNeighbourIndex, Vec2};

const MATRIX_JSON: &str = include_str!("../../../benchmarks/neighbour_search_matrix.json");
const EXACTNESS_PROBES: usize = 9;

#[derive(Debug, Deserialize)]
struct Matrix {
    version: u32,
    full_tournament_axes: FullAxes,
}

#[derive(Debug, Deserialize)]
struct FullAxes {
    agent_counts: Vec<usize>,
    densities: Vec<f64>,
    radius_sets: Vec<Vec<f64>>,
    distributions: Vec<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Distribution {
    Uniform,
    Clustered,
    BoundaryBands,
}

impl Distribution {
    fn id(self) -> &'static str {
        match self {
            Self::Uniform => "uniform-grid",
            Self::Clustered => "clustered",
            Self::BoundaryBands => "boundary-bands",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum RangeCase {
    Equal,
    HeterogeneousModerate,
    HeterogeneousWide,
}

impl RangeCase {
    fn id(self) -> &'static str {
        match self {
            Self::Equal => "equal-1",
            Self::HeterogeneousModerate => "heterogeneous-0p25-1-4",
            Self::HeterogeneousWide => "heterogeneous-0p1-1-10",
        }
    }

    fn range_set(self) -> &'static [f64] {
        match self {
            Self::Equal => &[1.0],
            Self::HeterogeneousModerate => &[0.25, 1.0, 4.0],
            Self::HeterogeneousWide => &[0.1, 1.0, 10.0],
        }
    }
}

#[derive(Clone, Debug)]
struct Scenario {
    id: String,
    agents: usize,
    density: f64,
    arena_size: f64,
    distribution: Distribution,
    range_case: RangeCase,
}

#[derive(Clone, Copy, Debug, Default)]
struct QueryDiag {
    lookup_units: usize,
    internal_candidate_checks: usize,
    supported: bool,
}

trait GenericRabIndex {
    fn id(&self) -> &'static str;
    fn rebuild_index(&mut self, state: &[AgentPhysicalState], arena_size: f64);
    fn query_max_range(
        &self,
        state: &[AgentPhysicalState],
        receiver: usize,
        max_range: f64,
        arena_size: f64,
        out: &mut Vec<usize>,
    ) -> QueryDiag;
    fn index_entries(&self, agents: usize) -> usize;
}

impl GenericRabIndex for PeriodicGridNeighbourIndex {
    fn id(&self) -> &'static str {
        "current-periodic-grid-adapter"
    }

    fn rebuild_index(&mut self, state: &[AgentPhysicalState], arena_size: f64) {
        NeighbourIndex::rebuild(self, state, arena_size);
    }

    fn query_max_range(
        &self,
        state: &[AgentPhysicalState],
        receiver: usize,
        max_range: f64,
        arena_size: f64,
        out: &mut Vec<usize>,
    ) -> QueryDiag {
        NeighbourIndex::query(self, state, receiver, max_range, arena_size, out);
        QueryDiag::default()
    }

    fn index_entries(&self, agents: usize) -> usize {
        agents
    }
}

impl GenericRabIndex for MultiResolutionPeriodicGrid {
    fn id(&self) -> &'static str {
        "multi-resolution-periodic-grid-adapter"
    }

    fn rebuild_index(&mut self, state: &[AgentPhysicalState], arena_size: f64) {
        self.rebuild(state, arena_size);
    }

    fn query_max_range(
        &self,
        state: &[AgentPhysicalState],
        receiver: usize,
        max_range: f64,
        arena_size: f64,
        out: &mut Vec<usize>,
    ) -> QueryDiag {
        let stats = self.query_with_stats(state, receiver, max_range, arena_size, out);
        QueryDiag {
            lookup_units: stats.visited_cells,
            internal_candidate_checks: stats.candidate_checks,
            supported: true,
        }
    }

    fn index_entries(&self, _agents: usize) -> usize {
        self.index_entries()
    }
}

impl GenericRabIndex for AdaptivePeriodicBvh {
    fn id(&self) -> &'static str {
        "adaptive-periodic-bvh-adapter"
    }

    fn rebuild_index(&mut self, state: &[AgentPhysicalState], arena_size: f64) {
        self.rebuild(state, arena_size);
    }

    fn query_max_range(
        &self,
        state: &[AgentPhysicalState],
        receiver: usize,
        max_range: f64,
        arena_size: f64,
        out: &mut Vec<usize>,
    ) -> QueryDiag {
        let stats = self.query_with_stats(state, receiver, max_range, arena_size, out);
        QueryDiag {
            lookup_units: stats.visited_nodes,
            internal_candidate_checks: stats.candidate_checks,
            supported: true,
        }
    }

    fn index_entries(&self, _agents: usize) -> usize {
        self.index_entries()
    }
}

#[derive(Clone, Copy, Debug, Default)]
struct GenericRouteStats {
    receiver_queries: usize,
    max_range_candidates: usize,
    final_range_checks: usize,
    lookup_units: usize,
    internal_candidate_checks: usize,
    diag_supported: bool,
    directed_links: usize,
}

fn median_ms(mut f: impl FnMut()) -> f64 {
    let mut samples = [0.0_f64; 3];
    for sample in &mut samples {
        let started = Instant::now();
        f();
        *sample = started.elapsed().as_secs_f64() * 1000.0;
    }
    samples.sort_by(|a, b| a.total_cmp(b));
    samples[1]
}

fn uniform_grid(n: usize, arena: f64) -> Vec<AgentPhysicalState> {
    let side = (n.max(1) as f64).sqrt().ceil() as usize;
    let spacing = arena / side as f64;
    let half = arena / 2.0;
    (0..n)
        .map(|i| AgentPhysicalState {
            position: Vec2::new(
                -half + ((i % side) as f64 + 0.5) * spacing,
                -half + ((i / side) as f64 + 0.5) * spacing,
            ),
            heading_angle: (i % 64) as f64 * 0.03125,
        })
        .collect()
}

fn clustered(n: usize, arena: f64, fraction: f64, span_fraction: f64) -> Vec<AgentPhysicalState> {
    let dense_n = ((n as f64) * fraction).round() as usize;
    let sparse_n = n.saturating_sub(dense_n);
    let span = arena * span_fraction;
    let side = (dense_n.max(1) as f64).sqrt().ceil() as usize;
    let spacing = span / side as f64;
    let center = -arena * 0.2;
    let min = center - span / 2.0;
    let mut state = Vec::with_capacity(n);

    for i in 0..dense_n {
        state.push(AgentPhysicalState {
            position: Vec2::new(
                min + ((i % side) as f64 + 0.5) * spacing,
                min + ((i / side) as f64 + 0.5) * spacing,
            ),
            heading_angle: (i % 64) as f64 * 0.03125,
        });
    }
    for (j, mut agent) in uniform_grid(sparse_n, arena).into_iter().enumerate() {
        agent.heading_angle = ((dense_n + j) % 64) as f64 * 0.03125;
        state.push(agent);
    }
    state
}

fn boundary_bands(n: usize, arena: f64, offset_fraction: f64) -> Vec<AgentPhysicalState> {
    let half = arena / 2.0;
    let offset = arena * offset_fraction;
    let per_side = ((n + 3) / 4).max(1);
    let spacing = arena / per_side as f64;
    (0..n)
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
        Distribution::Uniform => uniform_grid(scenario.agents, scenario.arena_size),
        Distribution::Clustered => clustered(scenario.agents, scenario.arena_size, 0.8, 0.2),
        Distribution::BoundaryBands => boundary_bands(scenario.agents, scenario.arena_size, 0.01),
    }
}

fn transmitter_ranges(case: RangeCase, n: usize) -> Vec<f64> {
    let set = case.range_set();
    (0..n).map(|i| set[i % set.len()]).collect()
}

fn density_label(density: f64) -> String {
    let mut s = format!("{density:.2}");
    while s.ends_with('0') {
        s.pop();
    }
    if s.ends_with('.') {
        s.pop();
    }
    s.replace('.', "p")
}

fn add_scenario(
    panel: &mut Vec<Scenario>,
    seen: &mut BTreeSet<String>,
    n: usize,
    density: f64,
    distribution: Distribution,
    range_case: RangeCase,
) {
    let id = format!(
        "n{}-d{}-{}-{}",
        n,
        density_label(density),
        distribution.id(),
        range_case.id()
    );
    if seen.insert(id.clone()) {
        panel.push(Scenario {
            id,
            agents: n,
            density,
            arena_size: (n as f64 / density).sqrt(),
            distribution,
            range_case,
        });
    }
}

fn build_panel(matrix: &Matrix) -> Vec<Scenario> {
    let axes = &matrix.full_tournament_axes;
    for n in [100, 1000, 5000, 10000, 25000] {
        assert!(axes.agent_counts.contains(&n));
    }
    for density in [0.25, 1.0, 4.0, 16.0] {
        assert!(axes.densities.contains(&density));
    }
    assert_eq!(axes.radius_sets.len(), 3);
    let distributions: BTreeSet<&str> = axes.distributions.iter().map(String::as_str).collect();
    for id in ["uniform-grid", "clustered", "boundary-bands"] {
        assert!(distributions.contains(id));
    }

    let cases = [
        RangeCase::Equal,
        RangeCase::HeterogeneousModerate,
        RangeCase::HeterogeneousWide,
    ];
    let mut panel = Vec::new();
    let mut seen = BTreeSet::new();

    for &n in &axes.agent_counts {
        for &range_case in &cases {
            add_scenario(&mut panel, &mut seen, n, 1.0, Distribution::Uniform, range_case);
        }
    }
    for &density in &axes.densities {
        for &range_case in &cases {
            add_scenario(
                &mut panel,
                &mut seen,
                5000,
                density,
                Distribution::Uniform,
                range_case,
            );
        }
    }
    for distribution in [Distribution::Clustered, Distribution::BoundaryBands] {
        for &range_case in &cases {
            add_scenario(&mut panel, &mut seen, 5000, 1.0, distribution, range_case);
        }
    }
    for distribution in [Distribution::Clustered, Distribution::BoundaryBands] {
        for range_case in [RangeCase::HeterogeneousModerate, RangeCase::HeterogeneousWide] {
            add_scenario(&mut panel, &mut seen, 25000, 1.0, distribution, range_case);
        }
    }

    assert_eq!(panel.len(), 34);
    panel
}

fn minimum_image_component(delta: f64, arena_size: f64) -> f64 {
    delta - arena_size * (delta / arena_size).round()
}

fn distance2_periodic(a: Vec2, b: Vec2, arena_size: f64) -> f64 {
    let dx = minimum_image_component(b.x - a.x, arena_size);
    let dy = minimum_image_component(b.y - a.y, arena_size);
    dx * dx + dy * dy
}

fn brute_force_receiver(
    state: &[AgentPhysicalState],
    ranges: &[f64],
    receiver: usize,
    arena_size: f64,
    out: &mut Vec<usize>,
) {
    out.clear();
    let origin = state[receiver].position;
    for transmitter in 0..state.len() {
        if transmitter == receiver {
            continue;
        }
        let distance2 = distance2_periodic(origin, state[transmitter].position, arena_size);
        if distance2 < ranges[transmitter] * ranges[transmitter] {
            out.push(transmitter);
        }
    }
}

fn probe_indices(n: usize, wanted: usize) -> Vec<usize> {
    let count = wanted.min(n);
    if count == 0 {
        return Vec::new();
    }
    if count == 1 {
        return vec![0];
    }
    let mut probes = BTreeSet::new();
    for i in 0..count {
        probes.insert(i * (n - 1) / (count - 1));
    }
    probes.into_iter().collect()
}

fn generic_receiver<I: GenericRabIndex>(
    index: &I,
    state: &[AgentPhysicalState],
    ranges: &[f64],
    receiver: usize,
    arena_size: f64,
    out: &mut Vec<usize>,
) {
    let max_range = ranges.iter().copied().fold(0.0_f64, f64::max);
    let mut candidates = Vec::new();
    index.query_max_range(state, receiver, max_range, arena_size, &mut candidates);
    out.clear();
    let origin = state[receiver].position;
    for transmitter in candidates {
        let distance2 = distance2_periodic(origin, state[transmitter].position, arena_size);
        if distance2 < ranges[transmitter] * ranges[transmitter] {
            out.push(transmitter);
        }
    }
}

fn build_generic_routes<I: GenericRabIndex>(
    index: &I,
    state: &[AgentPhysicalState],
    ranges: &[f64],
    arena_size: f64,
) -> (Vec<Vec<usize>>, GenericRouteStats) {
    let max_range = ranges.iter().copied().fold(0.0_f64, f64::max);
    let mut routes = vec![Vec::new(); state.len()];
    let mut candidates = Vec::new();
    let mut stats = GenericRouteStats::default();

    for receiver in 0..state.len() {
        stats.receiver_queries += 1;
        let diag = index.query_max_range(
            state,
            receiver,
            max_range,
            arena_size,
            &mut candidates,
        );
        stats.diag_supported |= diag.supported;
        stats.lookup_units += diag.lookup_units;
        stats.internal_candidate_checks += diag.internal_candidate_checks;
        stats.max_range_candidates += candidates.len();

        let origin = state[receiver].position;
        for &transmitter in &candidates {
            stats.final_range_checks += 1;
            let distance2 = distance2_periodic(origin, state[transmitter].position, arena_size);
            if distance2 < ranges[transmitter] * ranges[transmitter] {
                routes[receiver].push(transmitter);
                stats.directed_links += 1;
            }
        }
    }
    (routes, stats)
}

fn validate_case(scenario: &Scenario, state: &[AgentPhysicalState], ranges: &[f64]) {
    let probes = if state.len() <= 1000 {
        (0..state.len()).collect::<Vec<_>>()
    } else {
        probe_indices(state.len(), EXACTNESS_PROBES)
    };

    let mut faithful = FaithfulArgosRabGrid::default();
    faithful.rebuild(state, ranges, scenario.arena_size);
    let (faithful_routes, _) = faithful.build_routes_with_stats(state, ranges, scenario.arena_size);

    let mut current = PeriodicGridNeighbourIndex::default();
    current.rebuild_index(state, scenario.arena_size);
    let mut multi = MultiResolutionPeriodicGrid::default();
    multi.rebuild_index(state, scenario.arena_size);
    let mut bvh = AdaptivePeriodicBvh::default();
    bvh.rebuild_index(state, scenario.arena_size);

    let mut expected = Vec::new();
    let mut actual = Vec::new();
    for receiver in probes {
        brute_force_receiver(state, ranges, receiver, scenario.arena_size, &mut expected);
        assert_eq!(faithful_routes[receiver], expected, "faithful mismatch {} receiver={receiver}", scenario.id);

        generic_receiver(&current, state, ranges, receiver, scenario.arena_size, &mut actual);
        assert_eq!(actual, expected, "current adapter mismatch {} receiver={receiver}", scenario.id);

        generic_receiver(&multi, state, ranges, receiver, scenario.arena_size, &mut actual);
        assert_eq!(actual, expected, "multi adapter mismatch {} receiver={receiver}", scenario.id);

        generic_receiver(&bvh, state, ranges, receiver, scenario.arena_size, &mut actual);
        assert_eq!(actual, expected, "bvh adapter mismatch {} receiver={receiver}", scenario.id);
    }
}

fn validate_large_boundary_full() {
    let n = 5000;
    let density = 1.0;
    let scenario = Scenario {
        id: "large-boundary-full-exactness".to_string(),
        agents: n,
        density,
        arena_size: (n as f64 / density).sqrt(),
        distribution: Distribution::BoundaryBands,
        range_case: RangeCase::Equal,
    };
    let state = state_for(&scenario);

    for range_case in [
        RangeCase::Equal,
        RangeCase::HeterogeneousModerate,
        RangeCase::HeterogeneousWide,
    ] {
        let ranges = transmitter_ranges(range_case, n);
        let expected = brute_force_rab_routes(&state, &ranges, scenario.arena_size);

        let mut faithful = FaithfulArgosRabGrid::default();
        faithful.rebuild(&state, &ranges, scenario.arena_size);
        let (actual, _) = faithful.build_routes_with_stats(&state, &ranges, scenario.arena_size);
        assert_eq!(actual, expected, "faithful large-boundary mismatch {}", range_case.id());

        let mut current = PeriodicGridNeighbourIndex::default();
        current.rebuild_index(&state, scenario.arena_size);
        let (actual, _) = build_generic_routes(&current, &state, &ranges, scenario.arena_size);
        assert_eq!(actual, expected, "current large-boundary mismatch {}", range_case.id());

        let mut multi = MultiResolutionPeriodicGrid::default();
        multi.rebuild_index(&state, scenario.arena_size);
        let (actual, _) = build_generic_routes(&multi, &state, &ranges, scenario.arena_size);
        assert_eq!(actual, expected, "multi large-boundary mismatch {}", range_case.id());

        let mut bvh = AdaptivePeriodicBvh::default();
        bvh.rebuild_index(&state, scenario.arena_size);
        let (actual, _) = build_generic_routes(&bvh, &state, &ranges, scenario.arena_size);
        assert_eq!(actual, expected, "bvh large-boundary mismatch {}", range_case.id());

        println!("large_boundary_full_exact,{},{}", range_case.id(), n);
    }
}

fn links_count(routes: &[Vec<usize>]) -> usize {
    routes.iter().map(Vec::len).sum()
}

fn print_profile(
    strategy: &str,
    scenario: &Scenario,
    max_range: f64,
    rebuild_ms: f64,
    route_ms: f64,
    index_entries: usize,
    directed_links: usize,
) {
    println!(
        "profile,{},{},{},{:.6},{},{},{:.6},{:.6},{:.6},{:.6},{},{:.6}",
        strategy,
        scenario.id,
        scenario.agents,
        scenario.density,
        scenario.distribution.id(),
        scenario.range_case.id(),
        max_range,
        rebuild_ms,
        route_ms,
        rebuild_ms + route_ms,
        index_entries,
        directed_links as f64 / scenario.agents.max(1) as f64,
    );
}

fn profile_faithful(scenario: &Scenario, state: &[AgentPhysicalState], ranges: &[f64]) {
    let max_range = ranges.iter().copied().fold(0.0_f64, f64::max);
    let mut grid = FaithfulArgosRabGrid::default();
    let rebuild_ms = median_ms(|| grid.rebuild(black_box(state), black_box(ranges), scenario.arena_size));
    grid.rebuild(state, ranges, scenario.arena_size);

    let mut last_stats = RabRouteStats::default();
    let route_ms = median_ms(|| {
        let (routes, stats) = grid.build_routes_with_stats(
            black_box(state),
            black_box(ranges),
            scenario.arena_size,
        );
        black_box(links_count(&routes));
        last_stats = stats;
    });

    print_profile(
        "faithful-argos-rab",
        scenario,
        max_range,
        rebuild_ms,
        route_ms,
        grid.index_entries(),
        last_stats.directed_links,
    );
    println!(
        "diag_argos,{},{},{},{},{},{},{}",
        scenario.id,
        last_stats.receiver_point_lookups,
        last_stats.raw_bucket_entries,
        last_stats.pair_references,
        last_stats.duplicate_pair_references,
        last_stats.exact_pair_distance_checks,
        last_stats.directed_links,
    );
}

fn profile_generic<I: GenericRabIndex>(
    index: &mut I,
    scenario: &Scenario,
    state: &[AgentPhysicalState],
    ranges: &[f64],
) {
    let max_range = ranges.iter().copied().fold(0.0_f64, f64::max);
    let rebuild_ms = median_ms(|| index.rebuild_index(black_box(state), scenario.arena_size));
    index.rebuild_index(state, scenario.arena_size);

    let mut last_stats = GenericRouteStats::default();
    let route_ms = median_ms(|| {
        let (routes, stats) = build_generic_routes(index, black_box(state), black_box(ranges), scenario.arena_size);
        black_box(links_count(&routes));
        last_stats = stats;
    });

    print_profile(
        index.id(),
        scenario,
        max_range,
        rebuild_ms,
        route_ms,
        index.index_entries(state.len()),
        last_stats.directed_links,
    );
    println!(
        "diag_generic,{},{},{},{},{},{},{},{},{}",
        index.id(),
        scenario.id,
        last_stats.receiver_queries,
        last_stats.max_range_candidates,
        last_stats.final_range_checks,
        last_stats.lookup_units,
        last_stats.internal_candidate_checks,
        last_stats.diag_supported,
        last_stats.directed_links,
    );
}

fn main() {
    let matrix: Matrix = serde_json::from_str(MATRIX_JSON).expect("parse neighbour-search matrix");
    assert_eq!(matrix.version, 1);
    let panel = build_panel(&matrix);

    println!("vlab_rab_strategy_comparison_version=1");
    println!("semantic_target=directed-transmitter-owned-range-relation");
    println!("generic_adapter=query-at-max-transmitter-range-then-exact-filter-by-transmitter-range");
    println!("range_workloads=equal-1;heterogeneous-0.25-1-4;heterogeneous-0.1-1-10");
    println!("panel_scenarios={}", panel.len());
    println!("profile_schema=profile,strategy,scenario,N,density,distribution,range_case,max_range,rebuild_ms,route_ms,total_ms,index_entries,avg_directed_links_per_receiver");
    println!("diag_argos_schema=diag_argos,scenario,receiver_point_lookups,raw_bucket_entries,pair_references,duplicate_pair_references,exact_pair_distance_checks,directed_links");
    println!("diag_generic_schema=diag_generic,strategy,scenario,receiver_queries,max_range_candidates,final_range_checks,lookup_units,internal_candidate_checks,diag_supported,directed_links");

    validate_large_boundary_full();
    println!("large_boundary_full_validation=pass");

    for (index, scenario) in panel.iter().enumerate() {
        println!("scenario_begin,{}/{},{}", index + 1, panel.len(), scenario.id);
        let state = state_for(scenario);
        let ranges = transmitter_ranges(scenario.range_case, state.len());
        validate_case(scenario, &state, &ranges);
        println!("exactness=pass,{}", scenario.id);

        profile_faithful(scenario, &state, &ranges);
        let mut current = PeriodicGridNeighbourIndex::default();
        profile_generic(&mut current, scenario, &state, &ranges);
        let mut multi = MultiResolutionPeriodicGrid::default();
        profile_generic(&mut multi, scenario, &state, &ranges);
        let mut bvh = AdaptivePeriodicBvh::default();
        profile_generic(&mut bvh, scenario, &state, &ranges);

        println!("scenario_end,{}", scenario.id);
    }

    println!("validation=all-compared-strategies-match-transmitter-range-oracle");
    println!("production_change=none");
}
