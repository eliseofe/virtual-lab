import { supabase } from "./supabase-client.js";
import {
  SOURCE_LABEL,
  SOURCE_ORDER,
  availableSources as availableSourcesFor,
  contextLabel,
  effectiveSort,
  entryId,
  loadedMatches as loadedMatchesFor,
  normalizedName,
  ownerGroups,
  results,
  revisionBadge,
  rowMeta,
  searchPlaceholder as searchPlaceholderFor,
  sortChoices,
} from "./library/browse.js";


const STATE_PREFIX = "vlab-experiment-library-state-v1:";

let sessionUser = null;
let profile = null;
let showcaseEntries = [];
let showcaseCollections = [];
let mineExperiments = [];
let mineCollections = [];
let sharedExperiments = [];
let supervisedExperiments = [];
let expandedKey = null;
let copyKey = null;
let busy = false;

const navigation = {
  source: "showcase",
  showcase: { kind: "all", id: null },
  mine: { kind: "all", id: null },
  shared: { kind: "all", id: null },
  supervised: { researcherId: null, kind: "all", id: null },
  query: "",
  scope: "here",
  sort: "updated",
  scrollTop: 0,
};

function bridge() {
  const value = window.vlabExperimentLibraryBridge;
  if (!value) throw new Error("Experiment Library bridge is not ready.");
  return value;
}

function button(text, className = "") {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function buildUi() {
  const dialog = document.createElement("dialog");
  dialog.className = "vlab-library";
  dialog.setAttribute("aria-label", "Experiment library");

  const shell = document.createElement("div");
  shell.className = "vlab-library-shell";

  const head = document.createElement("div");
  head.className = "vlab-library-head";
  const title = document.createElement("h2");
  title.textContent = "Experiment library";
  const headActions = document.createElement("div");
  headActions.className = "vlab-library-head-actions";
  const refresh = button("Refresh");
  const close = button("Close");
  headActions.append(refresh, close);
  head.append(title, headActions);

  const loaded = button("", "vlab-library-loaded");
  loaded.setAttribute("aria-label", "Locate loaded Experiment");

  const sources = document.createElement("div");
  sources.className = "vlab-library-sources";
  const sourceTabs = document.createElement("div");
  sourceTabs.className = "vlab-library-source-tabs";
  sourceTabs.setAttribute("role", "tablist");
  sourceTabs.setAttribute("aria-label", "Experiment source");
  const sourceSelectWrap = document.createElement("div");
  sourceSelectWrap.className = "vlab-library-source-select";
  const sourceLabel = document.createElement("label");
  sourceLabel.textContent = "Source";
  const sourceSelect = document.createElement("select");
  sourceSelect.setAttribute("aria-label", "Experiment source");
  sourceSelectWrap.append(sourceLabel, sourceSelect);
  sources.append(sourceTabs, sourceSelectWrap);

  const toolbar = document.createElement("div");
  toolbar.className = "vlab-library-toolbar";
  const search = document.createElement("div");
  search.className = "vlab-library-search";
  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.setAttribute("aria-label", "Search Experiment library");
  const searchScope = document.createElement("select");
  searchScope.setAttribute("aria-label", "Search scope");
  for (const [value, label] of [["here", "Here"], ["all", "All sources"]]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    searchScope.append(option);
  }
  const clearSearch = button("Clear", "vlab-library-clear");
  clearSearch.hidden = true;
  search.append(searchInput, searchScope, clearSearch);

  const breadcrumb = document.createElement("nav");
  breadcrumb.className = "vlab-library-breadcrumb";
  breadcrumb.setAttribute("aria-label", "Experiment library path");
  toolbar.append(search, breadcrumb);

  const layout = document.createElement("div");
  layout.className = "vlab-library-layout";
  const directory = document.createElement("nav");
  directory.className = "vlab-library-directory";
  directory.setAttribute("aria-label", "Experiment library directory");

  const resultsWrap = document.createElement("div");
  resultsWrap.className = "vlab-library-results-wrap";
  const resultsHead = document.createElement("div");
  resultsHead.className = "vlab-library-results-head";
  const status = document.createElement("p");
  status.className = "vlab-library-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const sort = document.createElement("select");
  sort.className = "vlab-library-sort";
  sort.setAttribute("aria-label", "Sort experiments");
  resultsHead.append(status, sort);
  const results = document.createElement("div");
  results.className = "vlab-library-results";
  resultsWrap.append(resultsHead, results);
  layout.append(directory, resultsWrap);

  shell.append(head, loaded, sources, toolbar, layout);
  dialog.append(shell);
  document.body.append(dialog);
  return {
    dialog, close, refresh, loaded, sourceTabs, sourceSelect,
    searchInput, searchScope, clearSearch, breadcrumb, directory,
    status, sort, results,
  };
}
const ui = buildUi();

function availableSources() {
  return availableSourcesFor({ signedIn: Boolean(sessionUser), role: profile?.role });
}

function stateKey() {
  return `${STATE_PREFIX}${sessionUser?.id ?? "anonymous"}`;
}

function clearForeignSessionState() {
  try {
    const keep = stateKey();
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(STATE_PREFIX) && key !== keep) sessionStorage.removeItem(key);
    }
  } catch (error) {
    console.warn("Could not clear Experiment Library session state.", error);
  }
}

