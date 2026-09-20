# Swarm vs Swarm: fork implementation

This branch implements an **opt-in** runtime profile and four editable experiment
presets. It does not deploy capabilities to the upstream website or Supabase.
Student/professor privileges, RLS, authentication, capability-request approval,
and experiment ownership remain unchanged. Presets load into the existing
workspace; saving a copy uses its existing permission checks.

## Running

From the repository root:

```bash
npm ci --prefix web
wasm-pack build crates/kernel --release --target web --out-dir ../../web/public/wasm --out-name vlab_kernel
npm run build --prefix web
python3 -m http.server 4173 --bind 127.0.0.1 --directory web/dist
```

Open `http://127.0.0.1:4173/`, choose **Swarm vs Swarm**, select a case, populations
and range, then **Load experiment** and **Run**. Existing Run, Pause, Restart,
new-seed restart, configuration, controller, metrics and result export controls
are reused. Loading a preset generates a fresh random seed. Restart replays that
seed; new-seed restart draws another one. Both populations receive independent
uniform initial headings. The default built-in experiment stays unchanged.

Use the preset form to change population or range: it regenerates equilibrium
positions, profile counts and observation horizons together. Directly editing
`N` alone cannot change a literal Initialization artifact. A manually authored
profile must give each group a radius covering all its required observation
ranges; the controller then applies its own narrower scientific cutoffs.

## Experiment mathematics

Attackers are group 0; defenders are group 1. For agent i, the opposite-group
signal within sensing range R is

    s_i = |V_i| / sum_{j in V_i} ||x_j-x_i||,

with zero signal when there are no visible agents (or the denominator is zero).
All agents in these presets have sensing. DM only is used:

    sigma_i = sigma_0 (1 + lambda s_i)       attackers
    sigma_i = sigma_0 (1 - lambda s_i)       responding defenders
    sigma_i = sigma_0                        nonresponding defenders
    d_ij = ||x_j-x_i|| + 1e-9
    F_i = sum_j epsilon (sigma_i^2/d_ij^3 - 2 sigma_i^4/d_ij^5) e_ij

The sum includes active, same-group neighbours with d_ij <= Dp, excludes self,
and e_ij points from receiver i to neighbour j. Signed defender sigma is not
clipped; DM uses its even powers. There is no added direct chase/escape vector.
Sensing modulates within-swarm spacing, which generates pursuit and escape.

    u_i = clip(K1 F_i dot h_i + U0, 0, umax)
    w_i = clip(K2 F_i dot perpendicular(h_i), -wmax, wmax)

Planar positions update using the old heading; heading then advances by w_i dt.
Independent uniform Cartesian velocity noise in [-0.05,0.05] is added before
multiplication by dt, matching the kinematic noise convention. Fixed test seeds
are only reproducibility fixtures, not mandatory experimental seeds.

Initial formations are the COM-centered nearest hexagonal sites. Their uniform
scale solves sum_{i<j, d_ij<=Dp} q(d_ij) d_ij = 0 on a continuous interval between
cutoff transitions. In baseline, bisection places the swarms at closest-pair gap
0.5 R. This is a **minimum inter-agent gap**, not a centre-distance approximation.
It does not imply equal visibility fractions at every later time.

### Planar cases

All run for up to 1500 simulation seconds, with dt=0.05, R selectable,
Dp=3.5, sigma0=0.7, epsilon=12, lambda=1, K1=0.5, K2=0.05,
U0=0.05, umax=0.15, wmax=pi/3, capture distance=0.5.

1. Baseline: immediate pursuit; responding defenders; no target.
2. Target: no defender sensing response; normalized target attraction gain 0.8.
3. Target: negative defender sensing response plus the same target attraction.

In cases 2/3 defenders start around (-10,0) with target (15,0). Attackers are
placed beyond the chase plane x=-2 and on one side of the route, with closest
pair distance R at the idealized first crossing. Until an active defender
crosses the plane, attackers receive zero motion commands and cross-group
sensing is blocked. The ordinary Cartesian noise still applies, as in the
planar update rule. A target-reaching defender within distance 1 is removed;
a simultaneous capture takes priority. All headings are random here as requested,
including target-case defenders; this intentionally differs from target-facing
initial headings in some prior target experiments.

