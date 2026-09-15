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
const EXACTNESS_PROBES: usize = 9;
const DIAGNOSTIC_PROBES: usize = 64;

#[derive(Debug, Deserialize)]
struct Matrix {
    version: u32,
    seed: u64,
    full_tournament_axes: FullAxes,
    ci_smoke_scenarios: Vec<SmokeScenario>,
}

#[derive(Debug, Deserialize)]
struct FullAxes {
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
    Clustered { cluster_fraction: f64, cluster_span_fraction: f64 },
    BoundaryBands { band_offset_fraction: f64 },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Distribution { Uniform, Clustered, BoundaryBands }
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
    fn id(&self) -> &'static str;
    fn entries(&self, agents: usize) -> usize;
}

impl BenchIndex for PeriodicGridNeighbourIndex {
    fn id(&self) -> &'static str { "current-periodic-grid" }
    fn entries(&self, agents: usize) -> usize { agents }
}

impl NeighbourIndex for MultiResolutionPeriodicGrid {
    fn rebuild(&mut self, state: &[AgentPhysicalState], arena_size: f64) {
        MultiResolutionPeriodicGrid::rebuild(self, state, arena_size)
    }
    fn query(&self, state: &[AgentPhysicalState], agent_index: usize, radius: f64, arena_size: f64, out: &mut Vec<usize>) {
        MultiResolutionPeriodicGrid::query(self, state, agent_index, radius, arena_size, out)
    }
}
impl BenchIndex for MultiResolutionPeriodicGrid {
    fn id(&self) -> &'static str { "multi-resolution-periodic-grid" }
    fn entries(&self, _agents: usize) -> usize { MultiResolutionPeriodicGrid::index_entries(self) }
}

impl NeighbourIndex for AdaptivePeriodicBvh {
    fn rebuild(&mut self, state: &[AgentPhysicalState], arena_size: f64) {
        AdaptivePeriodicBvh::rebuild(self, state, arena_size)
    }
    fn query(&self, state: &[AgentPhysicalState], agent_index: usize, radius: f64, arena_size: f64, out: &mut Vec<usize>) {
        AdaptivePeriodicBvh::query(self, state, agent_index, radius, arena_size, out)
    }
}
impl BenchIndex for AdaptivePeriodicBvh {
    fn id(&self) -> &'static str { "adaptive-periodic-bvh" }
    fn entries(&self, _agents: usize) -> usize { AdaptivePeriodicBvh::index_entries(self) }
}

fn median_ms(mut f: impl FnMut()) -> f64 {
    let mut s = [0.0_f64; 3];
    for sample in &mut s {
        let t = Instant::now();
        f();
        *sample = t.elapsed().as_secs_f64() * 1000.0;
    }
    s.sort_by(|a, b| a.total_cmp(b));
    s[1]
}

fn uniform_grid(n: usize, arena: f64) -> Vec<AgentPhysicalState> {
    let side = (n.max(1) as f64).sqrt().ceil() as usize;
    let spacing = arena / side as f64;
    let half = arena / 2.0;
    (0..n).map(|i| AgentPhysicalState {
        position: Vec2::new(
            -half + ((i % side) as f64 + 0.5) * spacing,
            -half + ((i / side) as f64 + 0.5) * spacing,
        ),
        heading_angle: (i % 64) as f64 * 0.03125,
    }).collect()
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
    for (j, mut a) in uniform_grid(sparse_n, arena).into_iter().enumerate() {
        a.heading_angle = ((dense_n + j) % 64) as f64 * 0.03125;
        state.push(a);
    }
    state
}

fn boundary_bands(n: usize, arena: f64, offset_fraction: f64) -> Vec<AgentPhysicalState> {
    let half = arena / 2.0;
    let offset = arena * offset_fraction;
    let per_side = ((n + 3) / 4).max(1);
    let spacing = arena / per_side as f64;
    (0..n).map(|i| {
        let side = i % 4;
        let slot = i / 4;
        let along = -half + (slot as f64 + 0.5) * spacing;
        let p = match side {
            0 => Vec2::new(-half + offset, along),
            1 => Vec2::new( half - offset, along),
            2 => Vec2::new(along, -half + offset),
            _ => Vec2::new(along,  half - offset),
        };
        AgentPhysicalState { position: p, heading_angle: (i % 64) as f64 * 0.03125 }
    }).collect()
}