function rememberNavigation() {
  try {
    sessionStorage.setItem(stateKey(), JSON.stringify({
      source: navigation.source,
      showcase: navigation.showcase,
      mine: navigation.mine,
      shared: navigation.shared,
      supervised: navigation.supervised,
      query: navigation.query,
      scope: navigation.scope,
      sort: navigation.sort,
      scrollTop: ui.results.scrollTop,
    }));
  } catch (error) {
    console.warn("Could not remember Experiment Library navigation.", error);
  }
}

function restoreNavigation() {
  clearForeignSessionState();
  let stored = null;
  try {
    stored = JSON.parse(sessionStorage.getItem(stateKey()) || "null");
  } catch {
    stored = null;
  }
  if (!stored || typeof stored !== "object") return;
  if (availableSources().includes(stored.source)) navigation.source = stored.source;
  for (const source of SOURCE_ORDER) {
    if (stored[source] && typeof stored[source] === "object") navigation[source] = stored[source];
  }
  navigation.query = typeof stored.query === "string" ? stored.query : "";
  navigation.scope = stored.scope === "all" ? "all" : "here";
  navigation.sort = typeof stored.sort === "string" ? stored.sort : "updated";
  navigation.scrollTop = Number.isFinite(stored.scrollTop) ? stored.scrollTop : 0;
}

function libraryData() {
  return {
    showcase: showcaseEntries,
    mine: mineExperiments,
    shared: sharedExperiments,
    supervised: supervisedExperiments,
    showcaseCollections,
    mineCollections,
  };
}

function loadedMatches(source, row) {
  return loadedMatchesFor(bridge().getState().loaded, source, row);
}

function activeContextLabel() {
  return contextLabel(navigation, libraryData());
}

function searchPlaceholder() {
  return searchPlaceholderFor(navigation, libraryData());
}

function directoryButton(label, count, selected, handler) {
  const element = button("");
  const name = document.createElement("span");
  name.textContent = label;
  element.append(name);
  if (Number.isFinite(count)) {
    const badge = document.createElement("small");
    badge.textContent = String(count);
    element.append(badge);
  }
  element.setAttribute("aria-selected", String(selected));
  element.addEventListener("click", () => {
    handler();
    navigation.scrollTop = 0;
    rememberNavigation();
    render();
  });
  return element;
}

function renderSources() {
  const sources = availableSources();
  if (!sources.includes(navigation.source)) navigation.source = sessionUser ? "mine" : "showcase";
  ui.sourceTabs.replaceChildren();
  ui.sourceSelect.replaceChildren();
  for (const source of sources) {
    const tab = button(SOURCE_LABEL[source]);
    tab.setAttribute("role", "tab");
    tab.dataset.source = source;
    tab.setAttribute("aria-selected", String(navigation.source === source));
    tab.addEventListener("click", () => selectSource(source));
    ui.sourceTabs.append(tab);

    const option = document.createElement("option");
    option.value = source;
    option.textContent = SOURCE_LABEL[source];
    ui.sourceSelect.append(option);
  }
  ui.sourceSelect.value = navigation.source;
}

function selectSource(source) {
  if (!availableSources().includes(source)) return;
  navigation.source = source;
  expandedKey = null;
  copyKey = null;
  navigation.scrollTop = 0;
  rememberNavigation();
  render();
}

