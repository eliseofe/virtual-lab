import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const viteConfig = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
const reactRoot = readFileSync(new URL("../src/react-migration-root.tsx", import.meta.url), "utf8");
const build = readFileSync(new URL("../scripts/build.mjs", import.meta.url), "utf8");
const verify = readFileSync(new URL("../scripts/verify-dist.mjs", import.meta.url), "utf8");

test("#252 pins the chosen frontend foundation", () => {
  assert.equal(packageJson.dependencies.react, "19.3.0");
  assert.equal(packageJson.dependencies["react-dom"], "19.3.0");
  assert.equal(packageJson.dependencies["@mantine/core"], "9.6.1");
  assert.equal(packageJson.dependencies["@mantine/hooks"], "9.6.1");
  assert.equal(packageJson.devDependencies.vite, "8.2.2");
  assert.equal(packageJson.devDependencies.typescript, "7.0.2");
  assert.match(packageJson.scripts.build, /build:react/);
});

test("#252 Vite keeps a bounded React library for progressive coexistence", () => {
  assert.match(viteConfig, /react-migration-root\.tsx/);
  assert.match(viteConfig, /formats:\s*\['es'\]/);
  assert.match(viteConfig, /react-migration-root\.js/);
  assert.match(viteConfig, /publicDir:\s*false/);
});

test("#252 React boundary remains Mantine-scoped and outside simulator ownership", () => {
  assert.match(reactRoot, /MantineProvider/);
  assert.match(reactRoot, /#react-migration-root/);
  assert.match(reactRoot, /data-vlab-react-foundation="mounted"/);
  assert.doesNotMatch(reactRoot, /simulation-canvas|#run|#pause|worker\.js|metrics-runtime-bridge/);
});

test("#252 legacy browser artifact remains authoritative while React presentation evolves", () => {
  assert.match(build, /await cp\(src, assetDir/);
  assert.match(build, /react-migration-root\.js/);
  assert.match(build, /id=\"react-migration-root\" aria-label=\"Virtual Lab application navigation\"/);
  assert.doesNotMatch(build, /id=\"react-migration-root\" hidden/);
  assert.match(verify, /React\/Mantine application chrome|React application chrome/);
});