fn smoke_state(s: &SmokeScenario) -> Vec<AgentPhysicalState> {
    match s.distribution {
        SmokeDistribution::UniformGrid => uniform_grid(s.agents, s.arena_size),
        SmokeDistribution::Clustered { cluster_fraction, cluster_span_fraction } =>
            clustered(s.agents, s.arena_size, cluster_fraction, cluster_span_fraction),
        SmokeDistribution::BoundaryBands { band_offset_fraction } =>
            boundary_bands(s.agents, s.arena_size, band_offset_fraction),
    }
}

fn state_for(s: &Scenario) -> Vec<AgentPhysicalState> {
    match s.distribution {
        Distribution::Uniform => uniform_grid(s.agents, s.arena_size),
        Distribution::Clustered => clustered(s.agents, s.arena_size, 0.8, 0.2),
        Distribution::BoundaryBands => boundary_bands(s.agents, s.arena_size, 0.01),
    }
}

fn density_label(d: f64) -> String {
    let mut s = format!("{d:.2}");
    while s.ends_with('0') { s.pop(); }
    if s.ends_with('.') { s.pop(); }
    s.replace('.', "p")
}

fn radius_label(r: &[f64]) -> &'static str {
    if r.len() == 1 { return "single"; }
    let min = r.iter().copied().fold(f64::INFINITY, f64::min);
    let max = r.iter().copied().fold(0.0_f64, f64::max);
    if max / min >= 50.0 { "wide" } else { "multi" }
}

fn add(panel: &mut Vec<Scenario>, seen: &mut BTreeSet<String>, n: usize, d: f64, r: &[f64], dist: Distribution) {
    let id = format!("n{}-d{}-{}-{}", n, density_label(d), dist.id(), radius_label(r));
    if seen.insert(id.clone()) {
        panel.push(Scenario {
            id,
            agents: n,
            density: d,
            arena_size: (n as f64 / d).sqrt(),
            radii: r.to_vec(),
            distribution: dist,
        });
    }
}

fn build_panel(m: &Matrix) -> Vec<Scenario> {
    let a = &m.full_tournament_axes;
    for n in [100, 1000, 5000, 10000, 25000] { assert!(a.agent_counts.contains(&n)); }
    for d in [0.25, 1.0, 4.0, 16.0] { assert!(a.densities.contains(&d)); }
    assert_eq!(a.radius_sets.len(), 3);
    let ds: BTreeSet<&str> = a.distributions.iter().map(String::as_str).collect();
    for x in ["uniform-grid", "clustered", "boundary-bands"] { assert!(ds.contains(x)); }

    let mut p = Vec::new();
    let mut seen = BTreeSet::new();
    for &n in &a.agent_counts {
        for r in &a.radius_sets { add(&mut p, &mut seen, n, 1.0, r, Distribution::Uniform); }
    }
    for &d in &a.densities {
        for r in &a.radius_sets { add(&mut p, &mut seen, 5000, d, r, Distribution::Uniform); }
    }
    for dist in [Distribution::Clustered, Distribution::BoundaryBands] {
        for r in &a.radius_sets { add(&mut p, &mut seen, 5000, 1.0, r, dist); }
    }
    for dist in [Distribution::Clustered, Distribution::BoundaryBands] {
        for r in a.radius_sets.iter().skip(1) { add(&mut p, &mut seen, 25000, 1.0, r, dist); }
    }
    assert_eq!(p.len(), 34);
    p
}

fn probe_indices(n: usize, wanted: usize) -> Vec<usize> {
    let k = wanted.min(n);
    if k == 0 { return Vec::new(); }
    if k == 1 { return vec![0]; }
    let mut s = BTreeSet::new();
    for i in 0..k { s.insert(i * (n - 1) / (k - 1)); }
    s.into_iter().collect()
}