function renderDirectory() {
  ui.directory.replaceChildren();
  const source = navigation.source;
  if (source === "showcase") {
    ui.directory.append(directoryButton("All Showcase", showcaseEntries.length, navigation.showcase.kind === "all", () => {
      navigation.showcase = { kind: "all", id: null };
    }));
    for (const collection of showcaseCollections) {
      const count = showcaseEntries.filter((row) => row.showcase_collection_id === collection.showcase_collection_id).length;
      ui.directory.append(directoryButton(collection.name, count, navigation.showcase.kind === "collection" && navigation.showcase.id === collection.showcase_collection_id, () => {
        navigation.showcase = { kind: "collection", id: collection.showcase_collection_id };
      }));
    }
    const uncategorized = showcaseEntries.filter((row) => !row.showcase_collection_id).length;
    ui.directory.append(directoryButton("Uncategorized", uncategorized, navigation.showcase.kind === "uncategorized", () => {
      navigation.showcase = { kind: "uncategorized", id: null };
    }));
    return;
  }

  if (source === "mine") {
    ui.directory.append(directoryButton("All in Mine", mineExperiments.length, navigation.mine.kind === "all", () => {
      navigation.mine = { kind: "all", id: null };
    }));
    const unfiled = mineExperiments.filter((row) => !row.collection_id).length;
    ui.directory.append(directoryButton("Unfiled", unfiled, navigation.mine.kind === "unfiled", () => {
      navigation.mine = { kind: "unfiled", id: null };
    }));
    for (const collection of mineCollections) {
      const count = mineExperiments.filter((row) => row.collection_id === collection.id).length;
      ui.directory.append(directoryButton(collection.name, count, navigation.mine.kind === "collection" && navigation.mine.id === collection.id, () => {
        navigation.mine = { kind: "collection", id: collection.id };
      }));
    }
    return;
  }

  if (source === "shared") {
    ui.directory.append(directoryButton("All shared", sharedExperiments.length, navigation.shared.kind === "all", () => {
      navigation.shared = { kind: "all", id: null };
    }));
    for (const owner of ownerGroups(sharedExperiments)) {
      ui.directory.append(directoryButton(owner.label, owner.count, navigation.shared.kind === "owner" && navigation.shared.id === owner.id, () => {
        navigation.shared = { kind: "owner", id: owner.id };
      }));
    }
    return;
  }

  const researchers = ownerGroups(supervisedExperiments);
  const selected = researchers.find((item) => item.id === navigation.supervised.researcherId);
  if (!selected) {
    navigation.supervised = { researcherId: null, kind: "all", id: null };
    for (const researcher of researchers) {
      ui.directory.append(directoryButton(researcher.label, researcher.count, false, () => {
        navigation.supervised = { researcherId: researcher.id, kind: "all", id: null };
      }));
    }
    return;
  }

  ui.directory.append(directoryButton("All researchers", researchers.length, false, () => {
    navigation.supervised = { researcherId: null, kind: "all", id: null };
  }));
  const researcherRows = supervisedExperiments.filter((row) => row.owner_id === selected.id);
  ui.directory.append(directoryButton(`All by ${selected.label}`, researcherRows.length, navigation.supervised.kind === "all", () => {
    navigation.supervised = { researcherId: selected.id, kind: "all", id: null };
  }));
  const unfiled = researcherRows.filter((row) => !row.collection_id).length;
  ui.directory.append(directoryButton("Unfiled", unfiled, navigation.supervised.kind === "unfiled", () => {
    navigation.supervised = { researcherId: selected.id, kind: "unfiled", id: null };
  }));
  const collections = new Map();
  for (const row of researcherRows) {
    if (!row.collection_id || !row.collection_name) continue;
    const item = collections.get(row.collection_id) ?? { id: row.collection_id, name: row.collection_name, count: 0 };
    item.count += 1;
    collections.set(row.collection_id, item);
  }
  for (const collection of [...collections.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    ui.directory.append(directoryButton(collection.name, collection.count, navigation.supervised.kind === "collection" && navigation.supervised.id === collection.id, () => {
      navigation.supervised = { researcherId: selected.id, kind: "collection", id: collection.id };
    }));
  }
}

function breadcrumbButton(label, handler) {
  const element = button(label);
  element.addEventListener("click", () => {
    handler();
    navigation.scrollTop = 0;
    rememberNavigation();
    render();
  });
  return element;
}

function renderBreadcrumb() {
  ui.breadcrumb.replaceChildren();
  const source = navigation.source;
  const sourceLabel = SOURCE_LABEL[source];

  const appendSep = () => {
    const sep = document.createElement("span");
    sep.textContent = "/";
    sep.setAttribute("aria-hidden", "true");
    ui.breadcrumb.append(sep);
  };

  if (source === "showcase") {
    if (navigation.showcase.kind === "all") {
      const current = document.createElement("strong");
      current.textContent = "Showcase";
      ui.breadcrumb.append(current);
      return;
    }
    ui.breadcrumb.append(breadcrumbButton("Showcase", () => { navigation.showcase = { kind: "all", id: null }; }));
    appendSep();
    const current = document.createElement("strong");
    current.textContent = activeContextLabel();
    ui.breadcrumb.append(current);
    return;
  }

  if (source === "mine") {
    if (navigation.mine.kind === "all") {
      const current = document.createElement("strong");
      current.textContent = "Mine";
      ui.breadcrumb.append(current);
      return;
    }
    ui.breadcrumb.append(breadcrumbButton("Mine", () => { navigation.mine = { kind: "all", id: null }; }));
    appendSep();
    const current = document.createElement("strong");
    current.textContent = activeContextLabel();
    ui.breadcrumb.append(current);
    return;
  }

  if (source === "shared") {
    if (navigation.shared.kind === "all") {
      const current = document.createElement("strong");
      current.textContent = "Shared";
      ui.breadcrumb.append(current);
      return;
    }
    ui.breadcrumb.append(breadcrumbButton("Shared", () => { navigation.shared = { kind: "all", id: null }; }));
    appendSep();
    const current = document.createElement("strong");
    current.textContent = activeContextLabel();
    ui.breadcrumb.append(current);
    return;
  }

  const researcher = ownerGroups(supervisedExperiments).find((item) => item.id === navigation.supervised.researcherId);
  if (!researcher) {
    const current = document.createElement("strong");
    current.textContent = sourceLabel;
    ui.breadcrumb.append(current);
    return;
  }
  ui.breadcrumb.append(breadcrumbButton("Supervised", () => {
    navigation.supervised = { researcherId: null, kind: "all", id: null };
  }));
  appendSep();
  if (navigation.supervised.kind === "all") {
    const current = document.createElement("strong");
    current.textContent = researcher.label;
    ui.breadcrumb.append(current);
    return;
  }
  ui.breadcrumb.append(breadcrumbButton(researcher.label, () => {
    navigation.supervised = { researcherId: researcher.id, kind: "all", id: null };
  }));
  appendSep();
  const current = document.createElement("strong");
  current.textContent = activeContextLabel();
  ui.breadcrumb.append(current);
}

function formatDateTime(value) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  }).format(date);
}

