use std::collections::HashMap;

use vlab_kernel::{AgentPhysicalState, NeighbourIndex, Vec2};

#[derive(Clone, Copy, Debug, Default)]
pub struct QueryStats {
    pub visited_cells: usize,
    pub raw_candidate_entries: usize,
    pub unique_candidates: usize,
    pub exact_distance_checks: usize,
    pub accepted: usize,
}

impl std::ops::AddAssign for QueryStats {
    fn add_assign(&mut self, rhs: Self) {
        self.visited_cells += rhs.visited_cells;
        self.raw_candidate_entries += rhs.raw_candidate_entries;
        self.unique_candidates += rhs.unique_candidates;
        self.exact_distance_checks += rhs.exact_distance_checks;
        self.accepted += rhs.accepted;
    }
}

/// Experimental transfer of the ARGoS coverage-stamping idea to Virtual Lab's
/// receiver-radius neighbour contract.
///
/// Unlike ARGoS RAB, Virtual Lab has no single transmitter-owned scientific
/// range available at rebuild time. Therefore the stamp halo is deliberately a
/// simulator-internal fixed number of grid cells, independent of every query
/// radius. Query radius only determines the remaining receiver-side scan span.
/// Exact minimum-image distance filtering remains authoritative.
pub struct CoverageStampingNeighbourIndex {
    arena_size: f64,
    cells_per_axis: usize,
    cell_size: f64,
    stamp_span_cells: usize,
    buckets: HashMap<(usize, usize), Vec<usize>>,
    index_entries: usize,
}

impl Default for CoverageStampingNeighbourIndex {
    fn default() -> Self {
        Self {
            arena_size: 1.0,
            cells_per_axis: 1,
            cell_size: 1.0,
            stamp_span_cells: 1,
            buckets: HashMap::new(),
            index_entries: 0,
        }
    }
}

impl CoverageStampingNeighbourIndex {
    pub fn index_entries(&self) -> usize { self.index_entries }
    pub fn cells_per_axis(&self) -> usize { self.cells_per_axis }
    pub fn stamp_span_cells(&self) -> usize { self.stamp_span_cells }

    fn configure(&mut self, agent_count: usize, arena_size: f64) {
        let cells = (agent_count.max(1) as f64).sqrt().ceil() as usize;
        self.arena_size = arena_size;
        self.cells_per_axis = cells.max(1);
        self.cell_size = arena_size / self.cells_per_axis as f64;
    }

    fn coordinate(&self, value: f64) -> usize {
        let wrapped = wrap_coordinate(value, self.arena_size);
        let normalized = (wrapped + self.arena_size / 2.0) / self.arena_size;
        let index = (normalized * self.cells_per_axis as f64).floor() as usize;
        index.min(self.cells_per_axis - 1)
    }

    fn cell_of(&self, state: &AgentPhysicalState) -> (usize, usize) {
        (self.coordinate(state.position.x), self.coordinate(state.position.y))
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
        out.sort_unstable();
        out.dedup();
    }

    pub fn query_with_stats(
        &self,
        state: &[AgentPhysicalState],
        agent_index: usize,
        radius: f64,
        arena_size: f64,
        out: &mut Vec<usize>,
    ) -> QueryStats {
        out.clear();
        debug_assert!((arena_size - self.arena_size).abs() <= f64::EPSILON * arena_size.abs().max(1.0));
        if state.is_empty() { return QueryStats::default(); }

        let origin = state[agent_index].position;
        let (center_x, center_y) = self.cell_of(&state[agent_index]);
        let full_span = (radius / self.cell_size).ceil() as usize;
        let query_span = full_span.saturating_sub(self.stamp_span_cells);
        let radius2 = radius * radius;

        let mut xs = Vec::new();
        let mut ys = Vec::new();
        self.axis_cells(center_x, query_span, &mut xs);
        self.axis_cells(center_y, query_span, &mut ys);

        let mut stats = QueryStats::default();
        let mut candidates = Vec::new();
        for &y in &ys {
            for &x in &xs {
                stats.visited_cells += 1;
                if let Some(bucket) = self.buckets.get(&(x, y)) {
                    for &candidate in bucket {
                        if candidate != agent_index {
                            candidates.push(candidate);
                        }
                    }
                }
            }
        }

        stats.raw_candidate_entries = candidates.len();
        candidates.sort_unstable();
        candidates.dedup();
        stats.unique_candidates = candidates.len();

        for candidate in candidates {
            stats.exact_distance_checks += 1;
            let displacement = minimum_image(state[candidate].position - origin, arena_size);
            if displacement.norm_squared() <= radius2 {
                out.push(candidate);
                stats.accepted += 1;
            }
        }
        // candidates were sorted before filtering, so accepted output is sorted.
        stats
    }
}

impl NeighbourIndex for CoverageStampingNeighbourIndex {
    fn rebuild(&mut self, state: &[AgentPhysicalState], arena_size: f64) {
        self.configure(state.len(), arena_size);
        self.buckets.clear();
        self.index_entries = 0;
        self.buckets.reserve(state.len());

        let mut xs = Vec::new();
        let mut ys = Vec::new();
        for (agent_index, agent) in state.iter().enumerate() {
            let (cx, cy) = self.cell_of(agent);
            self.axis_cells(cx, self.stamp_span_cells, &mut xs);
            self.axis_cells(cy, self.stamp_span_cells, &mut ys);
            for &y in &ys {
                for &x in &xs {
                    self.buckets.entry((x, y)).or_default().push(agent_index);
                    self.index_entries += 1;
                }
            }
        }
    }

    fn query(
        &self,
        state: &[AgentPhysicalState],
        agent_index: usize,
        radius: f64,
        arena_size: f64,
        out: &mut Vec<usize>,
    ) {
        let _ = self.query_with_stats(state, agent_index, radius, arena_size, out);
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

fn wrap_coordinate(value: f64, arena_size: f64) -> f64 {
    let half = arena_size / 2.0;
    if value >= -half && value < half {
        value
    } else {
        (value + half).rem_euclid(arena_size) - half
    }
}
