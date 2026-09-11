use std::collections::HashMap;

use super::{minimum_image, wrap_coordinate, AgentPhysicalState, NeighbourIndex};

/// Simulator-owned periodic positional index.
///
/// The grid geometry is deliberately independent of every scientific sensing or
/// interaction radius. It is derived only from arena geometry and population
/// size, targeting roughly one bucket per agent for a uniform distribution.
/// Query radii only determine how many already-built cells are inspected.
#[derive(Clone, Debug)]
pub struct PeriodicGridNeighbourIndex {
    arena_size: f64,
    cells_per_axis: usize,
    cell_size: f64,
    buckets: HashMap<(usize, usize), Vec<usize>>,
}

impl Default for PeriodicGridNeighbourIndex {
    fn default() -> Self {
        Self {
            arena_size: 1.0,
            cells_per_axis: 1,
            cell_size: 1.0,
            buckets: HashMap::new(),
        }
    }
}

impl PeriodicGridNeighbourIndex {
    fn configure(&mut self, agent_count: usize, arena_size: f64) {
        let cells = (agent_count.max(1) as f64).sqrt().ceil() as usize;
        self.arena_size = arena_size;
        self.cells_per_axis = cells.max(1);
        self.cell_size = arena_size / self.cells_per_axis as f64;
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

    #[cfg(test)]
    fn cells_per_axis(&self) -> usize { self.cells_per_axis }
}

impl NeighbourIndex for PeriodicGridNeighbourIndex {
    fn rebuild(&mut self, state: &[AgentPhysicalState], arena_size: f64) {
        self.configure(state.len(), arena_size);
        self.buckets.clear();
        self.buckets.reserve(state.len());
        for (index, agent) in state.iter().enumerate() {
            self.buckets.entry(self.cell_of(agent)).or_default().push(index);
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
        out.clear();
        debug_assert!((arena_size - self.arena_size).abs() <= f64::EPSILON * arena_size.abs().max(1.0));
        if state.is_empty() { return; }

        let origin = state[agent_index].position;
        let (center_x, center_y) = self.cell_of(&state[agent_index]);
        let span = (radius / self.cell_size).ceil() as usize;
        let radius2 = radius * radius;

        let mut x_cells = Vec::new();
        let mut y_cells = Vec::new();
        self.axis_cells(center_x, span, &mut x_cells);
        self.axis_cells(center_y, span, &mut y_cells);

        for &cell_y in &y_cells {
            for &cell_x in &x_cells {
                if let Some(candidates) = self.buckets.get(&(cell_x, cell_y)) {
                    for &candidate_index in candidates {
                        if candidate_index == agent_index { continue; }
                        let displacement = minimum_image(state[candidate_index].position - origin, arena_size);
                        if displacement.norm_squared() <= radius2 {
                            out.push(candidate_index);
                        }
                    }
                }
            }
        }

        // Match brute-force ordering exactly. This prevents the optimization
        // from changing floating-point accumulation order in controller code.
        out.sort_unstable();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{BruteForceNeighbourIndex, Vec2};

    fn state_for(arena_size: f64, count: usize) -> Vec<AgentPhysicalState> {
        let mut rng = crate::DeterministicRng::new(9917);
        let half = arena_size / 2.0;
        (0..count).map(|_| AgentPhysicalState {
            position: Vec2::new(
                (rng.unit() * arena_size) - half,
                (rng.unit() * arena_size) - half,
            ),
            heading_angle: rng.unit() * crate::TAU,
        }).collect()
    }

    fn assert_matches_brute_force(state: &[AgentPhysicalState], arena_size: f64, radii: &[f64]) {
        let brute = BruteForceNeighbourIndex;
        let mut grid = PeriodicGridNeighbourIndex::default();
        grid.rebuild(state, arena_size);
        let built_cells = grid.cells_per_axis();
        for &radius in radii {
            for agent_index in 0..state.len() {
                let mut expected = Vec::new();
                let mut actual = Vec::new();
                brute.query(state, agent_index, radius, arena_size, &mut expected);
                grid.query(state, agent_index, radius, arena_size, &mut actual);
                assert_eq!(actual, expected, "agent={agent_index} radius={radius} arena={arena_size}");
            }
            assert_eq!(grid.cells_per_axis(), built_cells, "query radius changed index geometry");
        }
    }

    #[test]
    fn periodic_grid_matches_brute_force_across_arena_sizes_and_radii() {
        for &(arena_size, count) in &[(0.75, 24), (3.7, 64), (10.0, 211), (37.0, 400)] {
            let state = state_for(arena_size, count);
            assert_matches_brute_force(&state, arena_size, &[0.05, 0.3, 0.81, 2.0, arena_size * 0.49, arena_size]);
        }
    }

    #[test]
    fn periodic_grid_is_exact_across_wrapped_boundaries() {
        let state = vec![
            AgentPhysicalState { position: Vec2::new(-4.9, -4.9), heading_angle: 0.0 },
            AgentPhysicalState { position: Vec2::new(4.9, -4.9), heading_angle: 0.0 },
            AgentPhysicalState { position: Vec2::new(-4.9, 4.9), heading_angle: 0.0 },
            AgentPhysicalState { position: Vec2::new(4.9, 4.9), heading_angle: 0.0 },
            AgentPhysicalState { position: Vec2::new(0.0, 0.0), heading_angle: 0.0 },
        ];
        assert_matches_brute_force(&state, 10.0, &[0.15, 0.25, 0.5, 7.5]);
    }

    #[test]
    fn one_built_index_serves_multiple_scientific_radii() {
        let state = state_for(20.0, 256);
        let mut grid = PeriodicGridNeighbourIndex::default();
        grid.rebuild(&state, 20.0);
        let cells = grid.cells_per_axis();
        let mut out = Vec::new();
        for radius in [0.2, 0.81, 2.0, 6.0, 20.0] {
            grid.query(&state, 17, radius, 20.0, &mut out);
            assert_eq!(grid.cells_per_axis(), cells);
        }
    }
}
