use super::{minimum_image, AgentPhysicalState, NeighbourIndex};

const LEAF_CAPACITY: usize = 8;
const PRUNING_ULPS: f64 = 64.0;

/// Stable provenance identifier for the normal production neighbour backend.
///
/// This is infrastructure provenance only. Tree geometry and tuning remain
/// simulator-owned implementation details and are not experiment parameters.
pub const PRODUCTION_NEIGHBOUR_STRATEGY: &str = "adaptive-periodic-bvh/v1";

#[derive(Clone, Debug)]
struct Node {
    min_x: f64,
    min_y: f64,
    max_x: f64,
    max_y: f64,
    left: Option<usize>,
    right: Option<usize>,
    start: usize,
    end: usize,
}

impl Node {
    fn leaf(min_x: f64, min_y: f64, max_x: f64, max_y: f64, start: usize, end: usize) -> Self {
        Self { min_x, min_y, max_x, max_y, left: None, right: None, start, end }
    }

    fn internal(min_x: f64, min_y: f64, max_x: f64, max_y: f64, left: usize, right: usize) -> Self {
        Self { min_x, min_y, max_x, max_y, left: Some(left), right: Some(right), start: 0, end: 0 }
    }

    fn is_leaf(&self) -> bool { self.left.is_none() }
}

/// Exact deterministic periodic BVH selected as the normal production index.
///
/// The tree is built only from physical positions and is reused unchanged for
/// arbitrary receiver-side query radii. Periodic broad-phase pruning is
/// deliberately conservative; the exact minimum-image distance test is the
/// authoritative membership decision.
#[derive(Clone, Debug, Default)]
pub struct AdaptivePeriodicBvh {
    indices: Vec<usize>,
    nodes: Vec<Node>,
    root: Option<usize>,
    leaf_count: usize,
    max_depth: usize,
    arena_size: f64,
}

impl AdaptivePeriodicBvh {
    fn build(&mut self, state: &[AgentPhysicalState], arena_size: f64) {
        assert!(arena_size.is_finite() && arena_size > 0.0);
        self.indices.clear();
        self.indices.extend(0..state.len());
        self.nodes.clear();
        self.leaf_count = 0;
        self.max_depth = 0;
        self.arena_size = arena_size;
        self.root = if state.is_empty() {
            None
        } else {
            Some(build_node(
                state,
                &mut self.indices,
                &mut self.nodes,
                0,
                state.len(),
                0,
                &mut self.leaf_count,
                &mut self.max_depth,
            ))
        };
    }

    #[cfg(test)]
    fn structure_signature(&self) -> (usize, usize, usize, usize) {
        (self.nodes.len(), self.leaf_count, self.max_depth, self.indices.len() + self.nodes.len())
    }
}

impl NeighbourIndex for AdaptivePeriodicBvh {
    fn rebuild(&mut self, state: &[AgentPhysicalState], arena_size: f64) {
        self.build(state, arena_size);
    }