async function openRow(source, row, runAfter = false) {
  if (busy) return;
  if (loadedMatches(source, row)) {
    ui.dialog.close();
    if (runAfter) document.querySelector("#run")?.click();
    return;
  }
  busy = true;
  setStatus("Opening…");
  try {
    const opened = source === "showcase"
      ? await bridge().openShowcase(row)
      : await bridge().openRegistry(row.experiment_id, source === "mine" ? "owned" : source);
    if (opened === false) return;
    if (runAfter) document.querySelector("#run")?.click();
    ui.dialog.close();
  } finally {
    busy = false;
  }
}

function detailsDefinition(source, row) {
  const list = document.createElement("dl");
  const pairs = [];
  if (source !== "showcase" && source !== "mine") pairs.push(["Owner", normalizedName(row.owner_display_name)]);
  if (source === "showcase") {
    pairs.push(["Collection", row.showcase_collection_name || "Uncategorized"]);
    pairs.push(["Access", "Public read-only"]);
    pairs.push(["Revision", row.source_revision == null ? "Catalog" : `R${row.source_revision}`]);
    pairs.push(["Published", formatDateTime(row.published_at)]);
    pairs.push(["Curator", row.published_by_name || "Not recorded"]);
  } else {
    if (source === "mine" || source === "supervised") pairs.push(["Collection", row.collection_name || "Unfiled"]);
    pairs.push(["Access", source === "mine" ? "Editable" : "Read-only"]);
    pairs.push(["Latest revision", `R${row.revision}`]);
    pairs.push(["Revision time", formatDateTime(row.revision_created_at)]);
    pairs.push(["Revision actor", row.revision_actor || "Not recorded"]);
  }
  for (const [term, description] of pairs) {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = description;
    list.append(dt, dd);
  }
  return list;
}

