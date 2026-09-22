import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, "..");
const dist = path.join(web, "dist");
const manifest = JSON.parse(await readFile(path.join(dist, "build-manifest.json"), "utf8"));
if (!/^assets-[0-9a-f]{16}$/.test(manifest.assetDir)) throw new Error("invalid versioned asset directory in manifest");
const assetDir = path.join(dist, manifest.assetDir);
for (const relative of [
  "main.js", "runtime-speed.js", "worker.js", "style.css", "ux-hardening.css", "ux-hardening.js",
  "workspace-shell.js", "student-registration.js", "student-onboarding.js", "experiment-library.js",
  "experiment-catalog.js", "catalog-workspace.js",
  "config/compiler.js", "initializer/compiler.js", "controller/compiler.js",
  "wasm/vlab_kernel.js", "wasm/vlab_kernel_bg.wasm",
  "react-migration-root.js", "react-migration-root.css",
]) await stat(path.join(assetDir, relative));

const index = await readFile(path.join(dist, "index.html"), "utf8");
if (!index.includes(`./${manifest.assetDir}/main.js`)) throw new Error("index does not reference versioned main.js");
if (!index.includes(`./${manifest.assetDir}/runtime-speed.js`)) throw new Error("index does not reference versioned runtime-speed.js");
if (!index.includes(`./${manifest.assetDir}/style.css`)) throw new Error("index does not reference versioned style.css");
if (!index.includes(`./${manifest.assetDir}/ux-hardening.css`)) throw new Error("index does not reference versioned ux-hardening.css");
if (!index.includes(`./${manifest.assetDir}/react-migration-root.js`)) throw new Error("index does not reference versioned React migration root");
if (!index.includes(`./${manifest.assetDir}/react-migration-root.css`)) throw new Error("index does not reference versioned React migration styles");
if (!index.includes('id="react-migration-root" aria-label="Virtual Lab application navigation"')) throw new Error("index does not contain the visible React application-chrome mount");
if (index.includes('id="react-migration-root" hidden')) throw new Error("React application chrome is still hidden");
if (index.includes('href="./ux-hardening.css"')) throw new Error("index still references unversioned ux-hardening.css");
if (index.includes('src="./runtime-speed.js"')) throw new Error("index still references unversioned runtime-speed.js");
const main = await readFile(path.join(assetDir, "main.js"), "utf8");
for (const required of [
  'import "./catalog-workspace.js"',
  "Grid: 1 unit",
  "validateRuntimeValues(config.values)",
]) if (!main.includes(required)) throw new Error(`missing generic startup marker: ${required}`);

for (const forbidden of [
  "defaultConfigSource",
  "defaultInitializerSource",
  "runtimeValuesForCurrentBuiltIn",
  "kernel-probe",
]) if (main.includes(forbidden)) throw new Error(`obsolete startup special case remains: ${forbidden}`);

const catalogUrl = pathToFileURL(path.join(assetDir, "experiment-catalog.js")).href;
const { DEFAULT_CATALOG_EXPERIMENT, catalogSelectValue } = await import(catalogUrl);
if (DEFAULT_CATALOG_EXPERIMENT?.key !== "active-elastic") throw new Error("default catalog Experiment is not Active Elastic");
if (catalogSelectValue(DEFAULT_CATALOG_EXPERIMENT.key) !== "catalog:active-elastic") throw new Error("default catalog source identity is unstable");
const byArtifactId = new Map((DEFAULT_CATALOG_EXPERIMENT.artifacts ?? []).map((artifact) => [artifact.id, artifact.content]));
for (const id of ["configuration", "initialization", "controller", "metrics"]) {
  if (!byArtifactId.get(id)) throw new Error(`default catalog Experiment is missing ${id}`);
}
const editableConfig = byArtifactId.get("configuration");
for (const required of [
  'INITIALIZATION_METHOD = "hexagon_perturbed"',
  "ARENA_SIZE = 10.0",
  "CONTROL_DT = 0.1",
  "INITIAL_POSITION_NOISE = 0.0",
  "EXPERIMENT_DURATION = 25000.0",
  "INTERACTION_RADIUS = PROXIMAL_RANGE",
  "MAX_FORWARD_SPEED = U",
  "MAX_ANGULAR_SPEED = OMEGA_MAX",
]) if (!editableConfig.includes(required)) throw new Error(`default catalog configuration is missing: ${required}`);

