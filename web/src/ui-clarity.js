function setText(selector, text) {
  const element = document.querySelector(selector);
  if (element && element.textContent !== text) element.textContent = text;
}

setText(".eyebrow", "SWARM ROBOTICS");
setText("h1", "Virtual Lab");
setText("#arena-heading", "Simulation");
setText(".stage-heading .badge", "Periodic arena");
setText("#authoring-heading", "Authoring");
setText('label[for="simulation-speed"]', "Execution speed");

const speed = document.querySelector("#simulation-speed");
if (speed) speed.title = "Wall-clock speed only; simulation dynamics are unchanged.";

document.documentElement.dataset.vlabUiClarity = "true";

