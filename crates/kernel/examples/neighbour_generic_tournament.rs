mod adaptive_periodic_bvh;
mod multi_resolution_periodic_grid;

use std::collections::{BTreeSet, HashMap};
use std::hint::black_box;
use std::time::Instant;

use adaptive_periodic_bvh::AdaptivePeriodicBvh;
use multi_resolution_periodic_grid::{MultiResolutionPeriodicGrid, RadiusMatchedGridReference};
use serde::Deserialize;
use vlab_kernel::{
    AgentPhysicalState, BruteForceNeighbourIndex, ControllerRuntime, LocalCentroidProbeController,
    LocalObservationModel, NeighbourIndex, ObservationModel, PeriodicGridNeighbourIndex, Vec2,
};

const MATRIX_JSON: &str = include_str!("../../../benchmarks/neighbour_search_matrix.json");
const CLUSTER_FRACTION: f64 = 0.8;
const CLUSTER_SPAN_FRACTION: f64 = 0.2;
const BOUNDARY_OFFSET_FRACTION: f64 = 0.01;
const DIAGNOSTIC_PROBES: usize = 64;
const EXACTNESS_PROBES: usize = 9;

#[derive(Debug, Deserialize)]
struct Matrix {
    version: u32,
    seed: u64,
    full_tournament_axes: FullTournamentAxes,
    ci_smoke_scenarios: Vec<SmokeScenario>,
}

#[derive(Debug, Deserialize)]
struct FullTournamentAxes {
    agent_counts: Vec<usize>,
    densities: Vec<f64>,
    radius_sets: Vec<Vec<f64>>,
    distributions: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct SmokeScenario {
    id: String,
    agents: usize,
    arena_size: f64,
    radii: Vec<f64>,
    distribution: SmokeDistribution,
}

#[derive(Debug, Deserialize, Clone, Copy)]
#[serde(tag = "kind", rename_all = "kebab-case")]
enum SmokeDistribution {
    UniformGrid,
    Clustered {
        cluster_fraction: f64,
        cluster_span_fraction: f64,
    },
    BoundaryBands {
        band_offset_fraction: f64,
    },
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

#[derive(Clone, Debug)]
struct Scenario {
    id: String,
    agents: usize,
    density: f64,
    arena_size: f64,
    radii: Vec<f64>,
    distribution: Distribution,
}

trait BenchIndex: NeighbourIndex {
    fn strategy_id(&self) -> &'static str;
    fn index_entries(&self, agent_count: usize) -> usize;
}

impl BenchIndex for PeriodicGridNeighbourIndex {
    fn strategy_id(&self) -> &'static str { "current-periodic-grid" }
    fn index_entries(&self, agent_count: usize) -> usize { agent_count }
}

impl NeighbourIndex for MultiResolutionPeriodicGrid {
    fn rebuild(&mut self, state: &[AgentPhysicalState], arena_size: f64) {
        MultiResolutionPeriodicGrid::rebuild(self, state, arena_size);
    }

    fn query(
        &self,
        state: &[AgentPhysicalState],
        agent_index: usize,
        radius: f64,
        arena_size: f64,
        out: &mut Vec<usize>,
    ) {
        MultiResolutionPeriodicGrid::query(self, state, agent_index, radius, arena_size, out);
    }
}

impl BenchIndex for MultiResolutionPeriodicGrid {
    fn strategy_id(&self) -> &'static str { "multi-resolution-periodic-grid" }
    fn index_entries(&self, _agent_count: usize) -> usize { MultiResolutionPeriodicGrid::index_entries(self) }
}

impl NeighbourIndex for AdaptivePeriodicBvh {
    fn rebuild(&mut self, state: &[AgentPhysicalState], arena_size: f64) {
        AdaptivePeriodicBvh::rebuild(self, state, arena_size);
    }

