import { cp, mkdir, rm, stat } from "node:fs/promises";
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

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(src, dist, { recursive: true });
await cp(publicDir, dist, { recursive: true });
console.log(`Static production artifact built at ${dist}`);
