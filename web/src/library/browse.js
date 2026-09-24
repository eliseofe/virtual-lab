// Experiment Library browsing rules (#480, #240), as pure functions: no DOM,
// no Supabase. experiment-library.js asks these for every decision;
// web/tests/library-browse.test.mjs tests them directly (#547).
//
// `data` is { showcase, mine, shared, supervised, showcaseCollections,
// mineCollections }: the loaded rows per source and the collection lists.
// `navigation` is the Library's navigation state (source, per-source
// location, query, scope, sort).

export const SOURCE_ORDER = ["showcase", "mine", "shared", "supervised"];
export const SOURCE_LABEL = Object.freeze({
  showcase: "Showcase",
  mine: "Mine",
  shared: "Shared",
  supervised: "Supervised",
});

// Showcase is public; Mine and Shared need an account; Supervised is for Professors.
export function availableSources({ signedIn, role }) {
  const list = ["showcase"];
  if (signedIn) list.push("mine", "shared");
  if (signedIn && role === "professor") list.push("supervised");
  return list;
}

export function normalizedName(value, fallback = "Researcher") {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

// Owners of the given rows, alphabetical, with a short id suffix only when two
// owners share a display name.
export function ownerGroups(rows) {
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

export function sourceRows(source, data) {
  if (source === "showcase") return data.showcase;
  if (source === "mine") return data.mine;
  if (source === "shared") return data.shared;
  if (source === "supervised") return data.supervised;
  return [];
}

export function entryId(source, row) {
  return source === "showcase" ? row.showcase_id : row.experiment_id;
}

// Whether a row is the Experiment currently loaded in the Lab.
export function loadedMatches(loaded, source, row) {
  if (!loaded || loaded.source !== source) return false;
  if (source === "showcase") {
    return loaded.id === row.showcase_id
      || (row.source_key && loaded.id === row.source_key)
      || (row.source_key && loaded.catalogKey && row.source_key === `catalog:${loaded.catalogKey}`);
  }
  return loaded.id === row.experiment_id;
}

export function rowCollectionName(source, row) {
  if (source === "showcase") return row.showcase_collection_name || "Uncategorized";
  if (source === "mine" || source === "supervised") return row.collection_name || "Unfiled";
  return "";
}

// The name of the place the Library currently shows (tab, collection, owner or researcher).
export function contextLabel(navigation, data) {
  const source = navigation.source;
  if (source === "showcase") {
    if (navigation.showcase.kind === "collection") {
      return data.showcaseCollections.find((item) => item.showcase_collection_id === navigation.showcase.id)?.name || "Showcase";
    }
    if (navigation.showcase.kind === "uncategorized") return "Uncategorized";
    return "Showcase";
  }
  if (source === "mine") {
    if (navigation.mine.kind === "collection") {
      return data.mineCollections.find((item) => item.id === navigation.mine.id)?.name || "Mine";
    }
    if (navigation.mine.kind === "unfiled") return "Unfiled";
    return "Mine";
  }
  if (source === "shared") {
    if (navigation.shared.kind === "owner") {
      return ownerGroups(data.shared).find((item) => item.id === navigation.shared.id)?.label || "Shared";
    }
    return "Shared";
  }
  const researcher = ownerGroups(data.supervised).find((item) => item.id === navigation.supervised.researcherId);
  if (!researcher) return "Supervised";
  if (navigation.supervised.kind === "collection") {
    const row = data.supervised.find((item) =>
      item.owner_id === researcher.id && item.collection_id === navigation.supervised.id
    );
    return row?.collection_name || "Collection";
  }
  if (navigation.supervised.kind === "unfiled") return "Unfiled";
  return researcher.label;
}

export function searchPlaceholder(navigation, data) {
  if (navigation.source === "supervised" && !navigation.supervised.researcherId) return "Search researchers";
  return `Search ${contextLabel(navigation, data)}`;
}

// The rows at the current location of a source, before search and sorting.
export function contextRows(navigation, data, source = navigation.source) {
  const rows = sourceRows(source, data);
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

export function searchableText(source, row) {
  return [
    row.title,
    row.description,
    row.owner_display_name,
    source === "showcase" ? row.showcase_collection_name : row.collection_name,
    SOURCE_LABEL[source],
  ].filter(Boolean).join(" ").toLocaleLowerCase();
}

// `query` is already trimmed and lower-cased.
export function queryMatches(source, row, query) {
  return searchableText(source, row).includes(query);
}

// Showcase sorts by title or publication; the other sources by update or title.
export function sortChoices(source) {
  return source === "showcase"
    ? [["title", "Title A–Z"], ["published", "Published newest"]]
    : [["updated", "Updated newest"], ["title", "Title A–Z"]];
}

export function effectiveSort(source, sort) {
  const choices = sortChoices(source);
  return choices.some(([value]) => value === sort) ? sort : choices[0][0];
}

export function sortRows(source, rows, sort) {
  const result = [...rows];
  if (sort === "title") {
    result.sort((a, b) => a.title.localeCompare(b.title) || entryId(source, a).localeCompare(entryId(source, b)));
    return result;
  }
  if (source === "showcase" && sort === "published") {
    result.sort((a, b) => String(b.published_at || "").localeCompare(String(a.published_at || "")) || entryId(source, a).localeCompare(entryId(source, b)));
    return result;
  }
  result.sort((a, b) => String(b.updated_at || b.published_at || "").localeCompare(String(a.updated_at || a.published_at || "")) || entryId(source, a).localeCompare(entryId(source, b)));
  return result;
}

export function rowMeta(source, row) {
  if (source === "showcase") {
    const collection = row.showcase_collection_name || "Uncategorized";
    return `${collection} · Read-only`;
  }
  if (source === "mine") return row.collection_name ? row.collection_name : "Unfiled";
  if (source === "shared") return `${normalizedName(row.owner_display_name)} · Read-only`;
  return `${normalizedName(row.owner_display_name)} · ${row.collection_name || "Unfiled"} · Read-only`;
}

export function revisionBadge(source, row) {
  if (source === "showcase" && row.source_revision == null) return "Catalog";
  const revision = source === "showcase" ? row.source_revision : row.revision;
  return revision == null ? "Revision —" : `R${revision}`;
}

function countText(total) {
  return `${total} experiment${total === 1 ? "" : "s"}`;
}

// What the results area shows:
//   { groups: [{ label, source, rows }], empty, status }
// Search across "all" sources yields one group per non-empty source; otherwise
// a single unlabeled group for the current location. Rows are sorted.
export function results({ navigation, data, sources }) {
  const query = navigation.query.trim().toLocaleLowerCase();
  const groups = [];
  let total = 0;

  if (query && navigation.scope === "all") {
    for (const source of sources) {
      const rows = sourceRows(source, data).filter((row) => queryMatches(source, row, query));
      total += rows.length;
      if (rows.length) groups.push({ label: SOURCE_LABEL[source], source, rows: sortRows(source, rows, navigation.sort) });
    }
  } else {
    let rows = contextRows(navigation, data);
    if (query) rows = rows.filter((row) => queryMatches(navigation.source, row, query));
    if (navigation.source === "supervised" && !navigation.supervised.researcherId && !query) {
      const researchers = ownerGroups(data.supervised).length;
      return {
        groups: [],
        empty: data.supervised.length ? "Choose a researcher." : "No researcher experiments.",
        status: data.supervised.length ? `${researchers} researcher${researchers === 1 ? "" : "s"}` : "0 experiments",
      };
    }
    total = rows.length;
    groups.push({ label: null, source: navigation.source, rows: sortRows(navigation.source, rows, navigation.sort) });
  }

  let empty = null;
  if (!total) {
    if (query) empty = "No matches.";
    else if (navigation.source === "mine") empty = "No experiments here.";
    else if (navigation.source === "shared") empty = "Nothing shared with you.";
    else if (navigation.source === "showcase") empty = "No Showcase experiments.";
    else empty = "No researcher experiments.";
  }
  return { groups, empty, status: countText(total) };
}
