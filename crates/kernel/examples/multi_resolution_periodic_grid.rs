use std::collections::HashMap;

use vlab_kernel::{AgentPhysicalState, Vec2};

#[derive(Clone, Copy, Debug, Default)]
pub struct QueryStats {
    pub level_index: usize,
    pub cells_per_axis: usize,
    pub cell_size: f64,
    pub visited_cells: usize,
    pub candidate_checks: usize,
}

#[derive(Clone, Debug)]
struct GridLevel {
    cells_per_axis: usize,
    cell_size: f64,
    buckets: HashMap<(usize, usize), Vec<usize>>,
}

impl GridLevel {
    fn new(cells_per_axis: usize, arena_size: f64, state: &[AgentPhysicalState]) -> Self {
        let cells_per_axis = cells_per_axis.max(1);
        let cell_size = arena_size / cells_per_axis as f64;
        let mut level = Self {
            cells_per_axis,
            cell_size,
            buckets: HashMap::new(),
        };
        level.buckets.reserve(state.len());
        for (index, agent) in state.iter().enumerate() {
            let cell = level.cell_of(agent.position, arena_size);
            level.buckets.entry(cell).or_default().push(index);
        }
        level
    }

    fn cell_coordinate(&self, value: f64, arena_size: f64) -> usize {
        let wrapped = wrap_coordinate(value, arena_size);
        let normalized = (wrapped + arena_size / 2.0) / arena_size;
        let index = (normalized * self.cells_per_axis as f64).floor() as usize;
        index.min(self.cells_per_axis - 1)
    }

    fn cell_of(&self, position: Vec2, arena_size: f64) -> (usize, usize) {
        (
            self.cell_coordinate(position.x, arena_size),
            self.cell_coordinate(position.y, arena_size),
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
        arena_size: f64,
        level_index: usize,
        out: &mut Vec<usize>,
    ) -> QueryStats {
        out.clear();
        if state.is_empty() {
            return QueryStats {
                level_index,
                cells_per_axis: self.cells_per_axis,
                cell_size: self.cell_size,
                ..QueryStats::default()
            };
        }

        let origin = state[agent_index].position;
        let (center_x, center_y) = self.cell_of(origin, arena_size);
        let span = (radius / self.cell_size).ceil() as usize;
        let radius2 = radius * radius;

        let mut x_cells = Vec::new();
        let mut y_cells = Vec::new();
        self.axis_cells(center_x, span, &mut x_cells);
        self.axis_cells(center_y, span, &mut y_cells);

        let mut candidate_checks = 0usize;
        for &cell_y in &y_cells {
            for &cell_x in &x_cells {
                if let Some(candidates) = self.buckets.get(&(cell_x, cell_y)) {
                    for &candidate_index in candidates {
                        if candidate_index == agent_index {
                            continue;
                        }
                        candidate_checks += 1;
                        let displacement =
                            minimum_image(state[candidate_index].position - origin, arena_size);
                        if displacement.norm_squared() <= radius2 {
                            out.push(candidate_index);
                        }
                    }
                }
            }
        }

        out.sort_unstable();
        QueryStats {
            level_index,
            cells_per_axis: self.cells_per_axis,
            cell_size: self.cell_size,
            visited_cells: x_cells.len() * y_cells.len(),
            candidate_checks,
        }
    }
}

/// Benchmark-only exact periodic hierarchy.
///
/// Geometry is simulator-owned and derived only from arena size and population.
/// The finest level targets 1/16 agent per cell under uniform occupancy; each
/// subsequent level roughly doubles cell width until a single-cell level is
/// reached. Query radii only select among already-built levels.
#[derive(Clone, Debug)]
pub struct MultiResolutionPeriodicGrid {
    arena_size: f64,
    levels: Vec<GridLevel>,
    index_entries: usize,
}

impl Default for MultiResolutionPeriodicGrid {
    fn default() -> Self {
        Self {
            arena_size: 1.0,
            levels: Vec::new(),
            index_entries: 0,
        }
    }
}

impl MultiResolutionPeriodicGrid {
    pub fn rebuild(&mut self, state: &[AgentPhysicalState], arena_size: f64) {
        assert!(arena_size.is_finite() && arena_size > 0.0);
        let base_cells = (state.len().max(1) as f64).sqrt().ceil() as usize;
        let mut cells = base_cells.saturating_mul(4).max(1);
        let mut cells_by_level = Vec::new();
        loop {
            cells_by_level.push(cells);
            if cells == 1 {
                break;
            }
            cells = ((cells + 1) / 2).max(1);
        }

        self.arena_size = arena_size;
        self.levels.clear();
        self.levels.reserve(cells_by_level.len());
        for cells_per_axis in cells_by_level {
            self.levels
                .push(GridLevel::new(cells_per_axis, arena_size, state));
        }
        self.index_entries = self.levels.len() * state.len();
    }