function copyForm(source, row, key) {
  const form = document.createElement("div");
  form.className = "vlab-library-copy";
  const title = document.createElement("input");
  title.setAttribute("aria-label", "Copy name");
  title.value = `${row.title} copy`;
  const collection = document.createElement("select");
  collection.setAttribute("aria-label", "Destination collection");
  const unfiled = document.createElement("option");
  unfiled.value = "";
  unfiled.textContent = "Unfiled";
  collection.append(unfiled);
  for (const item of mineCollections) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    collection.append(option);
  }
  const confirm = button("Make a copy");
  confirm.className = "primary";
  const cancel = button("Cancel");
  cancel.addEventListener("click", () => {
    copyKey = null;
    render();
  });
  confirm.addEventListener("click", async () => {
    const copyTitle = title.value.trim();
    if (!copyTitle) {
      setStatus("Enter a name for the copy.", "error");
      title.focus();
      return;
    }
    busy = true;
    confirm.disabled = true;
    setStatus("Copying…");
    try {
      if (source === "showcase") {
        await bridge().copyShowcase(row, copyTitle, collection.value || null);
      } else {
        await bridge().copyRegistry(row.experiment_id, row.revision, copyTitle, collection.value || null);
      }
      await loadData();
      copyKey = null;
      expandedKey = null;
      setStatus("Copy created and loaded.");
      render();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), "error");
      confirm.disabled = false;
    } finally {
      busy = false;
    }
  });
  form.append(title, collection, confirm, cancel);
  queueMicrotask(() => {
    if (copyKey === key) title.focus({ preventScroll: true });
  });
  return form;
}

function experimentRow(source, row) {
  const key = `${source}:${entryId(source, row)}`;
  const container = document.createElement("article");
  container.className = "vlab-library-row";
  container.dataset.loaded = String(loadedMatches(source, row));

  const top = document.createElement("div");
  top.className = "vlab-library-row-top";
  const titleWrap = document.createElement("div");
  titleWrap.className = "vlab-library-row-title";
  const title = document.createElement("strong");
  title.textContent = row.title;
  const meta = document.createElement("span");
  meta.className = "vlab-library-meta";
  meta.textContent = rowMeta(source, row);
  titleWrap.append(title, meta);
  const badges = document.createElement("div");
  badges.className = "vlab-library-badges";
  const revision = document.createElement("span");
  revision.className = "vlab-library-badge";
  revision.textContent = revisionBadge(source, row);
  badges.append(revision);
  if (loadedMatches(source, row)) {
    const loaded = document.createElement("span");
    loaded.className = "vlab-library-badge loaded";
    loaded.textContent = "Loaded";
    badges.append(loaded);
  }
  top.append(titleWrap, badges);

  const actions = document.createElement("div");
  actions.className = "vlab-library-row-actions";
  const open = button(loadedMatches(source, row) ? "Return to Lab" : "Open");
  open.className = "primary";
  open.addEventListener("click", () => run(() => openRow(source, row)));
  const details = button(expandedKey === key ? "Hide details" : "Details");
  details.setAttribute("aria-expanded", String(expandedKey === key));
  details.addEventListener("click", () => {
    expandedKey = expandedKey === key ? null : key;
    if (expandedKey !== key) copyKey = null;
    render();
  });
  actions.append(open, details);
  container.append(top, actions);

  if (expandedKey === key) {
    const panel = document.createElement("div");
    panel.className = "vlab-library-details";
    panel.append(detailsDefinition(source, row));
    if (row.description) {
      const description = document.createElement("p");
      description.textContent = row.description;
      panel.append(description);
    }
    const secondary = document.createElement("div");
    secondary.className = "vlab-library-row-actions";
    const openRun = button("Open & run");
    openRun.addEventListener("click", () => run(() => openRow(source, row, true)));
    secondary.append(openRun);
    if (source !== "mine") {
      if (sessionUser) {
        const copy = button(copyKey === key ? "Copy options open" : "Make a copy");
        copy.disabled = copyKey === key;
        copy.addEventListener("click", () => {
          copyKey = key;
          render();
        });
        secondary.append(copy);
      } else {
        const signIn = button("Sign in to copy");
        signIn.addEventListener("click", () => {
          rememberNavigation();
          ui.dialog.close();
          document.querySelector("#account-menu")?.click();
        });
        secondary.append(signIn);
      }
    }
    panel.append(secondary);
    if (copyKey === key) panel.append(copyForm(source, row, key));
    container.append(panel);
  }
  return container;
}

