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
enum GridPolicy {
    Current,
    HalfResolution,
    DoubleResolution,
    RadiusMatched,
}

impl GridPolicy {
    const ALL: [GridPolicy; 4] = [
        GridPolicy::Current,
        GridPolicy::HalfResolution,
        GridPolicy::DoubleResolution,
        GridPolicy::RadiusMatched,
    ];

    fn label(self) -> &'static str {
        match self {
            GridPolicy::Current => "current-one-cell-per-agent",
            GridPolicy::HalfResolution => "half-resolution",
            GridPolicy::DoubleResolution => "double-resolution",
            GridPolicy::RadiusMatched => "radius-matched",
        }
    }

    fn cells_per_axis(self, agents: usize, arena_size: f64, radius: f64) -> usize {
        let current = (agents.max(1) as f64).sqrt().ceil().max(1.0);
        match self {
            GridPolicy::Current => current as usize,
            GridPolicy::HalfResolution => (current * 0.5).ceil().max(1.0) as usize,
            GridPolicy::DoubleResolution => (current * 2.0).ceil().max(1.0) as usize,
            GridPolicy::RadiusMatched => {
                if radius <= 0.0 {
                    1
                } else {
                    (arena_size / radius).floor().max(1.0) as usize
                }
            }
        }
    }
}

#[derive(Clone, Copy, Debug, Default)]
struct SweepStats {
    visited_cells: usize,
    nonempty_bucket_visits: usize,
    candidate_distance_checks: usize,
    accepted_neighbours: usize,
}

impl std::ops::AddAssign for SweepStats {
    fn add_assign(&mut self, rhs: Self) {
        self.visited_cells += rhs.visited_cells;
        self.nonempty_bucket_visits += rhs.nonempty_bucket_visits;
        self.candidate_distance_checks += rhs.candidate_distance_checks;
        self.accepted_neighbours += rhs.accepted_neighbours;
    }
}

#[derive(Clone, Debug)]
struct DiagnosticGrid {
    arena_size: f64,
    cells_per_axis: usize,
    cell_size: f64,
    buckets: HashMap<(usize, usize), Vec<usize>>,
}

impl DiagnosticGrid {
    fn build(state: &[AgentPhysicalState], arena_size: f64, cells_per_axis: usize) -> Self {
        let cells_per_axis = cells_per_axis.max(1);
        let cell_size = arena_size / cells_per_axis as f64;
        let mut grid = Self {
            arena_size,
            cells_per_axis,
            cell_size,
            buckets: HashMap::with_capacity(state.len()),
        };
        for (index, agent) in state.iter().enumerate() {
            let cell = grid.cell_of(agent);
            grid.buckets.entry(cell).or_default().push(index);
        }
        grid
    }

    fn cell_coordinate(&self, value: f64) -> usize {
        let wrapped = wrap_coordinate(value, self.arena_size);
        let normalized = (wrapped + self.arena_size / 2.0) / self.arena_size;
        let index = (normalized * self.cells_per_axis as f64).floor() as usize;
        index.min(self.cells_per_axis - 1)
    }