    fn selected_level_index(&self, radius: f64) -> usize {
        assert!(radius.is_finite() && radius > 0.0);
        assert!(
            !self.levels.is_empty(),
            "multi-resolution index queried before rebuild"
        );
        self.levels
            .iter()
            .position(|level| level.cell_size >= radius)
            .unwrap_or(self.levels.len() - 1)
    }

    pub fn query(
        &self,
        state: &[AgentPhysicalState],
        agent_index: usize,
        radius: f64,
        arena_size: f64,
        out: &mut Vec<usize>,
    ) {
        let _ = self.query_with_stats(state, agent_index, radius, arena_size, out);
    }

    pub fn query_with_stats(
        &self,
        state: &[AgentPhysicalState],
        agent_index: usize,
        radius: f64,
        arena_size: f64,
        out: &mut Vec<usize>,
    ) -> QueryStats {
        debug_assert!(
            (arena_size - self.arena_size).abs() <= f64::EPSILON * arena_size.abs().max(1.0)
        );
        let level_index = self.selected_level_index(radius);
        self.levels[level_index].query(state, agent_index, radius, arena_size, level_index, out)
    }

    pub fn level_count(&self) -> usize {
        self.levels.len()
    }

    pub fn index_entries(&self) -> usize {
        self.index_entries
    }

    pub fn level_geometry(&self) -> Vec<(usize, f64)> {
        self.levels
            .iter()
            .map(|level| (level.cells_per_axis, level.cell_size))
            .collect()
    }
}

/// Deliberately radius-coupled single-grid reference used only as a performance
/// lower-bound-style comparison. It is rebuilt separately for each radius and
/// is not an admissible general multi-radius strategy.
#[derive(Clone, Debug)]
pub struct RadiusMatchedGridReference {
    arena_size: f64,
    level: Option<GridLevel>,
}

impl Default for RadiusMatchedGridReference {
    fn default() -> Self {
        Self {
            arena_size: 1.0,
            level: None,
        }
    }
}

impl RadiusMatchedGridReference {
    pub fn rebuild_for_radius(
        &mut self,
        state: &[AgentPhysicalState],
        arena_size: f64,
        radius: f64,
    ) {
        assert!(radius.is_finite() && radius > 0.0);
        let cells_per_axis = ((arena_size / radius).floor() as usize).max(1);
        self.arena_size = arena_size;
        self.level = Some(GridLevel::new(cells_per_axis, arena_size, state));
    }

    pub fn query_with_stats(
        &self,
        state: &[AgentPhysicalState],
        agent_index: usize,
        radius: f64,
        arena_size: f64,
        out: &mut Vec<usize>,
    ) -> QueryStats {
        debug_assert!(
            (arena_size - self.arena_size).abs() <= f64::EPSILON * arena_size.abs().max(1.0)
        );
        self.level
            .as_ref()
            .expect("radius-matched reference queried before rebuild")
            .query(state, agent_index, radius, arena_size, 0, out)
    }

    pub fn cells_per_axis(&self) -> usize {
        self.level
            .as_ref()
            .expect("radius-matched reference inspected before rebuild")
            .cells_per_axis
    }

    pub fn cell_size(&self) -> f64 {
        self.level
            .as_ref()
            .expect("radius-matched reference inspected before rebuild")
            .cell_size
    }

    pub fn index_entries(&self, agent_count: usize) -> usize {
        if self.level.is_some() {
            agent_count
        } else {
            0
        }
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

fn main() {}
