use std::collections::HashMap;
use std::hint::black_box;
use std::time::Instant;

use vlab_kernel::{
    AgentPhysicalState, BruteForceNeighbourIndex, NeighbourIndex, PeriodicGridNeighbourIndex,
    Vec2,
};

#[derive(Clone, Copy)]
struct Workload {
    label: &'static str,
    agents: usize,
    density: f64,
    radius: f64,
}

#[derive(Clone, Copy)]
enum Policy {
    Current,
    Half,
    Double,
    RadiusMatched,
}

impl Policy {
    const ALL: [Policy; 4] = [Policy::Current, Policy::Half, Policy::Double, Policy::RadiusMatched];

    fn label(self) -> &'static str {
        match self {
            Policy::Current => "current-one-cell-per-agent",
            Policy::Half => "half-resolution",
            Policy::Double => "double-resolution",
            Policy::RadiusMatched => "radius-matched",
        }
    }

    fn cells(self, agents: usize, arena: f64, radius: f64) -> usize {
        let current = (agents.max(1) as f64).sqrt().ceil();
        match self {
            Policy::Current => current as usize,
            Policy::Half => (current * 0.5).ceil().max(1.0) as usize,
            Policy::Double => (current * 2.0).ceil().max(1.0) as usize,
            Policy::RadiusMatched => (arena / radius).floor().max(1.0) as usize,
        }
    }
}

#[derive(Clone, Copy, Default)]
struct Stats {
    visited_cells: usize,
    nonempty_buckets: usize,
    candidate_checks: usize,
    accepted: usize,
}

impl std::ops::AddAssign for Stats {
    fn add_assign(&mut self, rhs: Self) {
        self.visited_cells += rhs.visited_cells;
        self.nonempty_buckets += rhs.nonempty_buckets;
        self.candidate_checks += rhs.candidate_checks;
        self.accepted += rhs.accepted;
    }
}

struct Grid {
    arena: f64,
    cells: usize,
    cell_size: f64,
    buckets: HashMap<(usize, usize), Vec<usize>>,
}

impl Grid {
    fn build(state: &[AgentPhysicalState], arena: f64, cells: usize) -> Self {
        let cells = cells.max(1);
        let mut grid = Self {
            arena,
            cells,
            cell_size: arena / cells as f64,
            buckets: HashMap::with_capacity(state.len()),
        };
        for (i, agent) in state.iter().enumerate() {
            grid.buckets.entry(grid.cell_of(agent)).or_default().push(i);
        }
        grid
    }

    fn coordinate(&self, value: f64) -> usize {
        let half = self.arena / 2.0;
        let wrapped = if value >= -half && value < half {
            value
        } else {
            (value + half).rem_euclid(self.arena) - half
        };
        (((wrapped + half) / self.arena * self.cells as f64).floor() as usize).min(self.cells - 1)
    }

    fn cell_of(&self, state: &AgentPhysicalState) -> (usize, usize) {
        (self.coordinate(state.position.x), self.coordinate(state.position.y))
    }

    fn axis_cells(&self, center: usize, span: usize, out: &mut Vec<usize>) {
        out.clear();
        if span >= self.cells / 2 {
            out.extend(0..self.cells);
            return;
        }
        let count = self.cells as isize;
        for offset in -(span as isize)..=(span as isize) {
            out.push((center as isize + offset).rem_euclid(count) as usize);
        }
    }

    fn query(
        &self,
        state: &[AgentPhysicalState],
        agent: usize,
        radius: f64,
        out: &mut Vec<usize>,
        xs: &mut Vec<usize>,
        ys: &mut Vec<usize>,
    ) -> Stats {
        out.clear();
        let origin = state[agent].position;
        let (cx, cy) = self.cell_of(&state[agent]);
        let span = (radius / self.cell_size).ceil() as usize;
        self.axis_cells(cx, span, xs);
        self.axis_cells(cy, span, ys);
        let radius2 = radius * radius;
        let mut stats = Stats::default();

        for &y in ys.iter() {
            for &x in xs.iter() {
                stats.visited_cells += 1;
                if let Some(candidates) = self.buckets.get(&(x, y)) {
                    stats.nonempty_buckets += 1;
                    for &candidate in candidates {
                        if candidate == agent {
                            continue;
                        }
                        stats.candidate_checks += 1;
                        let d = minimum_image(state[candidate].position - origin, self.arena);
                        if d.norm_squared() <= radius2 {
                            out.push(candidate);
                            stats.accepted += 1;
                        }
                    }
                }
            }
        }
        out.sort_unstable();
        stats
    }

    fn sweep(&self, state: &[AgentPhysicalState], radius: f64) -> Stats {
        let mut total = Stats::default();
        let mut out = Vec::new();
        let mut xs = Vec::new();
        let mut ys = Vec::new();
        for agent in 0..state.len() {
            total += self.query(state, agent, radius, &mut out, &mut xs, &mut ys);
        }
        total
    }
}

fn minimum_image_component(delta: f64, arena: f64) -> f64 {
    delta - arena * (delta / arena).round()
}

fn minimum_image(delta: Vec2, arena: f64) -> Vec2 {
    Vec2::new(
        minimum_image_component(delta.x, arena),
        minimum_image_component(delta.y, arena),
    )
}