const initializer = byArtifactId.get("initialization");
for (const required of [
  "def hexagon_perturbed(config, rng, place):",
  "def random_uniform(config, rng, place):",
]) if (!initializer.includes(required)) throw new Error(`default catalog initialization is missing: ${required}`);

const controller = byArtifactId.get("controller");
for (const required of [
  "sigma_lj = DESIRED_DISTANCE / pow(2.0, 1.0 / POTENTIAL_ALPHA)",
  "forward = K1 * dot(proximal, obs.heading) + U",
]) if (!controller.includes(required)) throw new Error(`default catalog controller is missing: ${required}`);

const reactRoot = await readFile(path.join(assetDir, "react-migration-root.js"), "utf8");
for (const required of [
  "MantineProvider",
  "data-vlab-react-foundation",
  "data-vlab-react-chrome",
  "data-vlab-nav",
  "React migration root is missing",
]) if (!reactRoot.includes(required)) throw new Error(`missing React application-chrome marker: ${required}`);
// React/Mantine now owns visible Simulation presentation and intentionally proxies
// authoritative legacy runtime controls through selectors such as #run/#pause and the
// simulation canvas. Those selector strings are not runtime ownership. Keep this
// distribution check focused on actual scientific/runtime implementation ownership;
// source-contract tests separately enforce the adapter boundary.
for (const forbidden of ["vlab_kernel_bg.wasm", "vlab_kernel.js", "new Worker("]) {
  if (reactRoot.includes(forbidden)) {
    throw new Error(`React presentation bundle contains scientific/runtime implementation marker: ${forbidden}`);
  }
}

const workspaceShell = await readFile(path.join(assetDir, "workspace-shell.js"), "utf8");
if (!workspaceShell.includes('import "./student-registration.js"')) {
  throw new Error("production workspace does not load student registration");
}
if (!workspaceShell.includes('import "./experiment-library.js"')) {
  throw new Error("production workspace does not load the unified Experiment Library");
}
const experimentLibrary = await readFile(path.join(assetDir, "experiment-library.js"), "utf8");
for (const required of [
  'showcase: "Showcase"',
  'mine: "Mine"',
  'shared: "Shared"',
  'supervised: "Supervised"',
  '"All Showcase"',
  '"All in Mine"',
  '"All shared"',
  '"All sources"',
  '"Open & run"',
]) if (!experimentLibrary.includes(required)) {
  throw new Error(`built Experiment Library is incomplete: ${required}`);
}
if (experimentLibrary.includes('"Built-in"') || experimentLibrary.includes('"All experiments"')) {
  throw new Error("built Experiment Library contains obsolete discovery categories");
}
const studentRegistration = await readFile(path.join(assetDir, "student-registration.js"), "utf8");
for (const required of [
  "Sign In",
  "Create Account",
  "data-vlab-create-account-mode",
  "data-vlab-create-account",
  "data-vlab-back-to-sign-in",
  "signupClient.auth.signUp",
]) if (!studentRegistration.includes(required)) {
  throw new Error(`built student-registration path is incomplete: ${required}`);
}

for (const removed of ["PHYSICS_DT", "METRIC_DT", "NEIGHBOUR_RADIUS", "K3", "WHEEL_BASE", "V0 = U", "SPRING_K"]) {
  if (editableConfig.includes(removed)) throw new Error(`student config still exposes removed parameter: ${removed}`);
}
console.log(`Verified coherent browser artifact ${manifest.assetDir} with visible React/Mantine application chrome and student registration`);
