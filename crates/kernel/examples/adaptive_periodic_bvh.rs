use vlab_kernel::{AgentPhysicalState, Vec2};

const LEAF_CAPACITY: usize = 8;
const PRUNING_ULPS: f64 = 64.0;

#[derive(Clone, Copy, Debug, Default)]
pub struct QueryStats {
    pub visited_nodes: usize,
    pub visited_leaves: usize,
    pub candidate_checks: usize,
}

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
        Self {
            min_x,
            min_y,
            max_x,
            max_y,
            left: None,
            right: None,
            start,
            end,
        }
    }

    fn internal(min_x: f64, min_y: f64, max_x: f64, max_y: f64, left: usize, right: usize) -> Self {
        Self {
            min_x,
            min_y,
            max_x,
            max_y,
            left: Some(left),
            right: Some(right),
            start: 0,
            end: 0,
        }
    }

    fn is_leaf(&self) -> bool {
        self.left.is_none()
    }
}

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
    pub fn rebuild(&mut self, state: &[AgentPhysicalState], arena_size: f64) {
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
        assert!(radius.is_finite() && radius > 0.0);
        debug_assert!(
            (arena_size - self.arena_size).abs() <= f64::EPSILON * arena_size.abs().max(1.0)
        );
        out.clear();
        let Some(root) = self.root else {
            return QueryStats::default();
        };

        let max_periodic_distance = arena_size * std::f64::consts::FRAC_1_SQRT_2;
        if radius >= max_periodic_distance {
            out.extend((0..state.len()).filter(|&i| i != agent_index));
            return QueryStats {
                visited_nodes: 1,
                visited_leaves: self.leaf_count,
                candidate_checks: state.len().saturating_sub(1),
            };
        }

        let origin = state[agent_index].position;
        let centers_x = periodic_query_centers(origin.x, radius, arena_size);
        let centers_y = periodic_query_centers(origin.y, radius, arena_size);
        let radius2 = radius * radius;
        // Broad-phase pruning must be conservative. Candidate inclusion is only
        // an optimization; the final minimum-image <= radius^2 test below is
        // authoritative. A small scale-aware slack prevents a mathematically
        // tangent AABB from being discarded after floating-point translation,
        // subtraction and squaring at periodic boundaries.
        let linear_slack =
            PRUNING_ULPS * f64::EPSILON * arena_size.abs().max(radius.abs()).max(1.0);
        let pruning_radius = radius + linear_slack;
        let pruning_radius2 = pruning_radius * pruning_radius;
        let mut candidates = Vec::new();
        let mut stats = QueryStats::default();

        for &cx in &centers_x {
            for &cy in &centers_y {
                collect_candidates(
                    root,
                    cx,
                    cy,
                    pruning_radius2,
                    &self.nodes,
                    &self.indices,
                    &mut candidates,
                    &mut stats,
                );
            }
        }

        candidates.sort_unstable();
        candidates.dedup();
        for candidate_index in candidates {
            if candidate_index == agent_index {
                continue;
            }
            stats.candidate_checks += 1;
            let displacement = minimum_image(state[candidate_index].position - origin, arena_size);
            if displacement.norm_squared() <= radius2 {
                out.push(candidate_index);
            }
        }
        out.sort_unstable();
        stats
    }

    pub fn node_count(&self) -> usize {
        self.nodes.len()
    }
    pub fn leaf_count(&self) -> usize {
        self.leaf_count
    }
    pub fn max_depth(&self) -> usize {
        self.max_depth
    }
    pub fn index_entries(&self) -> usize {
        self.indices.len() + self.nodes.len()
    }
    pub fn leaf_capacity(&self) -> usize {
        LEAF_CAPACITY
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
        let av = if split_x {
            state[a].position.x
        } else {
            state[a].position.y
        };
        let bv = if split_x {
            state[b].position.x
        } else {
            state[b].position.y
        };
        av.total_cmp(&bv).then_with(|| a.cmp(&b))
    });
    let mid = start + (end - start) / 2;
    let left = build_node(
        state,
        indices,
        nodes,
        start,
        mid,
        depth + 1,
        leaf_count,
        max_depth,
    );
    let right = build_node(
        state,
        indices,
        nodes,
        mid,
        end,
        depth + 1,
        leaf_count,
        max_depth,
    );
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
        let p = state[index].position;
        min_x = min_x.min(p.x);
        min_y = min_y.min(p.y);
        max_x = max_x.max(p.x);
        max_y = max_y.max(p.y);
    }
    (min_x, min_y, max_x, max_y)
}

fn collect_candidates(
    node_index: usize,
    cx: f64,
    cy: f64,
    pruning_radius2: f64,
    nodes: &[Node],
    indices: &[usize],
    candidates: &mut Vec<usize>,
    stats: &mut QueryStats,
) {
    let node = &nodes[node_index];
    stats.visited_nodes += 1;
    if distance2_to_aabb(cx, cy, node) > pruning_radius2 {
        return;
    }
    if node.is_leaf() {
        stats.visited_leaves += 1;
        candidates.extend_from_slice(&indices[node.start..node.end]);
        return;
    }
    collect_candidates(
        node.left.unwrap(),
        cx,
        cy,
        pruning_radius2,
        nodes,
        indices,
        candidates,
        stats,
    );
    collect_candidates(
        node.right.unwrap(),
        cx,
        cy,
        pruning_radius2,
        nodes,
        indices,
        candidates,
        stats,
    );
}

fn distance2_to_aabb(x: f64, y: f64, node: &Node) -> f64 {
    let dx = if x < node.min_x {
        node.min_x - x
    } else if x > node.max_x {
        x - node.max_x
    } else {
        0.0
    };
    let dy = if y < node.min_y {
        node.min_y - y
    } else if y > node.max_y {
        y - node.max_y
    } else {
        0.0
    };
    dx * dx + dy * dy
}

fn periodic_query_centers(value: f64, radius: f64, arena_size: f64) -> Vec<f64> {
    let half = arena_size / 2.0;
    let slack = PRUNING_ULPS * f64::EPSILON * arena_size.abs().max(radius.abs()).max(1.0);
    let mut centers = vec![value];
    if value - radius <= -half + slack {
        centers.push(value + arena_size);
    }
    if value + radius >= half - slack {
        centers.push(value - arena_size);
    }
    centers
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

fn main() {}
