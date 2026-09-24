use std::collections::{HashMap, HashSet};

use vlab_kernel::{AgentPhysicalState, Vec2};

#[derive(Clone, Copy, Debug, Default)]
pub struct RabRouteStats {
    pub receiver_point_lookups: usize,
    pub raw_bucket_entries: usize,
    pub pair_references: usize,
    pub duplicate_pair_references: usize,
    pub exact_pair_distance_checks: usize,
    pub directed_links: usize,
}

/// Benchmark-only 2D periodic transcription of the spatial-index mechanism used
/// by ARGoS Range-and-Bearing (RAB):
///
/// - grid resolution is simulator infrastructure, independent of RAB range;
/// - each transmitter owns its range;
/// - rebuild stamps a transmitter into every grid cell touched by the axis-aligned
///   range box around its position;
/// - a receiver performs a point lookup at its own position;
/// - each unordered candidate pair is checked once, then the two directed range
///   relations are evaluated independently.
///
/// ARGoS itself uses a 3D CGrid and an optional occlusion/message-size layer. This
/// benchmark fixes equal message sizes and no occlusion so it isolates the spatial
/// indexing/routing mechanism. Virtual Lab's benchmark world is periodic, so the
/// grid stamping and exact geometry below use periodic wrapping/minimum image.
pub struct FaithfulArgosRabGrid {
    arena_size: f64,
    cells_per_axis: usize,
    cell_size: f64,
    buckets: HashMap<(usize, usize), Vec<usize>>,
    index_entries: usize,
}

impl Default for FaithfulArgosRabGrid {
    fn default() -> Self {
        Self {
            arena_size: 1.0,
            cells_per_axis: 1,
            cell_size: 1.0,
            buckets: HashMap::new(),
            index_entries: 0,
        }
    }
}

impl FaithfulArgosRabGrid {
    pub fn cells_per_axis(&self) -> usize {
        self.cells_per_axis
    }

    pub fn cell_size(&self) -> f64 {
        self.cell_size
    }

    pub fn index_entries(&self) -> usize {
        self.index_entries
    }

    /// ARGoS RAB's default CGrid size is the integer arena extent in each axis,
    /// which corresponds to approximately one world unit per cell. We mirror that
    /// default here in 2D. No scientific transmission range influences this value.
    fn configure(&mut self, arena_size: f64) {
        assert!(arena_size.is_finite() && arena_size > 0.0);
        let cells = arena_size.floor() as usize;
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
        (
            self.coordinate(state.position.x),
            self.coordinate(state.position.y),
        )
    }

    /// Return every periodic cell intersected by [center-range, center+range]
    /// along one axis. This is the 2D periodic counterpart of ARGoS
    /// CGrid::ForCellsInBoxRange used by CRABEquippedEntityGridEntityUpdater.
    fn axis_cells_for_box(&self, center: f64, range: f64, out: &mut Vec<usize>) {
        out.clear();
        assert!(range.is_finite() && range >= 0.0);
        let count = self.cells_per_axis;
        if count == 1 || 2.0 * range >= self.arena_size {
            out.extend(0..count);
            return;
        }

        let half = self.arena_size / 2.0;
        let center_zero = wrap_coordinate(center, self.arena_size) + half;
        let start = ((center_zero - range) / self.cell_size).floor() as isize;
        let end = ((center_zero + range) / self.cell_size).floor() as isize;
        let count_signed = count as isize;
        for cell in start..=end {
            out.push(cell.rem_euclid(count_signed) as usize);
        }
        out.sort_unstable();
        out.dedup();
    }

    pub fn rebuild(
        &mut self,
        state: &[AgentPhysicalState],
        transmitter_ranges: &[f64],
        arena_size: f64,
    ) {
        assert_eq!(state.len(), transmitter_ranges.len());
        self.configure(arena_size);
        self.buckets.clear();
        self.index_entries = 0;

        let mut xs = Vec::new();
        let mut ys = Vec::new();
        for (transmitter, (agent, &range)) in
            state.iter().zip(transmitter_ranges.iter()).enumerate()
        {
            self.axis_cells_for_box(agent.position.x, range, &mut xs);
            self.axis_cells_for_box(agent.position.y, range, &mut ys);
            for &y in &ys {
                for &x in &xs {
                    self.buckets.entry((x, y)).or_default().push(transmitter);
                    self.index_entries += 1;
                }
            }
        }
    }

    /// Build the directed RAB routing relation exactly as the ARGoS medium does
    /// after its point lookups: each unordered pair is distance-checked once, and
    /// each direction is accepted according to the *transmitter's* own range.
    pub fn build_routes_with_stats(
        &self,
        state: &[AgentPhysicalState],
        transmitter_ranges: &[f64],
        arena_size: f64,
    ) -> (Vec<Vec<usize>>, RabRouteStats) {
        assert_eq!(state.len(), transmitter_ranges.len());
        debug_assert!(
            (arena_size - self.arena_size).abs() <= f64::EPSILON * arena_size.abs().max(1.0)
        );

        let mut routes = vec![Vec::new(); state.len()];
        let mut checked_pairs = HashSet::new();
        let mut stats = RabRouteStats::default();

        for receiver in 0..state.len() {
            stats.receiver_point_lookups += 1;
            let cell = self.cell_of(&state[receiver]);
            let Some(bucket) = self.buckets.get(&cell) else {
                continue;
            };
            stats.raw_bucket_entries += bucket.len();

            for &other in bucket {
                if other == receiver {
                    continue;
                }
                stats.pair_references += 1;
                let pair = if receiver < other {
                    (receiver, other)
                } else {
                    (other, receiver)
                };
                if !checked_pairs.insert(pair) {
                    stats.duplicate_pair_references += 1;
                    continue;
                }

                stats.exact_pair_distance_checks += 1;
                let displacement =
                    minimum_image(state[other].position - state[receiver].position, arena_size);
                let distance2 = displacement.norm_squared();

                // receiver receives other's message if receiver is inside
                // the transmitter-owned range of `other`.
                if distance2 < transmitter_ranges[other] * transmitter_ranges[other] {
                    routes[receiver].push(other);
                    stats.directed_links += 1;
                }
                // The same exact distance supports the reverse directional test.
                if distance2 < transmitter_ranges[receiver] * transmitter_ranges[receiver] {
                    routes[other].push(receiver);
                    stats.directed_links += 1;
                }
            }
        }

        for incoming in &mut routes {
            incoming.sort_unstable();
            incoming.dedup();
        }
        (routes, stats)
    }
}

pub fn brute_force_rab_routes(
    state: &[AgentPhysicalState],
    transmitter_ranges: &[f64],
    arena_size: f64,
) -> Vec<Vec<usize>> {
    assert_eq!(state.len(), transmitter_ranges.len());
    let mut routes = vec![Vec::new(); state.len()];
    for first in 0..state.len() {
        for second in (first + 1)..state.len() {
            let displacement =
                minimum_image(state[second].position - state[first].position, arena_size);
            let distance2 = displacement.norm_squared();
            if distance2 < transmitter_ranges[second] * transmitter_ranges[second] {
                routes[first].push(second);
            }
            if distance2 < transmitter_ranges[first] * transmitter_ranges[first] {
                routes[second].push(first);
            }
        }
    }
    routes
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
