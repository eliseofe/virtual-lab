mod adaptive_periodic_bvh;
mod multi_resolution_periodic_grid;

use std::collections::BTreeSet;
use std::hint::black_box;
use std::time::Instant;

use adaptive_periodic_bvh::AdaptivePeriodicBvh;
use multi_resolution_periodic_grid::MultiResolutionPeriodicGrid;
use vlab_kernel::{
    AgentPhysicalState, BruteForceNeighbourIndex, NeighbourIndex,
    PeriodicGridNeighbourIndex, Vec2,
};

const LOW_N: usize = 100;
const HIGH_N: usize = 25_000;
const LOW_LOCAL_DENSITY: f64 = 0.25;
const HIGH_LOCAL_DENSITY: f64 = 16.0;
const ENVIRONMENT_LINEAR_FACTOR: f64 = 4.0;
const SINGLE_RADII: &[f64] = &[1.0];
const WIDE_RADII: &[f64] = &[0.1, 1.0, 10.0];
const HIGH_N_EXACTNESS_PROBES: usize = 17;

#[derive(Clone, Copy, Debug)]
enum Scale { Low, High }
impl Scale {
    fn label(self) -> &'static str { match self { Self::Low => "low", Self::High => "high" } }
    fn n(self) -> usize { match self { Self::Low => LOW_N, Self::High => HIGH_N } }
}

#[derive(Clone, Copy, Debug)]
enum LocalDensity { Low, High }
impl LocalDensity {
    fn label(self) -> &'static str { match self { Self::Low => "low", Self::High => "high" } }
    fn value(self) -> f64 { match self { Self::Low => LOW_LOCAL_DENSITY, Self::High => HIGH_LOCAL_DENSITY } }
}

#[derive(Clone, Copy, Debug)]
enum RadiusWorkload { Single, ManyWide }
impl RadiusWorkload {
    fn label(self) -> &'static str { match self { Self::Single => "single", Self::ManyWide => "many-wide" } }
    fn radii(self) -> &'static [f64] { match self { Self::Single => SINGLE_RADII, Self::ManyWide => WIDE_RADII } }
}

#[derive(Clone, Copy, Debug)]
enum EnvironmentSize { Low, High }
impl EnvironmentSize {
    fn label(self) -> &'static str { match self { Self::Low => "low", Self::High => "high" } }
    fn factor(self) -> f64 { match self { Self::Low => 1.0, Self::High => ENVIRONMENT_LINEAR_FACTOR } }
}

#[derive(Clone, Debug)]
struct Scenario {
    environment: EnvironmentSize,
    scale: Scale,
    local_density: LocalDensity,
    workload: RadiusWorkload,
    n: usize,
    footprint_side: f64,
    arena_side: f64,
    radii: &'static [f64],
}