    fn query(
        &self,
        state: &[AgentPhysicalState],
        agent_index: usize,
        radius: f64,
        arena_size: f64,
        out: &mut Vec<usize>,
    ) {
        AdaptivePeriodicBvh::query(self, state, agent_index, radius, arena_size, out);
    }
}

impl BenchIndex for AdaptivePeriodicBvh {
    fn strategy_id(&self) -> &'static str { "adaptive-periodic-bvh" }
    fn index_entries(&self, _agent_count: usize) -> usize { AdaptivePeriodicBvh::index_entries(self) }
}

#[derive(Clone, Copy, Debug, Default)]
struct CurrentQueryStats {
    visited_cells: usize,
    candidate_checks: usize,
}

#[derive(Clone, Debug, Default)]
struct InstrumentedCurrentGrid {
    arena_size: f64,
    cells_per_axis: usize,
    cell_size: f64,
    buckets: HashMap<(usize, usize), Vec<usize>>,
}

impl InstrumentedCurrentGrid {
    fn rebuild(&mut self, state: &[AgentPhysicalState], arena_size: f64) {
        self.arena_size = arena_size;
        self.cells_per_axis = (state.len().max(1) as f64).sqrt().ceil() as usize;
        self.cell_size = arena_size / self.cells_per_axis as f64;
        self.buckets.clear();
        self.buckets.reserve(state.len());
        for (index, agent) in state.iter().enumerate() {
            let cell = self.cell_of(agent.position);
            self.buckets.entry(cell).or_default().push(index);
        }
    }

    fn cell_coordinate(&self, value: f64) -> usize {
        let wrapped = wrap_coordinate(value, self.arena_size);
        let normalized = (wrapped + self.arena_size / 2.0) / self.arena_size;
        let index = (normalized * self.cells_per_axis as f64).floor() as usize;
        index.min(self.cells_per_axis - 1)
    }

    fn cell_of(&self, position: Vec2) -> (usize, usize) {
        (self.cell_coordinate(position.x), self.cell_coordinate(position.y))
    }

    fn axis_cells(&self, center: usize, span: usize, out: &mut Vec<usize>) {
        out.clear();
        let count = self.cells_per_axis;
        if span >= count / 2 {
            out.extend(0..count);
            return;
        }
        let count_signed = count as isize;
        for offset in -(span as isize)..=(span as isize) {
            out.push((center as isize + offset).rem_euclid(count_signed) as usize);
        }
    }

    fn query_with_stats(
        &self,
        state: &[AgentPhysicalState],
        agent_index: usize,
        radius: f64,
        arena_size: f64,
        out: &mut Vec<usize>,
    ) -> CurrentQueryStats {
        out.clear();
        let origin = state[agent_index].position;
        let (cx, cy) = self.cell_of(origin);
        let span = (radius / self.cell_size).ceil() as usize;
        let radius2 = radius * radius;
        let mut xs = Vec::new();
        let mut ys = Vec::new();
        self.axis_cells(cx, span, &mut xs);
        self.axis_cells(cy, span, &mut ys);
        let mut candidate_checks = 0usize;
        for &y in &ys {
            for &x in &xs {
                if let Some(candidates) = self.buckets.get(&(x, y)) {
                    for &candidate in candidates {
                        if candidate == agent_index { continue; }
                        candidate_checks += 1;
                        let delta = minimum_image(state[candidate].position - origin, arena_size);
                        if delta.norm_squared() <= radius2 {
                            out.push(candidate);
                        }
                    }
                }
            }
        }
        out.sort_unstable();
        CurrentQueryStats { visited_cells: xs.len() * ys.len(), candidate_checks }
    }
}

fn median_ms(repetitions: usize, mut f: impl FnMut()) -> f64 {
    assert!(repetitions > 0 && repetitions % 2 == 1);
    let mut samples = Vec::with_capacity(repetitions);
    for _ in 0..repetitions {
        let started = Instant::now();
        f();
        samples.push(started.elapsed().as_secs_f64() * 1000.0);
    }
    samples.sort_by(|a, b| a.total_cmp(b));
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
            AgentPhysicalState { position, heading_angle: (i % 64) as f64 * 0.03125 }
        })
        .collect()
}

fn smoke_state(scenario: &SmokeScenario) -> Vec<AgentPhysicalState> {
    match scenario.distribution {
        SmokeDistribution::UniformGrid => uniform_grid(scenario.agents, scenario.arena_size),
        SmokeDistribution::Clustered { cluster_fraction, cluster_span_fraction } => {
            clustered(scenario.agents, scenario.arena_size, cluster_fraction, cluster_span_fraction)
        }
        SmokeDistribution::BoundaryBands { band_offset_fraction } => {
            boundary_bands(scenario.agents, scenario.arena_size, band_offset_fraction)
        }
    }
}