fn assert_exact_smoke(m: &Matrix) {
    let oracle = BruteForceNeighbourIndex;
    for s in &m.ci_smoke_scenarios {
        let state = smoke_state(s);
        let mut current = PeriodicGridNeighbourIndex::default();
        let mut multi = MultiResolutionPeriodicGrid::default();
        let mut bvh = AdaptivePeriodicBvh::default();
        current.rebuild(&state, s.arena_size);
        multi.rebuild(&state, s.arena_size);
        bvh.rebuild(&state, s.arena_size);
        let geometry = multi.level_geometry();
        let mut expected = Vec::new();
        let mut actual = Vec::new();
        for &r in &s.radii {
            let mut reference = RadiusMatchedGridReference::default();
            reference.rebuild_for_radius(&state, s.arena_size, r);
            for agent in 0..state.len() {
                oracle.query(&state, agent, r, s.arena_size, &mut expected);
                current.query(&state, agent, r, s.arena_size, &mut actual); assert_eq!(actual, expected);
                multi.query(&state, agent, r, s.arena_size, &mut actual); assert_eq!(actual, expected);
                bvh.query(&state, agent, r, s.arena_size, &mut actual); assert_eq!(actual, expected);
                reference.query_with_stats(&state, agent, r, s.arena_size, &mut actual); assert_eq!(actual, expected);
            }
            assert_eq!(multi.level_geometry(), geometry);
        }
        println!("smoke_exact,{}", s.id);
    }
}

fn assert_exact_probes(s: &Scenario, state: &[AgentPhysicalState]) {
    let probes = if state.len() <= 1000 { (0..state.len()).collect() } else { probe_indices(state.len(), EXACTNESS_PROBES) };
    let oracle = BruteForceNeighbourIndex;
    let mut current = PeriodicGridNeighbourIndex::default();
    let mut multi = MultiResolutionPeriodicGrid::default();
    let mut bvh = AdaptivePeriodicBvh::default();
    current.rebuild(state, s.arena_size);
    multi.rebuild(state, s.arena_size);
    bvh.rebuild(state, s.arena_size);
    let geometry = multi.level_geometry();
    let mut expected = Vec::new();
    let mut actual = Vec::new();
    for &r in &s.radii {
        let mut reference = RadiusMatchedGridReference::default();
        reference.rebuild_for_radius(state, s.arena_size, r);
        for &agent in &probes {
            oracle.query(state, agent, r, s.arena_size, &mut expected);
            current.query(state, agent, r, s.arena_size, &mut actual); assert_eq!(actual, expected);
            multi.query(state, agent, r, s.arena_size, &mut actual); assert_eq!(actual, expected);
            bvh.query(state, agent, r, s.arena_size, &mut actual); assert_eq!(actual, expected);
            reference.query_with_stats(state, agent, r, s.arena_size, &mut actual); assert_eq!(actual, expected);
        }
        assert_eq!(multi.level_geometry(), geometry);
    }
    println!("large_probe_exact,{},{}", s.id, probes.len() * s.radii.len());
}

fn radii_text(r: &[f64]) -> String { r.iter().map(|x| format!("{x:.6}")).collect::<Vec<_>>().join(";") }

fn profile_generic<I: BenchIndex>(idx: &mut I, s: &Scenario, state: &[AgentPhysicalState]) {
    let rebuild = median_ms(|| idx.rebuild(black_box(state), s.arena_size));
    idx.rebuild(state, s.arena_size);
    let entries = idx.entries(state.len());
    let mut neighbours = 0usize;
    let query = median_ms(|| {
        let mut out = Vec::new();
        let mut total = 0usize;
        for &r in &s.radii {
            for agent in 0..state.len() {
                idx.query(state, agent, r, s.arena_size, &mut out);
                total += out.len();
            }
        }
        neighbours = total;
        black_box(total);
    });
    let q = state.len() * s.radii.len();
    let total = rebuild + query;
    println!("profile,{},{},{},{:.6},{},\"{}\",{:.6},{:.6},{:.6},{:.3},{},{:.6}",
        idx.id(), s.id, s.agents, s.density, s.distribution.id(), radii_text(&s.radii),
        rebuild, query, total, 1000.0 / total, entries, neighbours as f64 / q as f64);
}

fn profile_reference(s: &Scenario, state: &[AgentPhysicalState]) {
    let rebuild = median_ms(|| {
        let mut refs = Vec::new();
        for &r in &s.radii {
            let mut x = RadiusMatchedGridReference::default();
            x.rebuild_for_radius(black_box(state), s.arena_size, r);
            refs.push(x);
        }
        black_box(refs.len());
    });
    let refs = s.radii.iter().map(|&r| {
        let mut x = RadiusMatchedGridReference::default();
        x.rebuild_for_radius(state, s.arena_size, r);
        x
    }).collect::<Vec<_>>();
    let mut neighbours = 0usize;
    let query = median_ms(|| {
        let mut out = Vec::new();
        let mut total = 0usize;
        for (ri, &r) in s.radii.iter().enumerate() {
            for agent in 0..state.len() {
                refs[ri].query_with_stats(state, agent, r, s.arena_size, &mut out);
                total += out.len();
            }
        }
        neighbours = total;
        black_box(total);
    });
    let q = state.len() * s.radii.len();
    let total = rebuild + query;
    println!("profile,radius-matched-reference-set,{},{},{:.6},{},\"{}\",{:.6},{:.6},{:.6},{:.3},{},{:.6}",
        s.id, s.agents, s.density, s.distribution.id(), radii_text(&s.radii),
        rebuild, query, total, 1000.0 / total, state.len() * s.radii.len(), neighbours as f64 / q as f64);
}

