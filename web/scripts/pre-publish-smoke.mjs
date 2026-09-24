// Pre-publish verification (#533): runs the active product smoke checks from
// web/product-surface.json against the exact built package (web/dist), served
// privately on 127.0.0.1, before anything is published. The post-deploy
// production smoke is unchanged; this only stops a broken build earlier.
//
//   node web/scripts/pre-publish-smoke.mjs [--port 4173]

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const portIndex = process.argv.indexOf("--port");
const port = portIndex >= 0 ? process.argv[portIndex + 1] : "4173";

const server = spawn(process.execPath, [path.join(here, "serve-dist.mjs"), "--port", port], {
  stdio: ["ignore", "pipe", "inherit"],
});

const url = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("local Lab server did not start within 10s")), 10_000);
  server.once("exit", (code) => reject(new Error(`local Lab server exited early (code ${code})`)));
  server.stdout.once("data", (chunk) => {
    clearTimeout(timer);
    resolve(chunk.toString().trim());
  });
});

console.log(`[pre-publish] verifying exact build at ${url}`);
const smoke = spawn(process.execPath, [path.join(here, "run-active-product-smoke.mjs"), url], {
  stdio: "inherit",
});
const status = await new Promise((resolve) => smoke.once("exit", (code) => resolve(code ?? 1)));
server.kill("SIGTERM");

if (status !== 0) {
  console.error("[pre-publish] the build failed product smoke; it will not be published.");
  process.exit(status);
}
console.log("[pre-publish] build verified; safe to publish.");