fn tournament_state(scenario: &Scenario) -> Vec<AgentPhysicalState> {
    match scenario.distribution {
        Distribution::Uniform => uniform_grid(scenario.agents, scenario.arena_size),
        Distribution::Clustered => clustered(
            scenario.agents,
            scenario.arena_size,
            CLUSTER_FRACTION,
            CLUSTER_SPAN_FRACTION,
        ),
        Distribution::BoundaryBands => boundary_bands(
            scenario.agents,
            scenario.arena_size,
            BOUNDARY_OFFSET_FRACTION,
        ),
    }
}

fn density_label(density: f64) -> String {
    let text = format!("{density:g}");
    text.replace('.', "p")
}

fn radius_set_label(radii: &[f64]) -> String {
    if radii.len() == 1 {
        "single".to_owned()
    } else if radii.iter().copied().fold(0.0_f64, f64::max)
        / radii.iter().copied().fold(f64::INFINITY, f64::min) >= 50.0
    {
        "wide".to_owned()
    } else {
        "multi".to_owned()
    }
}

fn add_scenario(
    out: &mut Vec<Scenario>,
    seen: &mut BTreeSet<String>,
    agents: usize,
    density: f64,
    radii: &[f64],
    distribution: Distribution,
) {
    let id = format!(
        "n{}-d{}-{}-{}",
        agents,
        density_label(density),
        distribution.id(),
        radius_set_label(radii),
    );
    if !seen.insert(id.clone()) { return; }
    out.push(Scenario {
        id,
        agents,
        density,
        arena_size: (agents as f64 / density).sqrt(),
        radii: radii.to_vec(),
        distribution,
    });
}

fn build_tournament_panel(matrix: &Matrix) -> Vec<Scenario> {
    let axes = &matrix.full_tournament_axes;
    for required in [100usize, 1000, 5000, 10000, 25000] {
        assert!(axes.agent_counts.contains(&required), "missing frozen N={required}");
    }
    for required in [0.25, 1.0, 4.0, 16.0] {
        assert!(axes.densities.iter().any(|&d| d == required), "missing frozen density={required}");
    }
    assert_eq!(axes.radius_sets.len(), 3, "expected frozen single/moderate/wide radius sets");
    let distributions: BTreeSet<&str> = axes.distributions.iter().map(String::as_str).collect();
    for required in ["uniform-grid", "clustered", "boundary-bands"] {
        assert!(distributions.contains(required), "missing distribution {required}");
    }

    let mut panel = Vec::new();
    let mut seen = BTreeSet::new();

    // N scaling: all three radius regimes at density 1, uniform occupancy.
    for &agents in &axes.agent_counts {
        for radii in &axes.radius_sets {
            add_scenario(&mut panel, &mut seen, agents, 1.0, radii, Distribution::Uniform);
        }
    }

    // Density crossover: N=5000, all radius regimes across all frozen densities.
    for &density in &axes.densities {
        for radii in &axes.radius_sets {
            add_scenario(&mut panel, &mut seen, 5000, density, radii, Distribution::Uniform);
        }
    }

    // Occupancy crossover: N=5000, density 1, all radius regimes.
    for distribution in [Distribution::Clustered, Distribution::BoundaryBands] {
        for radii in &axes.radius_sets {
            add_scenario(&mut panel, &mut seen, 5000, 1.0, radii, distribution);
        }
    }

    // Large non-uniform stress: N=25000, density 1, moderate and wide radius sets.
    for distribution in [Distribution::Clustered, Distribution::BoundaryBands] {
        for radii in axes.radius_sets.iter().skip(1) {
            add_scenario(&mut panel, &mut seen, 25000, 1.0, radii, distribution);
        }
    }

    assert_eq!(panel.len(), 34, "unexpected curated tournament panel size");
    panel
}

fn probe_indices(count: usize, requested: usize) -> Vec<usize> {
    if count == 0 { return Vec::new(); }
    let target = requested.min(count);
    let mut set = BTreeSet::new();
    if target == 1 {
        set.insert(0);
    } else {
        for i in 0..target {
            set.insert(i * (count - 1) / (target - 1));
        }
    }
    set.into_iter().collect()
}