function renderResults() {
  ui.results.replaceChildren();
  const shown = results({ navigation, data: libraryData(), sources: availableSources() });
  for (const group of shown.groups) {
    if (group.label === null) {
      for (const row of group.rows) ui.results.append(experimentRow(group.source, row));
      continue;
    }
    const section = document.createElement("section");
    section.className = "vlab-library-group";
    const heading = document.createElement("h3");
    heading.className = "vlab-library-group-head";
    heading.textContent = group.label;
    section.append(heading);
    for (const row of group.rows) section.append(experimentRow(group.source, row));
    ui.results.append(section);
  }
  if (shown.empty) {
    const empty = document.createElement("p");
    empty.className = "vlab-library-empty";
    empty.textContent = shown.empty;
    ui.results.append(empty);
  }
  ui.status.textContent = shown.status;
}

function renderSort() {
  ui.sort.replaceChildren();
  const source = navigation.source;
  navigation.sort = effectiveSort(source, navigation.sort);
  for (const [value, label] of sortChoices(source)) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    ui.sort.append(option);
  }
  ui.sort.value = navigation.sort;
}

function renderLoaded() {
  const loaded = bridge().getState().loaded;
  ui.loaded.replaceChildren();
  const label = document.createElement("span");
  label.textContent = "Loaded";
  const title = document.createElement("strong");
  title.textContent = loaded?.title || "None";
  ui.loaded.append(label, title);
  ui.loaded.disabled = !loaded;
}

function render() {
  renderSources();
  renderLoaded();
  renderDirectory();
  renderBreadcrumb();
  renderSort();
  ui.searchInput.value = navigation.query;
  ui.searchScope.value = navigation.scope;
  ui.searchInput.placeholder = searchPlaceholder();
  ui.clearSearch.hidden = !navigation.query;
  renderResults();
  requestAnimationFrame(() => {
    ui.results.scrollTop = navigation.scrollTop;
  });
}

function setStatus(message, state = "idle") {
  ui.status.textContent = message;
  ui.status.dataset.state = state;
}

async function loadSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  sessionUser = data.session?.user ?? null;
  profile = null;
  if (!sessionUser) return;
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("id,display_name,role")
    .eq("id", sessionUser.id)
    .maybeSingle();
  if (profileError) throw profileError;
  profile = profileData;
}

async function loadData() {
  await loadSession();
  const publicQueries = [
    supabase.rpc("list_showcase_experiments"),
    supabase.rpc("list_showcase_collections"),
  ];
  const [showcaseResult, showcaseCollectionResult] = await Promise.all(publicQueries);
  if (showcaseResult.error) throw showcaseResult.error;
  if (showcaseCollectionResult.error) throw showcaseCollectionResult.error;
  showcaseEntries = showcaseResult.data ?? [];
  showcaseCollections = showcaseCollectionResult.data ?? [];

  if (!sessionUser) {
    mineExperiments = [];
    mineCollections = [];
    sharedExperiments = [];
    supervisedExperiments = [];
    return;
  }

  const [mineResult, collectionResult, sharedResult] = await Promise.all([
    supabase.rpc("list_experiment_library_mine"),
    supabase.from("experiment_collections").select("id,name").order("name", { ascending: true }),
    supabase.rpc("list_experiment_library_shared"),
  ]);
  if (mineResult.error) throw mineResult.error;
  if (collectionResult.error) throw collectionResult.error;
  if (sharedResult.error) throw sharedResult.error;
  mineExperiments = mineResult.data ?? [];
  mineCollections = collectionResult.data ?? [];
  sharedExperiments = sharedResult.data ?? [];

  if (profile?.role === "professor") {
    const { data, error } = await supabase.rpc("list_experiment_library_supervised");
    if (error) throw error;
    supervisedExperiments = data ?? [];
  } else {
    supervisedExperiments = [];
  }
}

