// Serves the built static Lab (web/dist) on 127.0.0.1 under the same path
// prefix GitHub Pages uses, so the product smoke checks can verify an exact
// build before it is published (#533).
//
//   node web/scripts/serve-dist.mjs [--port 4173] [--base /virtual-lab/] [--root web/dist]
//
// Prints the Lab URL on stdout once listening and serves until terminated.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const root = path.resolve(option("root", path.join(here, "../dist")));
const base = `/${option("base", "/virtual-lab/").replace(/^\/+|\/+$/g, "")}/`.replace(/^\/\/$/, "/");
const port = Number(option("port", "4173"));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8",
};

async function resolveFile(urlPath) {
  const relative = decodeURIComponent(urlPath.slice(base.length));
  const candidate = path.resolve(root, relative);
  if (candidate !== root && !candidate.startsWith(root + path.sep)) return null;
  try {
    const info = await stat(candidate);
    if (info.isDirectory()) {
      const index = path.join(candidate, "index.html");
      await stat(index);
      return index;
    }
    return candidate;
  } catch {
    return null;
  }
}

const server = createServer(async (request, response) => {
  const urlPath = new URL(request.url ?? "/", "http://localhost").pathname;
  if (urlPath === base.slice(0, -1)) {
    response.writeHead(301, { location: base }).end();
    return;
  }
  const file = urlPath.startsWith(base) ? await resolveFile(urlPath) : null;
  if (!file) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not found");
    return;
  }
  const body = await readFile(file);
  response.writeHead(200, {
    "content-type": TYPES[path.extname(file)] ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  response.end(request.method === "HEAD" ? undefined : body);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`http://127.0.0.1:${port}${base}`);
});
