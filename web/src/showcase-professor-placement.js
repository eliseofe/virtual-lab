function placeShowcaseCuration() {
  const curation = document.querySelector(".showcase-curation");
  const shell = document.querySelector(".showcase-shell");
  const message = document.querySelector(".showcase-message");
  if (!curation || !shell || !message || curation.parentElement === shell) return;
  shell.insertBefore(curation, message);
}

const observer = new MutationObserver(placeShowcaseCuration);
observer.observe(document.body, { childList: true, subtree: true });
placeShowcaseCuration();