fn assert_sorted(values: &[usize]) {
    assert!(values.windows(2).all(|w| w[0] < w[1]), "neighbour output must be strictly sorted");
}

fn validate_smoke_exactness(matrix: &Matrix) {
    let oracle = BruteForceNeighbourIndex;
    for scenario in &matrix.ci_smoke_scenarios {
        let state = smoke_state(scenario);
        let mut current = PeriodicGridNeighbourIndex::default();
        let mut current_diag = InstrumentedCurrentGrid::default();
        let mut multi = MultiResolutionPeriodicGrid::default();
        let mut bvh = AdaptivePeriodicBvh::default();
        current.rebuild(&state, scenario.arena_size);
        current_diag.rebuild(&state, scenario.arena_size);
        multi.rebuild(&state, scenario.arena_size);
        bvh.rebuild(&state, scenario.arena_size);
        let hierarchy_before = multi.level_geometry();
        let mut expected = Vec::new();
        let mut actual = Vec::new();
        let mut reference = RadiusMatchedGridReference::default();

        for &radius in &scenario.radii {
            reference.rebuild_for_radius(&state, scenario.arena_size, radius);
            for agent in 0..state.len() {
                oracle.query(&state, agent, radius, scenario.arena_size, &mut expected);
                assert_sorted(&expected);

                current.query(&state, agent, radius, scenario.arena_size, &mut actual);
                assert_eq!(actual, expected, "current smoke mismatch {} r={} a={}", scenario.id, radius, agent);

                current_diag.query_with_stats(&state, agent, radius, scenario.arena_size, &mut actual);
                assert_eq!(actual, expected, "instrumented-current smoke mismatch {} r={} a={}", scenario.id, radius, agent);

                multi.query(&state, agent, radius, scenario.arena_size, &mut actual);
                assert_eq!(actual, expected, "multi smoke mismatch {} r={} a={}", scenario.id, radius, agent);

                bvh.query(&state, agent, radius, scenario.arena_size, &mut actual);
                assert_eq!(actual, expected, "bvh smoke mismatch {} r={} a={}", scenario.id, radius, agent);

                reference.query_with_stats(&state, agent, radius, scenario.arena_size, &mut actual);
                assert_eq!(actual, expected, "reference smoke mismatch {} r={} a={}", scenario.id, radius, agent);
            }
            assert_eq!(multi.level_geometry(), hierarchy_before, "query radius mutated hierarchy geometry");
        }
        println!("smoke_exact,{},agents={},radii={}", scenario.id, state.len(), scenario.radii.len());
    }
}

fn validate_large_state_probes(scenario: &Scenario, state: &[AgentPhysicalState]) {
    let oracle = BruteForceNeighbourIndex;
    let probes = if state.len() <= 1000 {
        (0..state.len()).collect::<Vec<_>>()
    } else {
        probe_indices(state.len(), EXACTNESS_PROBES)
    };
    let mut current = PeriodicGridNeighbourIndex::default();
    let mut current_diag = InstrumentedCurrentGrid::default();
    let mut multi = MultiResolutionPeriodicGrid::default();
    let mut bvh = AdaptivePeriodicBvh::default();
    current.rebuild(state, scenario.arena_size);
    current_diag.rebuild(state, scenario.arena_size);
    multi.rebuild(state, scenario.arena_size);
    bvh.rebuild(state, scenario.arena_size);
    let hierarchy_before = multi.level_geometry();
    let mut expected = Vec::new();
    let mut actual = Vec::new();
    let mut reference = RadiusMatchedGridReference::default();

    for &radius in &scenario.radii {
        reference.rebuild_for_radius(state, scenario.arena_size, radius);
        for &agent in &probes {
            oracle.query(state, agent, radius, scenario.arena_size, &mut expected);
            current.query(state, agent, radius, scenario.arena_size, &mut actual);
            assert_eq!(actual, expected, "current large-probe mismatch {} r={} a={}", scenario.id, radius, agent);
            current_diag.query_with_stats(state, agent, radius, scenario.arena_size, &mut actual);
            assert_eq!(actual, expected, "instrumented-current large-probe mismatch {} r={} a={}", scenario.id, radius, agent);
            multi.query(state, agent, radius, scenario.arena_size, &mut actual);
            assert_eq!(actual, expected, "multi large-probe mismatch {} r={} a={}", scenario.id, radius, agent);
            bvh.query(state, agent, radius, scenario.arena_size, &mut actual);
            assert_eq!(actual, expected, "bvh large-probe mismatch {} r={} a={}", scenario.id, radius, agent);
            reference.query_with_stats(state, agent, radius, scenario.arena_size, &mut actual);
            assert_eq!(actual, expected, "reference large-probe mismatch {} r={} a={}", scenario.id, radius, agent);
        }
        assert_eq!(multi.level_geometry(), hierarchy_before, "large probe query mutated hierarchy geometry");
    }
    println!("large_probe_exact,{},queries={}", scenario.id, probes.len() * scenario.radii.len());
}