    fn query(
        &self,
        state: &[AgentPhysicalState],
        agent_index: usize,
        radius: f64,
        arena_size: f64,
        out: &mut Vec<usize>,
    ) {
        assert!(radius.is_finite() && radius > 0.0);
        debug_assert!((arena_size - self.arena_size).abs() <= f64::EPSILON * arena_size.abs().max(1.0));
        out.clear();
        let Some(root) = self.root else { return; };

        let max_periodic_distance = arena_size * std::f64::consts::FRAC_1_SQRT_2;
        if radius >= max_periodic_distance {
            out.extend((0..state.len()).filter(|&index| index != agent_index));
            return;
        }

        let origin = state[agent_index].position;
        let centers_x = periodic_query_centers(origin.x, radius, arena_size);
        let centers_y = periodic_query_centers(origin.y, radius, arena_size);
        let radius2 = radius * radius;

        // #185: broad-phase pruning must be conservative. Candidate inclusion
        // is only an optimization; exact minimum-image <= radius^2 below is
        // authoritative. The scale-aware slack prevents tangent AABBs from
        // being lost to floating-point translation/squaring at boundaries.
        let linear_slack = PRUNING_ULPS * f64::EPSILON * arena_size.abs().max(radius.abs()).max(1.0);
        let pruning_radius = radius + linear_slack;
        let pruning_radius2 = pruning_radius * pruning_radius;
        let mut candidates = Vec::new();

        for &center_x in &centers_x {
            for &center_y in &centers_y {
                collect_candidates(
                    root,
                    center_x,
                    center_y,
                    pruning_radius2,
                    &self.nodes,
                    &self.indices,
                    &mut candidates,
                );
            }
        }

        candidates.sort_unstable();
        candidates.dedup();
        for candidate_index in candidates {
            if candidate_index == agent_index { continue; }
            let displacement = minimum_image(state[candidate_index].position - origin, arena_size);
            if displacement.norm_squared() <= radius2 {
                out.push(candidate_index);
            }
        }
        // Preserve the exact deterministic ordering contract used by controller
        // accumulation and by the former production grid.
        out.sort_unstable();
    }
}

fn build_node(
    state: &[AgentPhysicalState],
    indices: &mut [usize],
    nodes: &mut Vec<Node>,
    start: usize,
    end: usize,
    depth: usize,
    leaf_count: &mut usize,
    max_depth: &mut usize,
) -> usize {
    let (min_x, min_y, max_x, max_y) = bounds(state, &indices[start..end]);
    let node_index = nodes.len();
    nodes.push(Node::leaf(min_x, min_y, max_x, max_y, start, end));
    *max_depth = (*max_depth).max(depth);

    if end - start <= LEAF_CAPACITY {
        *leaf_count += 1;
        return node_index;
    }

    let split_x = (max_x - min_x) >= (max_y - min_y);
    indices[start..end].sort_by(|&a, &b| {
        let a_value = if split_x { state[a].position.x } else { state[a].position.y };
        let b_value = if split_x { state[b].position.x } else { state[b].position.y };
        a_value.total_cmp(&b_value).then_with(|| a.cmp(&b))
    });
    let middle = start + (end - start) / 2;
    let left = build_node(state, indices, nodes, start, middle, depth + 1, leaf_count, max_depth);
    let right = build_node(state, indices, nodes, middle, end, depth + 1, leaf_count, max_depth);
    nodes[node_index] = Node::internal(min_x, min_y, max_x, max_y, left, right);
    node_index
}

fn bounds(state: &[AgentPhysicalState], indices: &[usize]) -> (f64, f64, f64, f64) {
    let first = state[indices[0]].position;
    let mut min_x = first.x;
    let mut min_y = first.y;
    let mut max_x = first.x;
    let mut max_y = first.y;
    for &index in &indices[1..] {
        let position = state[index].position;
        min_x = min_x.min(position.x);
        min_y = min_y.min(position.y);
        max_x = max_x.max(position.x);
        max_y = max_y.max(position.y);
    }
    (min_x, min_y, max_x, max_y)
}

fn collect_candidates(
    node_index: usize,
    center_x: f64,
    center_y: f64,
    pruning_radius2: f64,
    nodes: &[Node],
    indices: &[usize],
    candidates: &mut Vec<usize>,
) {
    let node = &nodes[node_index];
    if distance2_to_aabb(center_x, center_y, node) > pruning_radius2 { return; }
    if node.is_leaf() {
        candidates.extend_from_slice(&indices[node.start..node.end]);
        return;
    }
    collect_candidates(node.left.expect("internal left"), center_x, center_y, pruning_radius2, nodes, indices, candidates);
    collect_candidates(node.right.expect("internal right"), center_x, center_y, pruning_radius2, nodes, indices, candidates);
}

