function installShowcaseTouchTargets() {
  if (document.querySelector("style[data-vlab-showcase-touch-targets]")) return;
  const style = document.createElement("style");
  style.dataset.vlabShowcaseTouchTargets = "";
  style.textContent = `
    @media (max-width: 680px) {
      .showcase-head-actions button,
      .showcase-promote-current { min-height: 44px; }
    }
  `;
  document.head.append(style);
}

installShowcaseTouchTargets();