#[derive(Default)]
struct CurrentDiag {
    arena: f64,
    cells: usize,
    cell: f64,
    buckets: HashMap<(usize, usize), Vec<usize>>,
}
impl CurrentDiag {
    fn rebuild(&mut self, state: &[AgentPhysicalState], arena: f64) {
        self.arena = arena;
        self.cells = (state.len().max(1) as f64).sqrt().ceil() as usize;
        self.cell = arena / self.cells as f64;
        self.buckets.clear();
        for (i, a) in state.iter().enumerate() { self.buckets.entry(self.cell_of(a.position)).or_default().push(i); }
    }
    fn coord(&self, x: f64) -> usize {
        let h = self.arena / 2.0;
        let w = if x >= -h && x < h { x } else { (x + h).rem_euclid(self.arena) - h };
        (((w + h) / self.arena * self.cells as f64).floor() as usize).min(self.cells - 1)
    }
    fn cell_of(&self, p: Vec2) -> (usize, usize) { (self.coord(p.x), self.coord(p.y)) }
    fn axis(&self, c: usize, span: usize) -> Vec<usize> {
        if span >= self.cells / 2 { return (0..self.cells).collect(); }
        let n = self.cells as isize;
        (-(span as isize)..=(span as isize)).map(|o| (c as isize + o).rem_euclid(n) as usize).collect()
    }
    fn stats(&self, state: &[AgentPhysicalState], agent: usize, r: f64, arena: f64) -> (usize, usize) {
        let (cx, cy) = self.cell_of(state[agent].position);
        let span = (r / self.cell).ceil() as usize;
        let xs = self.axis(cx, span);
        let ys = self.axis(cy, span);
        let mut candidates = 0usize;
        for &y in &ys { for &x in &xs {
            if let Some(v) = self.buckets.get(&(x, y)) { candidates += v.len(); }
        }}
        if candidates > 0 { candidates -= 1; }
        let _ = arena;
        (xs.len() * ys.len(), candidates)
    }
}

fn profile_diagnostics(s: &Scenario, state: &[AgentPhysicalState]) {
    let probes = probe_indices(state.len(), DIAGNOSTIC_PROBES);
    let q = probes.len() as f64;
    let mut current = CurrentDiag::default(); current.rebuild(state, s.arena_size);
    let mut multi = MultiResolutionPeriodicGrid::default(); multi.rebuild(state, s.arena_size);
    let mut bvh = AdaptivePeriodicBvh::default(); bvh.rebuild(state, s.arena_size);
    let mut out = Vec::new();
    for &r in &s.radii {
        let mut reference = RadiusMatchedGridReference::default(); reference.rebuild_for_radius(state, s.arena_size, r);
        let mut cr = 0usize; let mut cc = 0usize;
        let mut mr = 0usize; let mut mc = 0usize;
        let mut br = 0usize; let mut bc = 0usize;
        let mut rr = 0usize; let mut rc = 0usize;
        let mut level = 0usize;
        for &a in &probes {
            let (x, y) = current.stats(state, a, r, s.arena_size); cr += x; cc += y;
            let x = multi.query_with_stats(state, a, r, s.arena_size, &mut out); mr += x.visited_cells; mc += x.candidate_checks; level = x.level_index;
            let x = bvh.query_with_stats(state, a, r, s.arena_size, &mut out); br += x.visited_nodes; bc += x.candidate_checks;
            let x = reference.query_with_stats(state, a, r, s.arena_size, &mut out); rr += x.visited_cells; rc += x.candidate_checks;
        }
        println!("diagnostic,current-periodic-grid,{},{:.6},{:.3},{:.3},{}", s.id, r, cr as f64/q, cc as f64/q, state.len());
        println!("diagnostic,multi-resolution-periodic-grid,{},{:.6},{:.3},{:.3},{};level={}", s.id, r, mr as f64/q, mc as f64/q, multi.index_entries(), level);
        println!("diagnostic,adaptive-periodic-bvh,{},{:.6},{:.3},{:.3},{};depth={}", s.id, r, br as f64/q, bc as f64/q, bvh.index_entries(), bvh.max_depth());
        println!("diagnostic,radius-matched-reference-set,{},{:.6},{:.3},{:.3},{};cells={}", s.id, r, rr as f64/q, rc as f64/q, state.len(), reference.cells_per_axis());
    }
}

