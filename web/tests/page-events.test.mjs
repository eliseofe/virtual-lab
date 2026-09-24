// Page events (#569): one `vlab:` prefix, one documented list, and every event
// both sent and listened to. See docs/ARCHITECTURE.md §19.

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const src = new URL("../src/", import.meta.url);

async function sourceFiles(dir = src) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dir);
    if (entry.isDirectory()) files.push(...await sourceFiles(url));
    else if (/\.(js|ts|tsx)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) files.push(url);
  }
  return files;
}

async function pageEvents() {
  const sent = new Set();
  const heard = new Set();
  for (const file of await sourceFiles()) {
    const text = await readFile(file, "utf8");
    for (const [, name] of text.matchAll(/(?:\bdispatch|new CustomEvent|new Event)\(\s*["'`](vlab[^"'`]*)/g)) sent.add(name);
    for (const [, name] of text.matchAll(/addEventListener\(\s*["'`](vlab[^"'`]*)/g)) heard.add(name);
  }
  return { sent, heard };
}

async function documentedEvents() {
  const doc = await readFile(new URL("../../docs/ARCHITECTURE.md", import.meta.url), "utf8");
  const section = doc.slice(doc.indexOf("### Page events"));
  return new Set([...section.matchAll(/^\| `(vlab[^`]*)` \|/gm)].map(([, name]) => name));
}

test("every page event uses the vlab: prefix", async () => {
  const { sent, heard } = await pageEvents();
  assert.ok(sent.size > 5, "the scan finds the page events");
  for (const name of [...sent, ...heard]) assert.match(name, /^vlab:[a-z]+(?:-[a-z]+)*$/, name);
});

test("every event sent is listened to, and every event listened to is sent", async () => {
  const { sent, heard } = await pageEvents();
  assert.deepEqual([...sent].filter((name) => !heard.has(name)), [], "sent but never listened to");
  assert.deepEqual([...heard].filter((name) => !sent.has(name)), [], "listened to but never sent");
});

test("the documented list is exactly the events in the page", async () => {
  const { sent, heard } = await pageEvents();
  const inPage = [...new Set([...sent, ...heard])].sort();
  assert.deepEqual([...await documentedEvents()].sort(), inPage);
});
