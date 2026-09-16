function placeShowcaseCuration() {
  const curation = document.querySelector(".showcase-curation");
  const professorPanel = document.querySelector(".professor-panel");
  if (!curation || !professorPanel || curation.parentElement === professorPanel) return;
  professorPanel.append(curation);
}

const observer = new MutationObserver(placeShowcaseCuration);
observer.observe(document.body, { childList: true, subtree: true });
placeShowcaseCuration();