#[derive(Clone, Copy, Debug)]
struct ProfileResult {
    rebuild_ms: f64,
    query_ms: f64,
    avg_neighbours: f64,
    index_entries: usize,
}

fn profile_generic<I: BenchIndex>(index: &mut I, scenario: &Scenario, state: &[AgentPhysicalState]) -> ProfileResult {
    let repetitions = 3;
    let rebuild_ms = median_ms(repetitions, || {
        index.rebuild(black_box(state), scenario.arena_size);
    });
    index.rebuild(state, scenario.arena_size);
    let entries = index.index_entries(state.len());
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
    let queries = state.len() * scenario.radii.len();
    let avg_neighbours = accepted as f64 / queries as f64;
    let total_ms = rebuild_ms + query_ms;
    println!(
        "profile,{},{},{},{:.6},{},\"{}\",{:.6},{:.6},{:.6},{:.3},{},{:.6}",
        index.strategy_id(),
        scenario.id,
        scenario.agents,
        scenario.density,
        scenario.distribution.id(),
        radii_string(&scenario.radii),
        rebuild_ms,
        query_ms,
        total_ms,
        1000.0 / total_ms,
        entries,
        avg_neighbours,
    );
    ProfileResult { rebuild_ms, query_ms, avg_neighbours, index_entries: entries }
}

fn profile_radius_reference(scenario: &Scenario, state: &[AgentPhysicalState]) -> ProfileResult {
    let repetitions = 3;
    let rebuild_ms = median_ms(repetitions, || {
        let mut refs = Vec::with_capacity(scenario.radii.len());
        for &radius in &scenario.radii {
            let mut reference = RadiusMatchedGridReference::default();
            reference.rebuild_for_radius(black_box(state), scenario.arena_size, radius);
            refs.push(reference);
        }
        black_box(refs.len());
    });

    let refs = scenario.radii.iter().map(|&radius| {
        let mut reference = RadiusMatchedGridReference::default();
        reference.rebuild_for_radius(state, scenario.arena_size, radius);
        reference
    }).collect::<Vec<_>>();

    let mut accepted = 0usize;
    let query_ms = median_ms(repetitions, || {
        let mut out = Vec::new();
        let mut total = 0usize;
        for (radius_index, &radius) in scenario.radii.iter().enumerate() {
            for agent in 0..state.len() {
                refs[radius_index].query_with_stats(state, agent, radius, scenario.arena_size, &mut out);
                total += out.len();
            }
        }
        accepted = total;
        black_box(total);
    });
    let queries = state.len() * scenario.radii.len();
    let avg_neighbours = accepted as f64 / queries as f64;
    let entries = state.len() * refs.len();
    let total_ms = rebuild_ms + query_ms;
    println!(
        "profile,radius-matched-reference-set,{},{},{:.6},{},\"{}\",{:.6},{:.6},{:.6},{:.3},{},{:.6}",
        scenario.id,
        scenario.agents,
        scenario.density,
        scenario.distribution.id(),
        radii_string(&scenario.radii),
        rebuild_ms,
        query_ms,
        total_ms,
        1000.0 / total_ms,
        entries,
        avg_neighbours,
    );
    ProfileResult { rebuild_ms, query_ms, avg_neighbours, index_entries: entries }
}

fn radii_string(radii: &[f64]) -> String {
    radii.iter().map(|r| format!("{r:.6}")).collect::<Vec<_>>().join(";")
}

fn diagnostic_probes(state_len: usize) -> Vec<usize> {
    probe_indices(state_len, DIAGNOSTIC_PROBES)
}