impl Scenario {
    fn id(&self) -> String {
        format!(
            "env-{}-scale-{}-density-{}-{}",
            self.environment.label(), self.scale.label(), self.local_density.label(), self.workload.label()
        )
    }
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

fn occupied_lattice(n: usize, footprint_side: f64) -> Vec<AgentPhysicalState> {
    let side = (n.max(1) as f64).sqrt().ceil() as usize;
    let spacing = footprint_side / side as f64;
    let half = footprint_side / 2.0;
    (0..n).map(|i| AgentPhysicalState {
        metadata: Default::default(), position: Vec2::new(
            -half + ((i % side) as f64 + 0.5) * spacing,
            -half + ((i / side) as f64 + 0.5) * spacing,
        ),
        heading_angle: (i % 64) as f64 * 0.03125,
    }).collect()
}

fn scenarios() -> Vec<Scenario> {
    let mut out = Vec::with_capacity(16);
    for environment in [EnvironmentSize::Low, EnvironmentSize::High] {
        for scale in [Scale::Low, Scale::High] {
            let n = scale.n();
            let low_density_footprint = (n as f64 / LOW_LOCAL_DENSITY).sqrt();
            let arena_side = low_density_footprint * environment.factor();
            for local_density in [LocalDensity::Low, LocalDensity::High] {
                let footprint_side = (n as f64 / local_density.value()).sqrt();
                assert!(footprint_side <= arena_side + f64::EPSILON * arena_side.max(1.0));
                for workload in [RadiusWorkload::Single, RadiusWorkload::ManyWide] {
                    out.push(Scenario {
                        environment,
                        scale,
                        local_density,
                        workload,
                        n,
                        footprint_side,
                        arena_side,
                        radii: workload.radii(),
                    });
                }
            }
        }
    }
    out
}

fn probe_indices(n: usize, wanted: usize) -> Vec<usize> {
    let k = wanted.min(n);
    if k == 0 { return Vec::new(); }
    if k == 1 { return vec![0]; }
    let mut set = BTreeSet::new();
    for i in 0..k { set.insert(i * (n - 1) / (k - 1)); }
    set.into_iter().collect()
}

fn assert_exact(s: &Scenario, state: &[AgentPhysicalState]) {
    let probes: Vec<usize> = if s.n == LOW_N {
        (0..s.n).collect()
    } else {
        probe_indices(s.n, HIGH_N_EXACTNESS_PROBES)
    };
    let oracle = BruteForceNeighbourIndex;
    let mut current = PeriodicGridNeighbourIndex::default();
    let mut multi = MultiResolutionPeriodicGrid::default();
    let mut bvh = AdaptivePeriodicBvh::default();
    current.rebuild(state, s.arena_side);
    multi.rebuild(state, s.arena_side);
    bvh.rebuild(state, s.arena_side);
    let mut expected = Vec::new();
    let mut actual = Vec::new();
    for &r in s.radii {
        for &agent in &probes {
            oracle.query(state, agent, r, s.arena_side, &mut expected);
            current.query(state, agent, r, s.arena_side, &mut actual);
            assert_eq!(actual, expected, "current mismatch scenario={} agent={} radius={}", s.id(), agent, r);
            multi.query(state, agent, r, s.arena_side, &mut actual);
            assert_eq!(actual, expected, "multi mismatch scenario={} agent={} radius={}", s.id(), agent, r);
            bvh.query(state, agent, r, s.arena_side, &mut actual);
            assert_eq!(actual, expected, "bvh mismatch scenario={} agent={} radius={}", s.id(), agent, r);
        }
    }
    println!("exact,{},probes={},queries={}", s.id(), probes.len(), probes.len() * s.radii.len());
}

fn median_ms(mut f: impl FnMut()) -> f64 {
    let mut samples = [0.0_f64; 3];
    for sample in &mut samples {
        let start = Instant::now();
        f();
        *sample = start.elapsed().as_secs_f64() * 1000.0;
    }
    samples.sort_by(|a, b| a.total_cmp(b));
    samples[1]
}

#[derive(Debug)]
struct ResultRow {
    strategy: &'static str,
    rebuild_ms: f64,
    query_ms: f64,
    combined_ms: f64,
    entries: usize,
    neighbours: usize,
}

fn profile<I: BenchIndex>(mut idx: I, s: &Scenario, state: &[AgentPhysicalState]) -> ResultRow {
    let rebuild_ms = median_ms(|| idx.rebuild(black_box(state), s.arena_side));
    idx.rebuild(state, s.arena_side);
    let entries = idx.entries(state.len());
    let mut neighbours = 0usize;
    let query_ms = median_ms(|| {
        let mut total = 0usize;
        let mut out = Vec::new();
        for &r in s.radii {
            for agent in 0..state.len() {
                idx.query(state, agent, r, s.arena_side, &mut out);
                total += out.len();
            }
        }
        neighbours = total;
        black_box(total);
    });
    ResultRow {
        strategy: idx.id(),
        rebuild_ms,
        query_ms,
        combined_ms: rebuild_ms + query_ms,
        entries,
        neighbours,
    }
}

fn main() {
    println!("environment_size_matrix_version=1");
    println!("dimensions=environment(low:1x-min-low-density-arena,high:4x-linear);scale(low:N100,high:N25000);local_density(low:0.25,high:16);radius(single:[1],many-wide:[0.1,1,10])");
    println!("fixture=centered-uniform-occupied-footprint; environment changes arena extent only; local spacing and radii remain unchanged within each paired cell");
    println!("timing=median-of-3; metric=rebuild+complete-query-phase");
    println!("result,scenario,environment,scale,local_density,workload,n,footprint_side,arena_side,strategy,rebuild_ms,query_ms,combined_ms,entries,neighbours");

    for s in scenarios() {
        let state = occupied_lattice(s.n, s.footprint_side);
        assert_exact(&s, &state);
        let mut rows = vec![
            profile(PeriodicGridNeighbourIndex::default(), &s, &state),
            profile(MultiResolutionPeriodicGrid::default(), &s, &state),
            profile(AdaptivePeriodicBvh::default(), &s, &state),
        ];
        for row in &rows {
            println!(
                "result,{},{},{},{},{},{},{:.6},{:.6},{},{:.6},{:.6},{:.6},{},{}",
                s.id(), s.environment.label(), s.scale.label(), s.local_density.label(), s.workload.label(), s.n,
                s.footprint_side, s.arena_side, row.strategy, row.rebuild_ms, row.query_ms,
                row.combined_ms, row.entries, row.neighbours
            );
        }
        rows.sort_by(|a, b| a.combined_ms.total_cmp(&b.combined_ms));
        let advantage = rows[1].combined_ms / rows[0].combined_ms;
        println!(
            "ranking,{},{},{},{},{},winner={},second={},advantage={:.6}",
            s.id(), s.environment.label(), s.scale.label(), s.local_density.label(), s.workload.label(),
            rows[0].strategy, rows[1].strategy, advantage
        );
    }
}