fn state(agents: usize, arena: f64) -> Vec<AgentPhysicalState> {
    let side = (agents as f64).sqrt().ceil() as usize;
    let spacing = arena / side as f64;
    let half = arena / 2.0;
    (0..agents)
        .map(|i| AgentPhysicalState {
            position: Vec2::new(
                -half + ((i % side) as f64 + 0.5) * spacing,
                -half + ((i / side) as f64 + 0.5) * spacing,
            ),
            heading_angle: (i % 32) as f64 * 0.03125,
        })
        .collect()
}

fn median_ms(repetitions: usize, mut f: impl FnMut()) -> f64 {
    let mut samples = Vec::with_capacity(repetitions);
    for _ in 0..repetitions {
        let start = Instant::now();
        f();
        samples.push(start.elapsed().as_secs_f64() * 1000.0);
    }
    samples.sort_by(|a, b| a.partial_cmp(b).expect("finite timing"));
    samples[samples.len() / 2]
}

fn validate() {
    let agents = 289;
    let arena = 17.0;
    let sample = state(agents, arena);
    let brute = BruteForceNeighbourIndex;
    for radius in [0.45, 1.0, 2.25, 6.0] {
        for policy in Policy::ALL {
            let grid = Grid::build(&sample, arena, policy.cells(agents, arena, radius));
            for agent in 0..agents {
                let mut expected = Vec::new();
                let mut actual = Vec::new();
                let mut xs = Vec::new();
                let mut ys = Vec::new();
                brute.query(&sample, agent, radius, arena, &mut expected);
                grid.query(&sample, agent, radius, &mut actual, &mut xs, &mut ys);
                assert_eq!(actual, expected, "policy={} radius={} agent={}", policy.label(), radius, agent);
            }
        }
    }
}

fn production_timing(state: &[AgentPhysicalState], arena: f64, radius: f64, reps: usize) -> (f64, usize) {
    let mut index = PeriodicGridNeighbourIndex::default();
    index.rebuild(state, arena);
    let mut accepted = 0usize;
    let ms = median_ms(reps, || {
        let mut out = Vec::new();
        let mut total = 0usize;
        for agent in 0..state.len() {
            index.query(state, agent, radius, arena, &mut out);
            total += out.len();
        }
        accepted = total;
        black_box(total);
    });
    (ms, accepted)
}

fn run(workload: Workload) {
    let arena = (workload.agents as f64 / workload.density).sqrt();
    let sample = state(workload.agents, arena);
    let reps = 5;
    let (production_ms, production_accepted) = production_timing(&sample, arena, workload.radius, reps);
    println!(
        "production_timing,{},{},{:.6},{:.6},{:.6},{:.6},{:.3}",
        workload.label,
        workload.agents,
        workload.density,
        arena,
        workload.radius,
        production_ms,
        production_accepted as f64 / workload.agents as f64,
    );

    for policy in Policy::ALL {
        let cells = policy.cells(workload.agents, arena, workload.radius);
        let grid = Grid::build(&sample, arena, cells);
        let stats = grid.sweep(&sample, workload.radius);
        assert_eq!(stats.accepted, production_accepted, "accepted neighbours changed for {} / {}", workload.label, policy.label());
        let query_ms = median_ms(reps, || black_box(grid.sweep(black_box(&sample), workload.radius)));
        let total_cells = cells * cells;
        let occupied = grid.buckets.len();
        let mean_all = workload.agents as f64 / total_cells as f64;
        let mean_occupied = workload.agents as f64 / occupied as f64;
        let max_occupied = grid.buckets.values().map(Vec::len).max().unwrap_or(0);
        let n = workload.agents as f64;
        println!(
            "diagnostic,{},{},{:.6},{:.6},{:.6},{},{},{:.6},{},{:.3},{:.3},{},{:.3},{:.3},{:.3},{:.6},{:.3}",
            workload.label,
            workload.agents,
            workload.density,
            arena,
            workload.radius,
            policy.label(),
            cells,
            grid.cell_size,
            occupied,
            mean_all,
            mean_occupied,
            max_occupied,
            stats.visited_cells as f64 / n,
            stats.nonempty_buckets as f64 / n,
            stats.candidate_checks as f64 / n,
            query_ms,
            stats.accepted as f64 / n,
        );
    }
}

fn main() {
    validate();
    println!("vlab_neighbour_density_profile_version=1");
    println!("validation=all-diagnostic-grid-policies-match-brute-force");
    println!("production_timing_schema=row_type,case,agents,density,arena_size,radius,query_all_ms,avg_neighbours");
    println!("diagnostic_schema=row_type,case,agents,density,arena_size,radius,policy,cells_per_axis,cell_size,occupied_buckets,mean_agents_per_cell,mean_agents_per_occupied_bucket,max_bucket_occupancy,avg_visited_cells,avg_nonempty_bucket_visits,avg_candidate_distance_checks,query_all_ms,avg_neighbours");
    for workload in [
        Workload { label: "density-0.25", agents: 5_000, density: 0.25, radius: 1.0 },
        Workload { label: "density-1", agents: 5_000, density: 1.0, radius: 1.0 },
        Workload { label: "density-4", agents: 5_000, density: 4.0, radius: 1.0 },
        Workload { label: "density-16", agents: 5_000, density: 16.0, radius: 1.0 },
        Workload { label: "radius-0.5", agents: 5_000, density: 1.0, radius: 0.5 },
        Workload { label: "radius-2", agents: 5_000, density: 1.0, radius: 2.0 },
        Workload { label: "radius-4", agents: 5_000, density: 1.0, radius: 4.0 },
    ] {
        run(workload);
    }
}