fn control_anchor(s: &Scenario) -> bool {
    let moderate = s.radii.as_slice() == [0.25, 1.0, 4.0];
    let wide = s.radii.as_slice() == [0.1, 1.0, 10.0];
    (s.agents == 1000 && s.density == 1.0 && s.distribution == Distribution::Uniform && moderate)
        || (s.agents == 5000 && s.density == 1.0 && s.distribution == Distribution::Uniform && wide)
        || (s.agents == 5000 && s.density == 1.0 && s.distribution == Distribution::Clustered && moderate)
        || (s.agents == 5000 && s.density == 1.0 && s.distribution == Distribution::BoundaryBands && moderate)
}

fn profile_control<I: BenchIndex>(idx: &mut I, s: &Scenario, state: &[AgentPhysicalState]) {
    let ms = median_ms(|| {
        idx.rebuild(state, s.arena_size);
        let obs = LocalObservationModel;
        let mut ctl = LocalCentroidProbeController::new(1.0, 0.01, 0.1);
        ctl.reset(state.len());
        let mut checksum = 0.0;
        for &r in &s.radii {
            for a in 0..state.len() {
                let o = obs.observe(state, a, idx, r, s.arena_size, 0.0);
                let action = ctl.step(a, &o);
                checksum += action.forward * 0.5 + action.turning * 0.25;
            }
        }
        black_box(checksum);
    });
    println!("control_path,{},{},{:.6},{:.3}", idx.id(), s.id, ms, 1000.0 / ms);
}

fn main() {
    let matrix: Matrix = serde_json::from_str(MATRIX_JSON).expect("parse frozen matrix");
    assert_eq!(matrix.version, 1);
    assert!(matrix.seed > 0);
    let panel = build_panel(&matrix);

    println!("vlab_generic_neighbour_tournament_version=2");
    println!("panel_scenarios={}", panel.len());
    println!("correctness=exhaustive-frozen-smoke;full-N<=1000-scaling;9-deterministic-brute-force-probes-for-larger-states");
    println!("profile_schema=profile,strategy,scenario,N,density,distribution,radii,rebuild_ms,query_ms,total_ms,neighbour_phase_updates_per_sec,index_entries,avg_neighbours");
    println!("diagnostic_schema=diagnostic,strategy,scenario,radius,avg_regions_visited,avg_candidate_checks,index_entries;aux");
    println!("control_path_schema=control_path,strategy,scenario,existing-observation-controller-path-ms,updates_per_sec");
    println!("reference_note=radius-matched-reference-set-prebuilds-one-radius-specific-grid-per-radius-and-is-not-admissible-as-the-general-backend");
    println!("browser_note=production-browser-cross-strategy-throughput-is-not-applicable-until-#178-integration-because-#176-forbids-a-production-switch");

    assert_exact_smoke(&matrix);
    println!("smoke_validation=pass");

    for (i, s) in panel.iter().enumerate() {
        println!("scenario_begin,{}/{},{}", i + 1, panel.len(), s.id);
        let state = state_for(s);
        assert_exact_probes(s, &state);

        let mut current = PeriodicGridNeighbourIndex::default(); profile_generic(&mut current, s, &state);
        let mut multi = MultiResolutionPeriodicGrid::default(); profile_generic(&mut multi, s, &state);
        let mut bvh = AdaptivePeriodicBvh::default(); profile_generic(&mut bvh, s, &state);
        profile_reference(s, &state);
        profile_diagnostics(s, &state);

        if control_anchor(s) {
            let mut current = PeriodicGridNeighbourIndex::default(); profile_control(&mut current, s, &state);
            let mut multi = MultiResolutionPeriodicGrid::default(); profile_control(&mut multi, s, &state);
            let mut bvh = AdaptivePeriodicBvh::default(); profile_control(&mut bvh, s, &state);
        }
        println!("scenario_end,{}", s.id);
    }
    println!("tournament_validation=pass");
    println!("production_change=none");
}
