import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";

const SUPABASE_URL = "https://izdmmudfrmqhvlgepwes.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_MKaLNxnqvYbJUyik9zN7WA_r4ie2P5d";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { storageKey: "vlab-production-registry-auth-v1" },
});

const SOURCE_ORDER = ["showcase", "mine", "shared", "supervised"];
const SOURCE_LABEL = Object.freeze({
  showcase: "Showcase",
  mine: "Mine",
  shared: "Shared",
  supervised: "Supervised",
});
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

function installStyles() {
  if (document.querySelector("style[data-vlab-experiment-library]")) return;
  const style = document.createElement("style");
  style.dataset.vlabExperimentLibrary = "";
  style.textContent = `
    .vlab-library { width: min(72rem, calc(100vw - 2rem)); height: min(52rem, calc(100dvh - 2rem)); max-height: calc(100dvh - 2rem); border: 0; border-radius: 16px; padding: 0; color: #172127; box-shadow: 0 18px 70px rgba(16,35,44,.28); }
    .vlab-library::backdrop { background: rgba(16,27,33,.42); }
    .vlab-library-shell { height: 100%; min-height: 0; display: grid; grid-template-rows: auto auto auto auto 1fr; background: #fff; container-type: inline-size; }
    .vlab-library-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 18px 11px; border-bottom: 1px solid #e6ecef; }
    .vlab-library-head h2 { margin: 0; font-size: 18px; }
    .vlab-library-head-actions { display: flex; gap: 7px; }
    .vlab-library-loaded { margin: 10px 18px 0; min-height: 38px; padding: 7px 10px; display: flex; align-items: center; gap: 6px; text-align: left; border: 1px solid #d8e3e7; border-radius: 9px; background: #f8fbfc; }
    .vlab-library-loaded span { color: #6a7b82; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; }
    .vlab-library-loaded strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
    .vlab-library-sources { padding: 10px 18px 0; }
    .vlab-library-source-tabs { display: none; gap: 6px; }
    .vlab-library-source-tabs button { min-height: 36px; }
    .vlab-library-source-tabs button[aria-selected="true"] { background: #1d5166; border-color: #1d5166; color: #fff; }
    .vlab-library-source-select { display: grid; grid-template-columns: auto minmax(0,1fr); align-items: center; gap: 8px; }
    .vlab-library-source-select label { font-size: 11px; font-weight: 750; color: #52666f; }
    .vlab-library-source-select select,
    .vlab-library-search input,
    .vlab-library-search select,
    .vlab-library-sort,
    .vlab-library-copy input,
    .vlab-library-copy select { min-height: 38px; border: 1px solid #cfd8dc; border-radius: 9px; background: #fff; padding: 7px 9px; color: #172127; }
    .vlab-library-toolbar { padding: 9px 18px 0; display: grid; gap: 8px; }
    .vlab-library-search { display: grid; grid-template-columns: minmax(0,1fr) auto auto; gap: 7px; }
    .vlab-library-search input { width: 100%; min-width: 0; }
    .vlab-library-clear[hidden] { display: none !important; }
    .vlab-library-breadcrumb { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; min-height: 30px; color: #63767e; font-size: 11px; }
    .vlab-library-breadcrumb button { min-height: 28px; padding: 3px 7px; border-radius: 7px; }
    .vlab-library-breadcrumb strong { color: #243b45; }
    .vlab-library-layout { min-height: 0; display: grid; grid-template-columns: 1fr; gap: 12px; padding: 9px 18px 18px; overflow: hidden; }
    .vlab-library-directory { min-height: 0; display: grid; align-content: start; gap: 5px; overflow: auto; padding-bottom: 8px; border-bottom: 1px solid #e6ecef; }
    .vlab-library-directory button { min-height: 44px; display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; padding: 7px 9px; text-align: left; border-radius: 8px; }
    .vlab-library-directory button[aria-selected="true"] { background: #edf4f6; border-color: #b8ccd4; color: #244e5f; font-weight: 750; }
    .vlab-library-directory small { color: #718087; }
    .vlab-library-results-wrap { min-height: 0; display: grid; grid-template-rows: auto 1fr; gap: 7px; }
    .vlab-library-results-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .vlab-library-status { margin: 0; color: #687a82; font-size: 11px; }
    .vlab-library-results { min-height: 0; display: grid; align-content: start; gap: 7px; overflow: auto; padding-right: 3px; }
    .vlab-library-group { display: grid; gap: 6px; }
    .vlab-library-group + .vlab-library-group { margin-top: 7px; }
    .vlab-library-group-head { margin: 0; padding: 4px 2px; border-bottom: 1px solid #e7ecef; font-size: 12px; }
    .vlab-library-row { border: 1px solid #dfe7ea; border-radius: 10px; background: #fff; padding: 9px 10px; display: grid; gap: 6px; }
    .vlab-library-row[data-loaded="true"] { border-color: #7ea8ba; box-shadow: inset 3px 0 0 #4f8399; background: #f7fbfc; }
    .vlab-library-row-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
    .vlab-library-row-title { min-width: 0; display: grid; gap: 3px; }
    .vlab-library-row-title strong { font-size: 12.5px; overflow-wrap: anywhere; }
    .vlab-library-meta { color: #718087; font-size: 10.5px; line-height: 1.4; }
    .vlab-library-badges { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px; }
    .vlab-library-badge { border: 1px solid #d7e0e4; border-radius: 999px; padding: 2px 6px; color: #52666f; background: #fafcfd; font-size: 9.5px; font-weight: 750; white-space: nowrap; }
    .vlab-library-badge.loaded { background: #e6f2f5; border-color: #9abcc9; color: #214c60; }
    .vlab-library-row-actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .vlab-library-row-actions button { min-height: 36px; }
    .vlab-library-details { display: grid; gap: 7px; padding-top: 7px; border-top: 1px solid #e7ecef; color: #52666f; font-size: 11px; line-height: 1.45; }
    .vlab-library-details p { margin: 0; }
    .vlab-library-details dl { display: grid; grid-template-columns: auto 1fr; gap: 3px 9px; margin: 0; }
    .vlab-library-details dt { color: #718087; }
    .vlab-library-details dd { margin: 0; color: #2b424c; overflow-wrap: anywhere; }
    .vlab-library-copy { display: grid; grid-template-columns: minmax(0,1fr) minmax(9rem, .7fr) auto auto; gap: 6px; align-items: center; }
    .vlab-library-empty { margin: 12px 2px; color: #718087; font-size: 12px; }
    .vlab-library-error { margin: 0; color: #9e2d29; font-size: 11.5px; }
    @container (min-width: 40rem) {
      .vlab-library-source-tabs { display: flex; }
      .vlab-library-source-select { display: none; }
    }
    @container (min-width: 48rem) {
      .vlab-library-layout { grid-template-columns: 14rem minmax(0,1fr); gap: 1rem; }
      .vlab-library-directory { border-bottom: 0; border-right: 1px solid #e6ecef; padding-right: 12px; padding-bottom: 0; }
    }
    @media (max-width: 520px) {
      .vlab-library { width: 100vw; height: 100dvh; max-height: 100dvh; border-radius: 0; }
      .vlab-library-head { padding-inline: 12px; }
      .vlab-library-loaded, .vlab-library-sources, .vlab-library-toolbar { margin-left: 0; margin-right: 0; padding-left: 12px; padding-right: 12px; }
      .vlab-library-loaded { margin-left: 12px; margin-right: 12px; }
      .vlab-library-layout { padding-left: 12px; padding-right: 12px; }
      .vlab-library-search { grid-template-columns: minmax(0,1fr) auto; }
      .vlab-library-search select { grid-column: 1 / -1; }
      .vlab-library-copy { grid-template-columns: 1fr; }
      .vlab-library-copy button, .vlab-library-head button, .vlab-library-source-select select { min-height: 44px; }
    }
  `;
  document.head.append(style);
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

installStyles();
const ui = buildUi();

function availableSources() {
  const list = ["showcase"];
  if (sessionUser) list.push("mine", "shared");
  if (sessionUser && profile?.role === "professor") list.push("supervised");
  return list;
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

function normalizedName(value, fallback = "Researcher") {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function ownerGroups(rows) {
  const map = new Map();
  for (const row of rows) {
    const id = row.owner_id;
    if (!id) continue;
    const existing = map.get(id) ?? {
      id,
      name: normalizedName(row.owner_display_name),
      count: 0,
    };
    existing.count += 1;
    map.set(id, existing);
  }
  const groups = [...map.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const collisions = new Map();
  for (const group of groups) collisions.set(group.name, (collisions.get(group.name) ?? 0) + 1);
  for (const group of groups) {
    if ((collisions.get(group.name) ?? 0) > 1) group.label = `${group.name} · ${group.id.slice(0, 6)}`;
    else group.label = group.name;
  }
  return groups;
}

function sourceRows(source) {
  if (source === "showcase") return showcaseEntries;
  if (source === "mine") return mineExperiments;
  if (source === "shared") return sharedExperiments;
  if (source === "supervised") return supervisedExperiments;
  return [];
}

function entryId(source, row) {
  return source === "showcase" ? row.showcase_id : row.experiment_id;
}

function loadedMatches(source, row) {
  const loaded = bridge().getState().loaded;
  if (!loaded || loaded.source !== source) return false;
  if (source === "showcase") {
    return loaded.id === row.showcase_id
      || (row.source_key && loaded.id === row.source_key)
      || (row.source_key && loaded.catalogKey && row.source_key === `catalog:${loaded.catalogKey}`);
  }
  return loaded.id === row.experiment_id;
}

function rowCollectionName(source, row) {
  if (source === "showcase") return row.showcase_collection_name || "Uncategorized";
  if (source === "mine" || source === "supervised") return row.collection_name || "Unfiled";
  return "";
}

function activeContextLabel() {
  const source = navigation.source;
  if (source === "showcase") {
    if (navigation.showcase.kind === "collection") {
      return showcaseCollections.find((item) => item.showcase_collection_id === navigation.showcase.id)?.name || "Showcase";
    }
    if (navigation.showcase.kind === "uncategorized") return "Uncategorized";
    return "Showcase";
  }
  if (source === "mine") {
    if (navigation.mine.kind === "collection") {
      return mineCollections.find((item) => item.id === navigation.mine.id)?.name || "Mine";
    }
    if (navigation.mine.kind === "unfiled") return "Unfiled";
    return "Mine";
  }
  if (source === "shared") {
    if (navigation.shared.kind === "owner") {
      return ownerGroups(sharedExperiments).find((item) => item.id === navigation.shared.id)?.label || "Shared";
    }
    return "Shared";
  }
  const researcher = ownerGroups(supervisedExperiments).find((item) => item.id === navigation.supervised.researcherId);
  if (!researcher) return "Supervised";
  if (navigation.supervised.kind === "collection") {
    const row = supervisedExperiments.find((item) =>
      item.owner_id === researcher.id && item.collection_id === navigation.supervised.id
    );
    return row?.collection_name || "Collection";
  }
  if (navigation.supervised.kind === "unfiled") return "Unfiled";
  return researcher.label;
}

function searchPlaceholder() {
  if (navigation.source === "supervised" && !navigation.supervised.researcherId) return "Search researchers";
  return `Search ${activeContextLabel()}`;
}

function hereRows(source = navigation.source) {
  const rows = sourceRows(source);
  if (source === "showcase") {
    if (navigation.showcase.kind === "collection") return rows.filter((row) => row.showcase_collection_id === navigation.showcase.id);
    if (navigation.showcase.kind === "uncategorized") return rows.filter((row) => !row.showcase_collection_id);
    return rows;
  }
  if (source === "mine") {
    if (navigation.mine.kind === "collection") return rows.filter((row) => row.collection_id === navigation.mine.id);
    if (navigation.mine.kind === "unfiled") return rows.filter((row) => !row.collection_id);
    return rows;
  }
  if (source === "shared") {
    if (navigation.shared.kind === "owner") return rows.filter((row) => row.owner_id === navigation.shared.id);
    return rows;
  }
  if (!navigation.supervised.researcherId) return [];
  const researcherRows = rows.filter((row) => row.owner_id === navigation.supervised.researcherId);
  if (navigation.supervised.kind === "collection") {
    return researcherRows.filter((row) => row.collection_id === navigation.supervised.id);
  }
  if (navigation.supervised.kind === "unfiled") return researcherRows.filter((row) => !row.collection_id);
  return researcherRows;
}

function searchableText(source, row) {
  return [
    row.title,
    row.description,
    row.owner_display_name,
    source === "showcase" ? row.showcase_collection_name : row.collection_name,
    SOURCE_LABEL[source],
  ].filter(Boolean).join(" ").toLocaleLowerCase();
}

function sortRows(source, rows) {
  const result = [...rows];
  if (navigation.sort === "title") {
    result.sort((a, b) => a.title.localeCompare(b.title) || entryId(source, a).localeCompare(entryId(source, b)));
    return result;
  }
  if (source === "showcase" && navigation.sort === "published") {
    result.sort((a, b) => String(b.published_at || "").localeCompare(String(a.published_at || "")) || entryId(source, a).localeCompare(entryId(source, b)));
    return result;
  }
  result.sort((a, b) => String(b.updated_at || b.published_at || "").localeCompare(String(a.updated_at || a.published_at || "")) || entryId(source, a).localeCompare(entryId(source, b)));
  return result;
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

function rowMeta(source, row) {
  if (source === "showcase") {
    const collection = row.showcase_collection_name || "Uncategorized";
    return `${collection} · Read-only`;
  }
  if (source === "mine") return row.collection_name ? row.collection_name : "Unfiled";
  if (source === "shared") return `${normalizedName(row.owner_display_name)} · Read-only`;
  return `${normalizedName(row.owner_display_name)} · ${row.collection_name || "Unfiled"} · Read-only`;
}

function revisionBadge(source, row) {
  if (source === "showcase" && row.source_revision == null) return "Catalog";
  const revision = source === "showcase" ? row.source_revision : row.revision;
  return revision == null ? "Revision —" : `R${revision}`;
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

function queryMatches(source, row, query) {
  return searchableText(source, row).includes(query);
}

function appendGroup(label, source, rows) {
  if (!rows.length) return;
  const section = document.createElement("section");
  section.className = "vlab-library-group";
  const heading = document.createElement("h3");
  heading.className = "vlab-library-group-head";
  heading.textContent = label;
  section.append(heading);
  for (const row of sortRows(source, rows)) section.append(experimentRow(source, row));
  ui.results.append(section);
}

function renderSearchAll(query) {
  let total = 0;
  for (const source of availableSources()) {
    const rows = sourceRows(source).filter((row) => queryMatches(source, row, query));
    total += rows.length;
    appendGroup(SOURCE_LABEL[source], source, rows);
  }
  return total;
}

function renderResults() {
  ui.results.replaceChildren();
  const query = navigation.query.trim().toLocaleLowerCase();
  let total = 0;

  if (query && navigation.scope === "all") {
    total = renderSearchAll(query);
  } else {
    let rows = hereRows();
    if (query) rows = rows.filter((row) => queryMatches(navigation.source, row, query));
    if (navigation.source === "supervised" && !navigation.supervised.researcherId && !query) {
      const empty = document.createElement("p");
      empty.className = "vlab-library-empty";
      empty.textContent = supervisedExperiments.length ? "Choose a researcher." : "No researcher experiments.";
      ui.results.append(empty);
      ui.status.textContent = supervisedExperiments.length
        ? `${ownerGroups(supervisedExperiments).length} researcher${ownerGroups(supervisedExperiments).length === 1 ? "" : "s"}`
        : "0 experiments";
      return;
    }
    total = rows.length;
    for (const row of sortRows(navigation.source, rows)) ui.results.append(experimentRow(navigation.source, row));
  }

  if (!total) {
    const empty = document.createElement("p");
    empty.className = "vlab-library-empty";
    if (query) empty.textContent = "No matches.";
    else if (navigation.source === "mine") empty.textContent = "No experiments here.";
    else if (navigation.source === "shared") empty.textContent = "Nothing shared with you.";
    else if (navigation.source === "showcase") empty.textContent = "No Showcase experiments.";
    else empty.textContent = "No researcher experiments.";
    ui.results.append(empty);
  }
  ui.status.textContent = `${total} experiment${total === 1 ? "" : "s"}`;
}

function renderSort() {
  ui.sort.replaceChildren();
  const source = navigation.source;
  const choices = source === "showcase"
    ? [["title", "Title A–Z"], ["published", "Published newest"]]
    : [["updated", "Updated newest"], ["title", "Title A–Z"]];
  if (!choices.some(([value]) => value === navigation.sort)) navigation.sort = choices[0][0];
  for (const [value, label] of choices) {
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