    fn cell_of(&self, state: &AgentPhysicalState) -> (usize, usize) {
        (
            self.cell_coordinate(state.position.x),
            self.cell_coordinate(state.position.y),
        )
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

    fn query(
        &self,
        state: &[AgentPhysicalState],
        agent_index: usize,
        radius: f64,
        out: &mut Vec<usize>,
        x_cells: &mut Vec<usize>,
        y_cells: &mut Vec<usize>,
    ) -> SweepStats {
        out.clear();
        let origin = state[agent_index].position;
        let (center_x, center_y) = self.cell_of(&state[agent_index]);
        let span = (radius / self.cell_size).ceil() as usize;
        let radius2 = radius * radius;
        self.axis_cells(center_x, span, x_cells);
        self.axis_cells(center_y, span, y_cells);

        let mut stats = SweepStats::default();
        for &cell_y in y_cells.iter() {
            for &cell_x in x_cells.iter() {
                stats.visited_cells += 1;
                if let Some(candidates) = self.buckets.get(&(cell_x, cell_y)) {
                    stats.nonempty_bucket_visits += 1;
                    for &candidate_index in candidates {
                        if candidate_index == agent_index {
                            continue;
                        }
                        stats.candidate_distance_checks += 1;
                        let displacement = minimum_image(
                            state[candidate_index].position - origin,
                            self.arena_size,
                        );
                        if displacement.norm_squared() <= radius2 {
                            out.push(candidate_index);
                            stats.accepted_neighbours += 1;
                        }
                    }
                }
            }
        }
        out.sort_unstable();
        stats
    }

    fn sweep(&self, state: &[AgentPhysicalState], radius: f64) -> SweepStats {
        let mut out = Vec::new();
        let mut x_cells = Vec::new();
        let mut y_cells = Vec::new();
        let mut total = SweepStats::default();
        for agent_index in 0..state.len() {
            total += self.query(
                state,
                agent_index,
                radius,
                &mut out,
                &mut x_cells,
                &mut y_cells,
            );
        }
        total
    }

    fn occupancy(&self, agents: usize) -> (usize, f64, f64, usize) {
        let occupied = self.buckets.len();
        let total_cells = self.cells_per_axis * self.cells_per_axis;
        let mean_all = agents as f64 / total_cells as f64;
        let mean_occupied = if occupied == 0 {
            0.0
        } else {
            agents as f64 / occupied as f64
        };
        let max_occupied = self.buckets.values().map(Vec::len).max().unwrap_or(0);
        (occupied, mean_all, mean_occupied, max_occupied)
    }
}

fn wrap_coordinate(value: f64, arena_size: f64) -> f64 {
    let half = arena_size / 2.0;
    if value >= -half && value < half {
        value
    } else {
        (value + half).rem_euclid(arena_size) - half
    }
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

fn arena_size_for(agents: usize, density: f64) -> f64 {
    (agents as f64 / density).sqrt()
}

fn synthetic_state(agents: usize, arena_size: f64) -> Vec<AgentPhysicalState> {
    let side = (agents as f64).sqrt().ceil() as usize;
    let spacing = arena_size / side as f64;
    let half = arena_size / 2.0;
    (0..agents)
        .map(|index| {
            let row = index / side;
            let col = index % side;
            AgentPhysicalState {
                position: Vec2::new(
                    -half + (col as f64 + 0.5) * spacing,
                    -half + (row as f64 + 0.5) * spacing,
                ),
                heading_angle: ((index % 32) as f64) * 0.03125,
            }
        })
        .collect()
}

fn median(mut values: Vec<f64>) -> f64 {
    values.sort_by(|a, b| a.partial_cmp(b).expect("finite timing"));
    values[values.len() / 2]
}

fn median_ms(repetitions: usize, mut operation: impl FnMut()) -> f64 {
    let mut samples = Vec::with_capacity(repetitions);
    for _ in 0..repetitions {
        let start = Instant::now();
        operation();
        samples.push(start.elapsed().as_secs_f64() * 1000.0);
    }
    median(samples)
}

fn production_query_ms(
    repetitions: usize,
    state: &[AgentPhysicalState],
    arena_size: f64,
    radius: f64,
) -> (f64, usize) {
    let mut index = PeriodicGridNeighbourIndex::default();
    index.rebuild(state, arena_size);
    let mut accepted = 0usize;
    let timing = median_ms(repetitions, || {
        let mut out = Vec::new();
        let mut total = 0usize;
        for agent in 0..state.len() {
            index.query(state, agent, radius, arena_size, &mut out);
            total += out.len();
        }
        accepted = total;
        black_box(total);
    });
    (timing, accepted)
}

fn validate_diagnostic_strategies() {
    let agents = 289;
    let arena_size = 17.0;
    let state = synthetic_state(agents, arena_size);
    let brute = BruteForceNeighbourIndex;

    for radius in [0.45, 1.0, 2.25, 6.0] {
        for policy in GridPolicy::ALL {
            let cells = policy.cells_per_axis(agents, arena_size, radius);
            let grid = DiagnosticGrid::build(&state, arena_size, cells);
            for agent in 0..state.len() {
                let mut expected = Vec::new();
                let mut actual = Vec::new();
                let mut x_cells = Vec::new();
                let mut y_cells = Vec::new();
                brute.query(&state, agent, radius, arena_size, &mut expected);
                grid.query(
                    &state,
                    agent,
                    radius,
                    &mut actual,
                    &mut x_cells,
                    &mut y_cells,
                );
                assert_eq!(
                    actual,
                    expected,
                    "diagnostic grid mismatch policy={} agent={} radius={}",
                    policy.label(),
                    agent,
                    radius
                );
            }
        }
    }
}

fn run_workload(workload: Workload) {
    let arena_size = arena_size_for(workload.agents, workload.density);
    let state = synthetic_state(workload.agents, arena_size);
    let repetitions = if workload.agents >= 10_000 { 3 } else { 5 };
    let (production_ms, production_neighbours) = production_query_ms(
        repetitions,
        &state,
        arena_size,
        workload.radius,
    );

    println!(
        "production,{},{},{:.6},{:.6},{:.6},,,,,,,,,{:.6},{:.3}",
        workload.label,
        workload.agents,
        workload.density,
        arena_size,
        workload.radius,
        production_ms,
        production_neighbours as f64 / workload.agents as f64,
    );

    for policy in GridPolicy::ALL {
        let cells = policy.cells_per_axis(workload.agents, arena_size, workload.radius);
        let grid = DiagnosticGrid::build(&state, arena_size, cells);
        let stats = grid.sweep(&state, workload.radius);
        assert_eq!(
            stats.accepted_neighbours,
            production_neighbours,
            "accepted-neighbour total changed for {} / {}",
            workload.label,
            policy.label()
        );

        let query_ms = median_ms(repetitions, || {
            black_box(grid.sweep(black_box(&state), workload.radius));
        });
        let (occupied, mean_all, mean_occupied, max_occupied) = grid.occupancy(workload.agents);
        let agents = workload.agents as f64;

        println!(
            "diagnostic,{},{},{:.6},{:.6},{:.6},{},{},{:.6},{},{:.3},{:.3},{:.3},{:.3},{:.3},{:.6},{:.3}",
            workload.label,
            workload.agents,
            workload.density,
            arena_size,
            workload.radius,
            policy.label(),
            cells,
            grid.cell_size,
            occupied,
            mean_all,
            mean_occupied,
            max_occupied as f64,
            stats.visited_cells as f64 / agents,
            stats.nonempty_bucket_visits as f64 / agents,
            stats.candidate_distance_checks as f64 / agents,
            query_ms,
            stats.accepted_neighbours as f64 / agents,
        );
    }
}

fn main() {
    validate_diagnostic_strategies();
    println!("vlab_neighbour_density_profile_version=1");
    println!("validation=all-diagnostic-grid-policies-match-brute-force");
    println!("row_type,case,agents,density,arena_size,radius,policy,cells_per_axis,cell_size,occupied_buckets,mean_agents_per_cell,mean_agents_per_occupied_bucket,max_bucket_occupancy,avg_visited_cells,avg_nonempty_bucket_visits,avg_candidate_distance_checks,query_all_ms,avg_neighbours");

    for workload in [
        Workload { label: "density-0.25", agents: 5_000, density: 0.25, radius: 1.0 },
        Workload { label: "density-1", agents: 5_000, density: 1.0, radius: 1.0 },
        Workload { label: "density-4", agents: 5_000, density: 4.0, radius: 1.0 },
        Workload { label: "density-16", agents: 5_000, density: 16.0, radius: 1.0 },
        Workload { label: "radius-0.5", agents: 5_000, density: 1.0, radius: 0.5 },
        Workload { label: "radius-2", agents: 5_000, density: 1.0, radius: 2.0 },
        Workload { label: "radius-4", agents: 5_000, density: 1.0, radius: 4.0 },
    ] {
        run_workload(workload);
    }
}
