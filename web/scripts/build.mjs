import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, "..");
const src = path.join(web, "src");
const publicDir = path.join(web, "public");
const dist = path.join(web, "dist");
const wasmJs = path.join(publicDir, "wasm", "vlab_kernel.js");
const wasmBin = path.join(publicDir, "wasm", "vlab_kernel_bg.wasm");

for (const required of [wasmJs, wasmBin]) {
  try { await stat(required); }
  catch { throw new Error(`missing generated WASM artifact: ${required}. Run wasm-pack first.`); }
}

async function filesUnder(root, relative = "") {
  const directory = path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(root, next));
    else if (entry.isFile()) files.push(next);
  }
  return files;
}

const hash = createHash("sha256");
for (const root of [src, publicDir]) {
  for (const relative of await filesUnder(root)) {
    hash.update(relative);
    hash.update(await readFile(path.join(root, relative)));
  }
}
const token = hash.digest("hex").slice(0, 16);
const assetDirName = `assets-${token}`;
const assetDir = path.join(dist, assetDirName);

await rm(dist, { recursive: true, force: true });
await mkdir(assetDir, { recursive: true });
await cp(src, assetDir, { recursive: true });
await cp(publicDir, assetDir, { recursive: true });

let index = await readFile(path.join(src, "index.html"), "utf8");
index = index
  .replace('href="./style.css"', `href="./${assetDirName}/style.css"`)
  .replace('src="./main.js"', `src="./${assetDirName}/main.js"`)
  .replace("<head>", `<head>\n  <meta name="vlab-build" content="${token}">`);
await writeFile(path.join(dist, "index.html"), index);
await writeFile(path.join(dist, "build-manifest.json"), JSON.stringify({ token, assetDir: assetDirName }, null, 2));

console.log(`Static production artifact built at ${dist}`);
console.log(`Version-coherent asset directory: ${assetDirName}`);
