mod adaptive_periodic_bvh;

use adaptive_periodic_bvh::AdaptivePeriodicBvh;
use vlab_kernel::{AgentPhysicalState, BruteForceNeighbourIndex, NeighbourIndex, Vec2};

const AGENTS: usize = 5_000;
const DENSITY: f64 = 1.0;
const BAND_OFFSET_FRACTION: f64 = 0.01;
const RADII: [f64; 5] = [0.1, 0.25, 1.0, 4.0, 10.0];

fn boundary_bands(count: usize, arena: f64, band_offset_fraction: f64) -> Vec<AgentPhysicalState> {
    let half = arena / 2.0;
    let offset = arena * band_offset_fraction;
    let per_side = ((count + 3) / 4).max(1);
    let spacing = arena / per_side as f64;
    (0..count)
        .map(|i| {
            let side = i % 4;
            let slot = i / 4;
            let along = -half + (slot as f64 + 0.5) * spacing;
            let position = match side {
                0 => Vec2::new(-half + offset, along),
                1 => Vec2::new(half - offset, along),
                2 => Vec2::new(along, -half + offset),
                _ => Vec2::new(along, half - offset),
            };
            AgentPhysicalState {
                position,
                heading_angle: (i % 64) as f64 * 0.03125,
            }
        })
        .collect()
}

fn main() {
    let arena = (AGENTS as f64 / DENSITY).sqrt();
    let state = boundary_bands(AGENTS, arena, BAND_OFFSET_FRACTION);
    let oracle = BruteForceNeighbourIndex;
    let mut bvh = AdaptivePeriodicBvh::default();
    bvh.rebuild(&state, arena);

    let mut expected = Vec::new();
    let mut actual = Vec::new();
    let mut checked_queries = 0usize;
    let mut accepted = 0usize;

    for radius in RADII {
        let mut accepted_for_radius = 0usize;
        for agent in 0..state.len() {
            oracle.query(&state, agent, radius, arena, &mut expected);
            bvh.query(&state, agent, radius, arena, &mut actual);
            assert_eq!(
                actual, expected,
                "large periodic BVH mismatch radius={radius} agent={agent}"
            );
            accepted_for_radius += actual.len();
            checked_queries += 1;
        }
        accepted += accepted_for_radius;
        println!(
            "boundary_exact,radius={radius:.6},queries={},accepted={accepted_for_radius}",
            state.len()
        );
    }

    println!("bvh_boundary_exactness_regression=pass");
    println!("agents={AGENTS}");
    println!("arena={arena:.12}");
    println!("checked_queries={checked_queries}");
    println!("accepted_total={accepted}");
}