function locateLoaded() {
  const loaded = bridge().getState().loaded;
  if (!loaded) return;
  if (!availableSources().includes(loaded.source)) return;

  navigation.source = loaded.source;
  navigation.query = "";
  navigation.scope = "here";
  navigation.scrollTop = 0;

  if (loaded.source === "showcase") {
    const row = showcaseEntries.find((item) =>
      item.showcase_id === loaded.id
      || item.source_key === loaded.id
      || (loaded.catalogKey && item.source_key === `catalog:${loaded.catalogKey}`)
    );
    navigation.showcase = row?.showcase_collection_id
      ? { kind: "collection", id: row.showcase_collection_id }
      : row
        ? { kind: "uncategorized", id: null }
        : { kind: "all", id: null };
  } else if (loaded.source === "mine") {
    navigation.mine = loaded.collectionId
      ? { kind: "collection", id: loaded.collectionId }
      : { kind: "unfiled", id: null };
  } else if (loaded.source === "shared") {
    const row = sharedExperiments.find((item) => item.experiment_id === loaded.id);
    navigation.shared = row ? { kind: "owner", id: row.owner_id } : { kind: "all", id: null };
  } else if (loaded.source === "supervised") {
    const row = supervisedExperiments.find((item) => item.experiment_id === loaded.id);
    navigation.supervised = row
      ? {
          researcherId: row.owner_id,
          kind: row.collection_id ? "collection" : "unfiled",
          id: row.collection_id ?? null,
        }
      : { researcherId: null, kind: "all", id: null };
  }
  rememberNavigation();
  render();
}

async function openLibrary() {
  const opener = document.querySelector(".experiment-browse");
  try {
    setStatus("Loading…");
    await loadData();
    const loaded = bridge().getState().loaded;
    navigation.source = loaded?.source && availableSources().includes(loaded.source)
      ? loaded.source
      : sessionUser ? "mine" : "showcase";
    restoreNavigation();
    render();
    if (!ui.dialog.open) ui.dialog.showModal();
    ui.searchInput.focus({ preventScroll: true });
  } catch (error) {
    console.error(error);
    setStatus(error instanceof Error ? error.message : String(error), "error");
    if (!ui.dialog.open) ui.dialog.showModal();
  }
  ui.dialog.dataset.opener = opener ? "experiment-browse" : "";
}

async function run(action) {
  try {
    await action();
  } catch (error) {
    console.error(error);
    setStatus(error instanceof Error ? error.message : String(error), "error");
  }
}

ui.close.addEventListener("click", () => ui.dialog.close());
ui.dialog.addEventListener("close", () => {
  navigation.scrollTop = ui.results.scrollTop;
  rememberNavigation();
  document.querySelector(".experiment-browse")?.focus({ preventScroll: true });
});
ui.dialog.addEventListener("click", (event) => {
  if (event.target === ui.dialog) ui.dialog.close();
});
ui.dialog.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (expandedKey) {
    event.preventDefault();
    expandedKey = null;
    copyKey = null;
    render();
  }
});
ui.refresh.addEventListener("click", () => run(async () => {
  setStatus("Refreshing…");
  await loadData();
  render();
}));
ui.sourceSelect.addEventListener("change", () => selectSource(ui.sourceSelect.value));
ui.searchInput.addEventListener("input", () => {
  navigation.query = ui.searchInput.value;
  if (!navigation.query.trim() && navigation.scope === "all") navigation.scope = "here";
  navigation.scrollTop = 0;
  rememberNavigation();
  render();
});
ui.searchScope.addEventListener("change", () => {
  navigation.scope = ui.searchScope.value === "all" && navigation.query.trim() ? "all" : "here";
  navigation.scrollTop = 0;
  rememberNavigation();
  render();
});
ui.clearSearch.addEventListener("click", () => {
  navigation.query = "";
  navigation.scope = "here";
  navigation.scrollTop = 0;
  rememberNavigation();
  render();
  ui.searchInput.focus();
});
ui.sort.addEventListener("change", () => {
  navigation.sort = ui.sort.value;
  navigation.scrollTop = 0;
  rememberNavigation();
  render();
});
ui.loaded.addEventListener("click", locateLoaded);
ui.results.addEventListener("scroll", () => {
  navigation.scrollTop = ui.results.scrollTop;
}, { passive: true });

window.addEventListener("vlab-open-experiment-library", () => run(openLibrary));
window.addEventListener("vlab-refresh-experiment-library", () => run(async () => {
  if (!ui.dialog.open) return;
  await loadData();
  render();
}));
supabase.auth.onAuthStateChange((_event, session) => {
  const nextId = session?.user?.id ?? null;
  if (nextId !== sessionUser?.id) {
    sessionUser = session?.user ?? null;
    profile = null;
    clearForeignSessionState();
  }
});