fn distance2_to_aabb(x: f64, y: f64, node: &Node) -> f64 {
    let dx = if x < node.min_x { node.min_x - x } else if x > node.max_x { x - node.max_x } else { 0.0 };
    let dy = if y < node.min_y { node.min_y - y } else if y > node.max_y { y - node.max_y } else { 0.0 };
    dx * dx + dy * dy
}

fn periodic_query_centers(value: f64, radius: f64, arena_size: f64) -> Vec<f64> {
    let half = arena_size / 2.0;
    let slack = PRUNING_ULPS * f64::EPSILON * arena_size.abs().max(radius.abs()).max(1.0);
    let mut centers = vec![value];
    if value - radius <= -half + slack { centers.push(value + arena_size); }
    if value + radius >= half - slack { centers.push(value - arena_size); }
    centers
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{BruteForceNeighbourIndex, ScientificRng, Vec2, RNG_DOMAIN_INITIALIZATION};

    fn random_state(arena_size: f64, count: usize, seed: u32) -> Vec<AgentPhysicalState> {
        let mut rng = ScientificRng::for_domain(seed, RNG_DOMAIN_INITIALIZATION, 0).unwrap();
        let half = arena_size / 2.0;
        (0..count)
            .map(|_| AgentPhysicalState {
                position: Vec2::new(rng.unit() * arena_size - half, rng.unit() * arena_size - half),
                heading_angle: rng.unit() * crate::TAU,
            })
            .collect()
    }

    fn boundary_bands(count: usize, arena_size: f64) -> Vec<AgentPhysicalState> {
        let half = arena_size / 2.0;
        let offset = arena_size * 0.0001;
        let per_side = ((count + 3) / 4).max(1);
        let spacing = arena_size / per_side as f64;
        (0..count)
            .map(|index| {
                let side = index % 4;
                let slot = index / 4;
                let along = -half + (slot as f64 + 0.5) * spacing;
                let position = match side {
                    0 => Vec2::new(-half + offset, along),
                    1 => Vec2::new(half - offset, along),
                    2 => Vec2::new(along, -half + offset),
                    _ => Vec2::new(along, half - offset),
                };
                AgentPhysicalState { position, heading_angle: 0.0 }
            })
            .collect()
    }

    fn assert_matches_brute_force(state: &[AgentPhysicalState], arena_size: f64, radii: &[f64]) {
        let brute = BruteForceNeighbourIndex;
        let mut bvh = AdaptivePeriodicBvh::default();
        bvh.rebuild(state, arena_size);
        let structure = bvh.structure_signature();
        let mut expected = Vec::new();
        let mut actual = Vec::new();
        for &radius in radii {
            for agent_index in 0..state.len() {
                brute.query(state, agent_index, radius, arena_size, &mut expected);
                bvh.query(state, agent_index, radius, arena_size, &mut actual);
                assert_eq!(actual, expected, "agent={agent_index} radius={radius} arena={arena_size}");
            }
            assert_eq!(bvh.structure_signature(), structure, "query radius changed BVH geometry");
        }
    }

    #[test]
    fn production_bvh_matches_brute_force_across_arena_sizes_and_simultaneous_radii() {
        for &(arena_size, count, seed) in &[(0.75, 24, 7), (3.7, 64, 91), (10.0, 211, 2026), (37.0, 400, 9917)] {
            let state = random_state(arena_size, count, seed);
            assert_matches_brute_force(&state, arena_size, &[0.05, 0.3, 0.81, 2.0, arena_size * 0.49, arena_size]);
        }
    }

    #[test]
    fn production_bvh_is_exact_across_periodic_boundary_bands() {
        let arena_size = 40.0;
        let state = boundary_bands(1000, arena_size);
        assert_matches_brute_force(&state, arena_size, &[0.1, 0.25, 1.0, 4.0, 10.0]);
    }

    #[test]
    fn production_strategy_identifier_is_stable() {
        assert_eq!(PRODUCTION_NEIGHBOUR_STRATEGY, "adaptive-periodic-bvh/v1");
    }
}