fn profile_diagnostics(scenario: &Scenario, state: &[AgentPhysicalState]) {
    let probes = diagnostic_probes(state.len());
    let mut current = InstrumentedCurrentGrid::default();
    let mut multi = MultiResolutionPeriodicGrid::default();
    let mut bvh = AdaptivePeriodicBvh::default();
    current.rebuild(state, scenario.arena_size);
    multi.rebuild(state, scenario.arena_size);
    bvh.rebuild(state, scenario.arena_size);

    for &radius in &scenario.radii {
        let mut reference = RadiusMatchedGridReference::default();
        reference.rebuild_for_radius(state, scenario.arena_size, radius);
        let mut out = Vec::new();

        let mut current_regions = 0usize;
        let mut current_candidates = 0usize;
        let mut multi_regions = 0usize;
        let mut multi_candidates = 0usize;
        let mut bvh_regions = 0usize;
        let mut bvh_candidates = 0usize;
        let mut reference_regions = 0usize;
        let mut reference_candidates = 0usize;
        let mut selected_level = None;

        for &agent in &probes {
            let s = current.query_with_stats(state, agent, radius, scenario.arena_size, &mut out);
            current_regions += s.visited_cells;
            current_candidates += s.candidate_checks;

            let s = multi.query_with_stats(state, agent, radius, scenario.arena_size, &mut out);
            multi_regions += s.visited_cells;
            multi_candidates += s.candidate_checks;
            selected_level.get_or_insert(s.level_index);

            let s = bvh.query_with_stats(state, agent, radius, scenario.arena_size, &mut out);
            bvh_regions += s.visited_nodes;
            bvh_candidates += s.candidate_checks;

            let s = reference.query_with_stats(state, agent, radius, scenario.arena_size, &mut out);
            reference_regions += s.visited_cells;
            reference_candidates += s.candidate_checks;
        }

        let q = probes.len() as f64;
        println!("diagnostic,current-periodic-grid,{},{:.6},{},{:.3},{:.3},{}", scenario.id, radius, probes.len(), current_regions as f64 / q, current_candidates as f64 / q, state.len());
        println!("diagnostic,multi-resolution-periodic-grid,{},{:.6},{},{:.3},{:.3},{};level={}", scenario.id, radius, probes.len(), multi_regions as f64 / q, multi_candidates as f64 / q, multi.index_entries(), selected_level.unwrap_or(0));
        println!("diagnostic,adaptive-periodic-bvh,{},{:.6},{},{:.3},{:.3},{};depth={}", scenario.id, radius, probes.len(), bvh_regions as f64 / q, bvh_candidates as f64 / q, bvh.index_entries(), bvh.max_depth());
        println!("diagnostic,radius-matched-reference-set,{},{:.6},{},{:.3},{:.3},{};cells={}", scenario.id, radius, probes.len(), reference_regions as f64 / q, reference_candidates as f64 / q, state.len(), reference.cells_per_axis());
    }
}

fn is_control_anchor(scenario: &Scenario) -> bool {
    let moderate = scenario.radii == vec![0.25, 1.0, 4.0];
    let wide = scenario.radii == vec![0.1, 1.0, 10.0];
    (scenario.agents == 1000 && scenario.density == 1.0 && scenario.distribution == Distribution::Uniform && moderate)
        || (scenario.agents == 5000 && scenario.density == 1.0 && scenario.distribution == Distribution::Uniform && wide)
        || (scenario.agents == 5000 && scenario.density == 1.0 && scenario.distribution == Distribution::Clustered && moderate)
        || (scenario.agents == 5000 && scenario.density == 1.0 && scenario.distribution == Distribution::BoundaryBands && moderate)
}

fn profile_control_path<I: BenchIndex>(index: &mut I, scenario: &Scenario, state: &[AgentPhysicalState]) {
    let repetitions = 3;
    let ms = median_ms(repetitions, || {
        index.rebuild(state, scenario.arena_size);
        let observation_model = LocalObservationModel;
        let mut controller = LocalCentroidProbeController::new(1.0, 0.01, 0.1);
        controller.reset(state.len());
        let mut checksum = 0.0_f64;
        for &radius in &scenario.radii {
            for agent in 0..state.len() {
                let observation = observation_model.observe(state, agent, index, radius, scenario.arena_size, 0.0);
                let action = controller.step(agent, &observation);
                checksum += action.forward * 0.5 + action.turning * 0.25;
            }
        }
        black_box(checksum);
    });
    println!("control_path,{},{},{:.6},{:.3}", index.strategy_id(), scenario.id, ms, 1000.0 / ms);
}

