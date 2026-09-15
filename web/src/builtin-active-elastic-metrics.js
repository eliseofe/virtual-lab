export const BUILTIN_ACTIVE_ELASTIC_METRICS_SOURCE = `# Owner-authorized Active Elastic acceptance metric.
# Ferrante et al., Phys. Rev. Lett. 111, 268302 (2013).
# Global polarization/order parameter: psi = ||sum_i n_i|| / N.
# Sampling at 0.1 s is for live Virtual Lab acceptance/display only.
@metric(id="polarization", name="Polarization order parameter", unit=None, sampling=every(0.1))
def polarization(snapshot):
    total = Vec2(0.0, 0.0)
    for agent in snapshot.agents:
        total += agent.heading
    return norm(total) / snapshot.agent_count
`;

function installBuiltinMetricsArtifact() {
  const container = document.querySelector("#additional-experiment-artifacts");
  if (!container) throw new Error("Virtual Lab artifact UI mismatch: missing additional artifact container.");
  if (container.querySelector('[data-experiment-artifact-editor="true"][data-experiment-artifact-id="metrics"]')) return;

  const panel = document.createElement("section");
  panel.className = "panel editor-panel generic-artifact-panel";
  panel.dataset.experimentArtifactPanel = "metrics";

  const heading = document.createElement("div");
  heading.className = "stage-heading editor-heading";
  const titleWrap = document.createElement("div");
  const kicker = document.createElement("p");
  kicker.className = "section-kicker";
  kicker.textContent = "METRICS";
  const title = document.createElement("h2");
  title.textContent = "Metrics";
  titleWrap.append(kicker, title);
  heading.append(titleWrap);

  const editor = document.createElement("textarea");
  editor.className = "code-editor generic-artifact-editor";
  editor.spellcheck = false;
  editor.setAttribute("aria-label", "Metrics");
  editor.dataset.experimentArtifactEditor = "true";
  editor.dataset.experimentArtifactId = "metrics";
  editor.dataset.experimentArtifactType = "metrics";
  editor.dataset.experimentArtifactLabel = "Metrics";
  editor.dataset.experimentArtifactFormat = "python-vlab-metrics/0.1";
  editor.dataset.experimentArtifactOrder = "40";
  editor.value = BUILTIN_ACTIVE_ELASTIC_METRICS_SOURCE;

  panel.append(heading, editor);
  container.append(panel);
}

installBuiltinMetricsArtifact();