### Physical laboratory

This is an actual Bullet rigid-body backend through Ammo WASM, not elevated 2D
positions. It includes CF2X mass/inertia, motor thrust and torque, gravity,
floor/wall/ceiling contacts and cascaded flight control. Physics runs at 240 Hz,
flight control at 120 Hz and the authored DM controller at 20 Hz. The controller
integrates its commanded planar heading independently of measured body yaw.
Rendering uses physical position and quaternion. Metrics report measured body
yaw and speed, rather than substituting commanded velocities.

The bounded profile uses a 4.4 x 7.9 x 2.2 m laboratory, attacker/defender
altitudes 0.6/0.5 m, and the established 0.3 scaling policy:
R=0.3*requested R, Dp=1.05, sigma0=0.21, capture distance=0.15.
Lambda=0.2, epsilon=12, K1/K2/U0, speed/turn caps, clocks and actual laboratory
geometry retain their physical calibration. Boundary weight is 0.3 and
repulsion at wall distance d<0.5 is 2(1/d-1/0.5)/d^3 directed inward; zero
distance contributes zero as in the reference convention. **No target is added.**
Large formations that do not fit the laboratory are rejected, not compressed.

Capture compares measured XY separation, including threshold equality, after
each 20 Hz control interval. Both backends use one stable identity/lifecycle
pipeline: captured defenders have status -1, target arrivals status 2. Resolved
agents stop moving/sensing and their physical bodies leave the collision world;
read-only outcome records remain available to metrics. The run ends when all
defenders resolve or the time limit expires. No lost-prey/DCOM stop is added.

Bullet/Ammo and PyBullet are different engine builds. Force-law and flight-PID
reference tests support numerical command parity; they do **not** establish
bit-identical contact trajectories or interchangeable research datasets.

## Generic capability boundary

`RUNTIME_PROFILE` is a JSON string with schema `vlab.runtime-profile/1` inside
Configuration, not arbitrary executable code. It selects a known backend,
contiguous profile assignment, local horizons, actuator bounds, geometry,
ordered proximity/region lifecycle rules, optional local landmarks and a plane
activation gate. `$PARAMETER` references resolve declared Configuration values.
The parser rejects invalid groups, inconsistent counts, clocks and geometry.
Controllers still execute through the restricted Rust IR runtime. They receive
only local heading/group and visible relative offsets/group/kind, never world
state. `eq`, `le`, `min`, `max` are pure scalar intrinsics.

Metrics execute through the existing Rust observer with added read-only group,
active, status, measured speed and altitude fields. Profile samples are marked
`post-physics-state/1` (unwrapped, after lifecycle); default experiments retain
`post-physics-wrapped-state/1`. Eight preset metrics report active count, order,
mean speed for each group and defender captures/target arrivals. With zero
active members, order/speed return 0 by explicit convention; use active count
to distinguish that state from a disordered/motionless nonempty group.
Profile metadata and seeds are included in existing result manifests.

Periodic geometry and scalar environment fields are currently unsupported **in
profile experiments** and rejected. The default periodic scalar-field runtime
keeps its existing execution path. Changing metrics must not restart physics,
change controller private state, or consume randomness.

## Validation

```bash
cargo test --workspace
node --test web/tests/*.test.mjs
node --test web/integration/*.test.mjs  # after building WASM
npm run typecheck --prefix web
node web/scripts/verify-dist.mjs       # after building web
node web/scripts/browser-smoke.mjs http://127.0.0.1:4173/
node web/scripts/swarm-profile-smoke.mjs http://127.0.0.1:4173/
```

Browser smoke scripts use the shared Chrome harness and Node 22+ (Node 20 can
use `--experimental-websocket`). Tests cover the original experiment, compiler
parity, DM force reference, equilibrium and minimum-gap placement, signed
response, capture threshold/priority/removal, gate onset, replay, metric
invariance, real Bullet gravity/contacts/altitude, CF2X Python PID parity and
120-second runs. The browser check loads all four presets and exercises actual
Run/Pause/Restart, rendered canvas and transported metrics.
