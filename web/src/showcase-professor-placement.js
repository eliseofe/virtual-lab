function installShowcaseTouchTargets() {
  if (document.querySelector("style[data-vlab-showcase-touch-targets]")) return;
  const style = document.createElement("style");
  style.dataset.vlabShowcaseTouchTargets = "";
  style.textContent = `
    @media (max-width: 680px) {
      .showcase-head-actions button { min-height: 44px; }
    }
  `;
  document.head.append(style);
}

function placeShowcaseCuration() {
  const curation = document.querySelector(".showcase-curation");
  const shell = document.querySelector(".showcase-shell");
  const message = document.querySelector(".showcase-message");
  if (!curation || !shell || !message || curation.parentElement === shell) return;
  shell.insertBefore(curation, message);
}

installShowcaseTouchTargets();
const observer = new MutationObserver(placeShowcaseCuration);
observer.observe(document.body, { childList: true, subtree: true });
placeShowcaseCuration();
