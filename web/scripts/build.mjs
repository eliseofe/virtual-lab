import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, "..");
const src = path.join(web, "src");
const publicDir = path.join(web, "public");
const oauthDir = path.join(web, "oauth");
const viteReactDir = path.join(web, ".vite-react");
const dist = path.join(web, "dist");
const wasmJs = path.join(publicDir, "wasm", "vlab_kernel.js");
const wasmBin = path.join(publicDir, "wasm", "vlab_kernel_bg.wasm");
const reactRootJs = path.join(viteReactDir, "react-migration-root.js");
const reactRootCss = path.join(viteReactDir, "react-migration-root.css");

for (const required of [wasmJs, wasmBin, reactRootJs, reactRootCss]) {
  try { await stat(required); }
  catch { throw new Error(`missing generated browser artifact: ${required}. Run the WASM and Vite builds first.`); }
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
for (const root of [src, publicDir, oauthDir, viteReactDir]) {
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
await cp(viteReactDir, assetDir, { recursive: true });
await cp(oauthDir, path.join(dist, "oauth"), { recursive: true });

let index = await readFile(path.join(src, "index.html"), "utf8");
index = index
  .replace('href="./style.css"', `href="./${assetDirName}/style.css"`)
  .replace('href="./ux-hardening.css"', `href="./${assetDirName}/ux-hardening.css"`)
  .replace(/href="\.\/(results-ui\.css|styles\/[a-z0-9-]+\.css)"/g, (_match, file) => `href="./${assetDirName}/${file}"`)
  .replace('src="./metrics-runtime-bridge.js"', `src="./${assetDirName}/metrics-runtime-bridge.js"`)
  .replace('src="./main.js"', `src="./${assetDirName}/main.js"`)
  .replace('src="./runtime-speed.js"', `src="./${assetDirName}/runtime-speed.js"`)
  .replace('src="./workspace-shell.js"', `src="./${assetDirName}/workspace-shell.js"`)
  .replace("<head>", `<head>\n  <meta name="vlab-build" content="${token}">`)
  .replace(/<!-- vlab:react-stylesheet[^>]*-->|<\/head>/, (marker) => marker === "</head>"
    ? `  <link rel="stylesheet" href="./${assetDirName}/react-migration-root.css">\n</head>`
    : `<link rel="stylesheet" href="./${assetDirName}/react-migration-root.css">`)
  .replace("<body>", `<body>\n  <div id="react-migration-root" aria-label="Virtual Lab application navigation"></div>`)
  .replace("</body>", `  <script type="module" src="./${assetDirName}/react-migration-root.js"></script>\n</body>`);
await writeFile(path.join(dist, "index.html"), index);
await writeFile(path.join(dist, "build-manifest.json"), JSON.stringify({
  token,
  assetDir: assetDirName,
  reactMigrationRoot: "react-migration-root.js",
  oauthConsent: "oauth/consent/",
}, null, 2));

console.log(`Static production artifact built at ${dist}`);
console.log(`Version-coherent asset directory: ${assetDirName}`);
