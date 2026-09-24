// One shared Supabase connection in the browser (#541).

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const src = new URL("../src/", import.meta.url);
const files = (await readdir(src)).filter((name) => name.endsWith(".js"));
const read = (name) => readFile(new URL(name, src), "utf8");

test("the browser creates exactly one persisted Supabase client and one non-persisted sign-up client", async () => {
  const creators = [];
  for (const name of files) {
    const count = ((await read(name)).match(/\bcreateClient\(/g) ?? []).length;
    if (count) creators.push([name, count]);
  }
  assert.deepEqual(creators.sort(), [["student-registration.js", 1], ["supabase-client.js", 1]]);
  assert.match(await read("student-registration.js"), /persistSession:\s*false/);
  assert.match(await read("supabase-client.js"), /storageKey: AUTH_STORAGE_KEY/);
});

test("every module that talks to Supabase uses the shared client and no module repeats the project coordinates", async () => {
  for (const name of files) {
    if (name === "supabase-config.js") continue;
    const text = await read(name);
    assert.doesNotMatch(text, /izdmmudfrmqhvlgepwes|sb_publishable_/, `${name} must import project coordinates from supabase-config.js`);
    if (/\bsupabase\.(from|rpc|auth)\b/.test(text) && name !== "supabase-client.js") {
      assert.match(text, /import \{ supabase \} from "\.\/supabase-client\.js"/, `${name} must use the shared client`);
    }
  }
});

test("the shared configuration keeps the production login storage key and endpoints", async () => {
  const config = await import("../src/supabase-config.js");
  assert.equal(config.AUTH_STORAGE_KEY, "vlab-production-registry-auth-v1");
  assert.equal(config.SUPABASE_URL, "https://izdmmudfrmqhvlgepwes.supabase.co");
  assert.equal(config.MCP_URL, "https://izdmmudfrmqhvlgepwes.supabase.co/functions/v1/experiment-mcp");
});
