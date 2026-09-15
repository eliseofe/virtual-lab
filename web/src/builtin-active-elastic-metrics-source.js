export const BUILTIN_ACTIVE_ELASTIC_METRICS_SOURCE = `# Owner-authorized Active Elastic live metrics.
# Ferrante et al., Phys. Rev. Lett. 111, 268302 (2013) use polarization to
# distinguish the translating ordered state from low-polarization motion.
# The complementary instantaneous normalized angular-momentum/milling order
# parameter below was explicitly authorized by the experiment owner to measure
# coherent rotation rather than translation.
# Sampling at 0.1 s is for live Virtual Lab acceptance/display only.
@metric(id="polarization", name="Polarization order parameter", unit=None, sampling=every(0.1))
def polarization(snapshot):
    total = Vec2(0.0, 0.0)
    for agent in snapshot.agents:
        total += agent.heading
    return norm(total) / snapshot.agent_count

@metric(id="angular_momentum", name="Angular momentum order parameter", unit=None, sampling=every(0.1))
def angular_momentum(snapshot):
    center = Vec2(0.0, 0.0)
    for agent in snapshot.agents:
        center += agent.position
    center = center / snapshot.agent_count
    rotation = 0.0
    for agent in snapshot.agents:
        radial = agent.position - center
        radial_hat = radial / max(norm(radial), 1e-12)
        rotation += cross2(radial_hat, agent.heading)
    return abs(rotation) / snapshot.agent_count
`;