fn minimum_image_component(delta: f64, arena_size: f64) -> f64 {
    delta - arena_size * (delta / arena_size).round()
}

fn minimum_image(delta: Vec2, arena_size: f64) -> Vec2 {
    Vec2::new(
        minimum_image_component(delta.x, arena_size),
        minimum_image_component(delta.y, arena_size),
    )
}

fn wrap_coordinate(value: f64, arena_size: f64) -> f64 {
    let half = arena_size / 2.0;
    if value >= -half && value < half {
        value
    } else {
        (value + half).rem_euclid(arena_size) - half
    }
}

fn main() {
    let matrix: Matrix = serde_json::from_str(MATRIX_JSON).expect("parse frozen neighbour-search matrix");
    assert_eq!(matrix.version, 1);
    assert!(matrix.seed > 0);
    let panel = build_tournament_panel(&matrix);

    println!("vlab_generic_neighbour_tournament_version=1");
    println!("matrix_version={}", matrix.version);
    println!("matrix_seed={}", matrix.seed);
    println!("panel_scenarios={}", panel.len());
    println!("correctness=full-frozen-smoke-plus-full-N<=1000-and-9-deterministic-probes-for-larger-scaling-states");
    println!("profile_schema=row_type,strategy,scenario,N,density,distribution,radii,rebuild_median_ms,query_all_radii_median_ms,total_ms,neighbour_phase_updates_per_sec,index_entries,avg_neighbours");
    println!("diagnostic_schema=row_type,strategy,scenario,radius,probe_queries,avg_regions_visited,avg_candidate_checks,index_entries;aux");
    println!("control_path_schema=row_type,strategy,scenario,existing-observation-controller-path-median_ms,updates_per_sec");
    println!("reference_note=radius-matched-reference-set-prebuilds-one-grid-per-radius-and-is-not-an-admissible-general-multi-radius-backend");
    println!("runtime_note=browser-production-end-to-end-comparison-is-not-applicable-before-#178-because-#176-forbids-integrating-a-candidate-into-production");

    validate_smoke_exactness(&matrix);
    println!("smoke_validation=all-finalists-match-brute-force-for-every-agent-and-radius");

    for (scenario_index, scenario) in panel.iter().enumerate() {
        println!("scenario_begin,{}/{},{}", scenario_index + 1, panel.len(), scenario.id);
        let state = tournament_state(scenario);
        assert_eq!(state.len(), scenario.agents);
        validate_large_state_probes(scenario, &state);

        let mut current = PeriodicGridNeighbourIndex::default();
        let current_result = profile_generic(&mut current, scenario, &state);
        let mut multi = MultiResolutionPeriodicGrid::default();
        let multi_result = profile_generic(&mut multi, scenario, &state);
        let mut bvh = AdaptivePeriodicBvh::default();
        let bvh_result = profile_generic(&mut bvh, scenario, &state);
        let reference_result = profile_radius_reference(scenario, &state);

        assert!((current_result.avg_neighbours - multi_result.avg_neighbours).abs() < 1e-12);
        assert!((current_result.avg_neighbours - bvh_result.avg_neighbours).abs() < 1e-12);
        assert!((current_result.avg_neighbours - reference_result.avg_neighbours).abs() < 1e-12);
        assert!(current_result.index_entries > 0 && multi_result.index_entries > 0 && bvh_result.index_entries > 0);

        profile_diagnostics(scenario, &state);

        if is_control_anchor(scenario) {
            let mut current = PeriodicGridNeighbourIndex::default();
            profile_control_path(&mut current, scenario, &state);
            let mut multi = MultiResolutionPeriodicGrid::default();
            profile_control_path(&mut multi, scenario, &state);
            let mut bvh = AdaptivePeriodicBvh::default();
            profile_control_path(&mut bvh, scenario, &state);
        }
        println!("scenario_end,{}", scenario.id);
    }

    println!("tournament_validation=all-measured-strategies-passed-required-exactness-gates");
    println!("production_change=none");
}
