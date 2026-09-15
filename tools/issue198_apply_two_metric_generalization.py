from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(rel, old, new):
    path = ROOT / rel
    text = path.read_text()
    if new in text:
        return
    if old not in text:
        raise RuntimeError(f"needle not found in {rel}: {old[:120]!r}")
    path.write_text(text.replace(old, new, 1))


source = '''export const BUILTIN_ACTIVE_ELASTIC_METRICS_SOURCE = `# Owner-authorized Active Elastic live metrics.
# Ferrante et al., Phys. Rev. Lett. 111, 268302 (2013) use polarization to
# distinguish the translating ordered state from low-polarization motion.
# The complementary instantaneous normalized angular-momentum/milling order
# parameter below was explicitly authorized by the experiment owner to measure
# coherent rotation rather than translation.
# Sampling at 0.1 s is for live Virtual Lab acceptance/display only.
@metric(id="polarization", name="Polarization order parameter", unit=None, sampling=every(0.1))
def polarization(snapshot):
    total = Vec2(0.0, 0.0)
    for agent in snapshot.agents:
        total += agent.heading
    return norm(total) / snapshot.agent_count

@metric(id="angular_momentum", name="Angular momentum order parameter", unit=None, sampling=every(0.1))
def angular_momentum(snapshot):
    center = Vec2(0.0, 0.0)
    for agent in snapshot.agents:
        center += agent.position
    center = center / snapshot.agent_count
    rotation = 0.0
    for agent in snapshot.agents:
        radial = agent.position - center
        radial_hat = radial / max(norm(radial), 1e-12)
        rotation += cross2(radial_hat, agent.heading)
    return abs(rotation) / snapshot.agent_count
`;
'''
(ROOT / "web/src/builtin-active-elastic-metrics-source.js").write_text(source)

installer = '''import { BUILTIN_ACTIVE_ELASTIC_METRICS_SOURCE } from "./builtin-active-elastic-metrics-source.js";

export { BUILTIN_ACTIVE_ELASTIC_METRICS_SOURCE } from "./builtin-active-elastic-metrics-source.js";

const editor = document.querySelector("#metrics-source");
if (!editor) throw new Error("Virtual Lab artifact UI mismatch: missing built-in Metrics editor.");
editor.value = BUILTIN_ACTIVE_ELASTIC_METRICS_SOURCE;
'''
(ROOT / "web/src/builtin-active-elastic-metrics.js").write_text(installer)

replace_once(
    "web/src/experiment-artifacts.js",
    'Object.freeze({ id: "metrics", type: "metrics", label: "Metrics", format: METRICS_LANGUAGE, order: 40, registryField: null, editorSelector: null }),',
    'Object.freeze({ id: "metrics", type: "metrics", label: "Metrics", format: METRICS_LANGUAGE, order: 40, registryField: null, editorSelector: "#metrics-source" }),',
)

replace_once(
    "web/src/index.html",
    '''          <button class="authoring-tab" type="button" role="tab" data-artifact-id="controller" aria-controls="authoring-pane-controller" aria-selected="false" tabindex="-1">Controller</button>\n        </div>''',
    '''          <button class="authoring-tab" type="button" role="tab" data-artifact-id="controller" aria-controls="authoring-pane-controller" aria-selected="false" tabindex="-1">Controller</button>\n          <button class="authoring-tab" type="button" role="tab" data-artifact-id="metrics" aria-controls="authoring-pane-metrics" aria-selected="false" tabindex="-1">Metrics</button>\n        </div>''',
)

replace_once(
    "web/src/index.html",
    '''          </section>\n\n          <div id="additional-experiment-artifacts" aria-label="Additional experiment artifacts"></div>''',
    '''          </section>\n\n          <section id="authoring-pane-metrics" class="authoring-pane" role="tabpanel" data-authoring-artifact-pane="metrics" hidden>\n            <div class="authoring-pane-head">\n              <h3>Metrics</h3>\n              <p class="muted">Defines read-only scientific measurements collected from the running experiment.</p>\n            </div>\n            <textarea id="metrics-source" class="code-editor metrics-editor" spellcheck="false" aria-label="Metrics source" data-experiment-artifact-editor="true" data-experiment-artifact-id="metrics" data-experiment-artifact-type="metrics" data-experiment-artifact-label="Metrics" data-experiment-artifact-format="python-vlab-metrics/0.1" data-experiment-artifact-order="40"></textarea>\n          </section>\n\n          <div id="additional-experiment-artifacts" aria-label="Additional experiment artifacts"></div>''',
)

replace_once(
    "web/src/authoring-workspace.js",
    'if (!["configuration", "initialization", "controller"].includes(tab.dataset.artifactId)) {',
    'if (!["configuration", "initialization", "controller", "metrics"].includes(tab.dataset.artifactId)) {',
)

for rel in ["web/src/metrics/compiler.js", "supabase/functions/experiment-mcp/vendor/metrics-compiler.js"]:
    replace_once(
        rel,
        '  dot: { args: ["vec2", "vec2"], result: "scalar" },\n  norm: { args: ["vec2"], result: "scalar" },',
        '  dot: { args: ["vec2", "vec2"], result: "scalar" },\n  cross2: { args: ["vec2", "vec2"], result: "scalar" },\n  norm: { args: ["vec2"], result: "scalar" },',
    )

replace_once(
    "crates/kernel/src/metrics_ir.rs",
    '''                "dot" if values.len() == 2 => Ok(Value::Scalar(\n                    values[0].vec2("dot argument 1")?.dot(values[1].vec2("dot argument 2")?),\n                )),\n                "norm" if values.len() == 1 => Ok(Value::Scalar(''',
    '''                "dot" if values.len() == 2 => Ok(Value::Scalar(\n                    values[0].vec2("dot argument 1")?.dot(values[1].vec2("dot argument 2")?),\n                )),\n                "cross2" if values.len() == 2 => {\n                    let a = values[0].vec2("cross2 argument 1")?;\n                    let b = values[1].vec2("cross2 argument 2")?;\n                    Ok(Value::Scalar(a.x * b.y - a.y * b.x))\n                }\n                "norm" if values.len() == 1 => Ok(Value::Scalar(''',
)

rust_test = r'''
    #[test]
    fn cross2_metric_primitive_evaluates_signed_planar_cross_product() {
        let ir = r#"{
          "schema":"vlab.metrics-ir/0.1",
          "language":"python-vlab-metrics/0.1",
          "measurement_phase":"post-physics-wrapped-state/1",
          "metrics":[{
            "id":"probe.cross","name":"Cross","unit":null,
            "sampling":{"kind":"periodic","interval_seconds":0.1},
            "function":"cross_probe",
            "body":[{"kind":"return","value":{"kind":"call","name":"cross2","args":[
              {"kind":"call","name":"Vec2","args":[{"kind":"const","value":1.0},{"kind":"const","value":0.0}]},
              {"kind":"call","name":"Vec2","args":[{"kind":"const","value":0.0},{"kind":"const","value":1.0}]}
            ]}}]
          }]
        }"#;
        let mut metrics = IrMetricsRuntime::from_json(ir, "{}", 0.01).unwrap();
        metrics.observe_due(&state(), 10, 0.1).unwrap();
        let batch: serde_json::Value = serde_json::from_str(&metrics.drain_json(10).unwrap()).unwrap();
        assert_eq!(batch["samples"][0]["value"], 1.0);
    }

'''
replace_once(
    "crates/kernel/src/metrics_ir.rs",
    "    struct NoopController;\n",
    rust_test + "    struct NoopController;\n",
)

replace_once(
    "web/src/results-ui.js",
    '''function defaultMetricIds() {\n  return [...definitions.keys()].slice(0, 3);\n}\n''',
    '''function defaultMetricIds() {\n  return [...definitions.keys()].slice(0, 3);\n}\n\nfunction defaultMetricIdForNewPanel() {\n  const ids = [...definitions.keys()];\n  const represented = new Set(panels.flatMap((panel) => panel.metricIds));\n  return ids.find((id) => !represented.has(id)) ?? ids[0] ?? null;\n}\n''',
)

replace_once(
    "web/src/results-ui.js",
    '''  results.querySelector("#results-add-panel").addEventListener("click", () => {\n    const ids = defaultMetricIds();\n    if (!ids.length) return;\n    addPanel(ids.slice(0, 1));\n  });''',
    '''  results.querySelector("#results-add-panel").addEventListener("click", () => {\n    const id = defaultMetricIdForNewPanel();\n    if (!id) return;\n    addPanel([id]);\n  });''',
)

test_file = '''import assert from "node:assert/strict";\nimport { readFile } from "node:fs/promises";\nimport path from "node:path";\nimport test from "node:test";\nimport { fileURLToPath, pathToFileURL } from "node:url";\n\nimport { compileMetrics } from "../src/metrics/compiler.js";\nimport { BUILTIN_ACTIVE_ELASTIC_METRICS_SOURCE } from "../src/builtin-active-elastic-metrics-source.js";\n\nconst here = path.dirname(fileURLToPath(import.meta.url));\nconst repo = path.resolve(here, "../..");\nconst installer = await readFile(path.join(repo, "web/src/builtin-active-elastic-metrics.js"), "utf8");\nconst bridge = await readFile(path.join(repo, "web/src/metrics-runtime-bridge.js"), "utf8");\nconst html = await readFile(path.join(repo, "web/src/index.html"), "utf8");\nconst artifacts = await readFile(path.join(repo, "web/src/experiment-artifacts.js"), "utf8");\n\ntest("#198 built-in Active Elastic ships two owner-authorized live metrics", () => {\n  assert.match(BUILTIN_ACTIVE_ELASTIC_METRICS_SOURCE, /@metric\\(id="polarization", name="Polarization order parameter"/);\n  assert.match(BUILTIN_ACTIVE_ELASTIC_METRICS_SOURCE, /@metric\\(id="angular_momentum", name="Angular momentum order parameter"/);\n  assert.match(BUILTIN_ACTIVE_ELASTIC_METRICS_SOURCE, /rotation \\+= cross2\\(radial_hat, agent\\.heading\\)/);\n  const ir = compileMetrics(BUILTIN_ACTIVE_ELASTIC_METRICS_SOURCE);\n  assert.deepEqual(ir.metrics.map((metric) => metric.id), ["polarization", "angular_momentum"]);\n  assert.match(JSON.stringify(ir.metrics[1]), /"name":"cross2"/);\n});\n\ntest("#198 Metrics is a normal static core editor rather than an emergency DOM fixture", () => {\n  assert.match(html, /id="metrics-source"/);\n  assert.match(html, /data-artifact-id="metrics"/);\n  assert.match(artifacts, /id: "metrics"[\\s\\S]*editorSelector: "#metrics-source"/);\n  assert.doesNotMatch(installer, /createElement|append\\(/);\n  assert.match(installer, /document\\.querySelector\\("#metrics-source"\\)/);\n});\n\ntest("#198 built-in source is installed before Results/runtime bridge initialization", () => {\n  const builtinImport = bridge.indexOf('import "./builtin-active-elastic-metrics.js";');\n  const resultsImport = bridge.indexOf('import "./results-ui.js";');\n  assert.ok(builtinImport >= 0);\n  assert.ok(resultsImport > builtinImport);\n});\n'''
(ROOT / "web/tests/issue198-builtin-metric.test.mjs").write_text(test_file)

# Keep the deployed workflow label aligned with the now-general two-metric smoke.
replace_once(
    ".github/workflows/round1a-pages.yml",
    "      - name: Verify deployed built-in polarization end to end\n",
    "      - name: Verify deployed built-in two-metric Results end to end\n",
)

smoke = r'''import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const url = process.argv[2] ?? "http://127.0.0.1:4173/";
const chrome = process.env.CHROME_BIN ?? "google-chrome";
const profile = `/tmp/vlab-builtin-metric-chrome-${process.pid}`;
const child = spawn(chrome, [
  "--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--window-size=1280,900",
  "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", `--user-data-dir=${profile}`, url,
], { stdio: ["ignore", "ignore", "pipe"] });
let chromeLog = "";
child.stderr.on("data", (chunk) => { chromeLog += chunk.toString(); });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForPort() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Chrome exited before DevTools started (${child.exitCode})`);
    try {
      const text = await readFile(`${profile}/DevToolsActivePort`, "utf8");
      const port = Number(text.split(/\r?\n/)[0]);
      if (Number.isInteger(port) && port > 0) return port;
    } catch {}
    await sleep(100);
  }
  throw new Error("Chrome did not publish DevToolsActivePort");
}
async function httpJson(port, path) { const r = await fetch(`http://127.0.0.1:${port}${path}`); if (!r.ok) throw new Error(`DevTools HTTP ${r.status}`); return r.json(); }
async function waitForTarget(port) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const targets = await httpJson(port, "/json/list").catch(() => []);
    const target = targets.find((entry) => entry.type === "page" && entry.url.startsWith("http"));
    if (target?.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
    await sleep(100);
  }
  throw new Error("Chrome page target did not appear");
}
function connect(wsUrl) {
  const socket = new WebSocket(wsUrl); let nextId = 1; const pending = new Map(); const exceptions = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) { const { resolve, reject } = pending.get(message.id); pending.delete(message.id); if (message.error) reject(new Error(message.error.message)); else resolve(message.result); }
    else if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params?.exceptionDetails?.exception?.description ?? message.params?.exceptionDetails?.text ?? "JavaScript exception");
  });
  const ready = new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  const send = async (method, params = {}) => { await ready; const id = nextId++; const promise = new Promise((resolve, reject) => pending.set(id, { resolve, reject })); socket.send(JSON.stringify({ id, method, params })); return promise; };
  return { socket, send, exceptions };
}
async function evaluate(send, expression) {
  const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (response?.exceptionDetails) throw new Error(response.exceptionDetails.text || "Runtime evaluation failed");
  return response?.result?.value;
}
async function snapshot(send) {
  return JSON.parse(await evaluate(send, `JSON.stringify((() => {
    const api = globalThis.__vlabResultsUI;
    const metricEditor = document.querySelector('#metrics-source');
    const lastBatch = globalThis.__vlabMetricRuntime?.lastBatch?.() ?? null;
    return {
      worker: document.querySelector('#worker-status')?.dataset.state ?? null,
      metricBridge: Boolean(globalThis.__vlabMetricRuntime), results: Boolean(api), metricSource: metricEditor?.value ?? '',
      metricIds: api?.metricIds?.() ?? [], bindings: api?.panelBindings?.() ?? [],
      polarizationSamples: api?.sampleCount?.('polarization') ?? 0,
      angularMomentumSamples: api?.sampleCount?.('angular_momentum') ?? 0,
      lastBatchSamples: lastBatch?.samples ?? [],
      addDisabled: document.querySelector('#results-add-panel')?.disabled ?? null,
      status: document.querySelector('#live-results-status')?.textContent ?? '', runDisabled: document.querySelector('#run')?.disabled ?? null,
      selectedExperiment: document.querySelector('#experiment-select')?.selectedOptions?.[0]?.textContent?.trim() ?? null
    };
  })())`));
}

let cdp;
try {
  const port = await waitForPort(); cdp = connect(await waitForTarget(port)); await cdp.send("Runtime.enable"); await cdp.send("Page.enable");
  let startup = null;
  for (let attempt = 0; attempt < 180; attempt += 1) {
    startup = await snapshot(cdp.send);
    if (startup.worker === "ready" && startup.metricBridge && startup.results
        && startup.metricIds.includes("polarization") && startup.metricIds.includes("angular_momentum")
        && startup.bindings.length === 1 && startup.bindings[0].metricIds.length === 1 && startup.bindings[0].metricIds[0] === "polarization"
        && startup.addDisabled === false && startup.runDisabled === false) break;
    if (startup.worker === "error") throw new Error(`browser reported startup error: ${JSON.stringify(startup)}`);
    await sleep(100);
  }
  if (!startup?.metricIds?.includes("polarization") || !startup?.metricIds?.includes("angular_momentum")) throw new Error(`two built-in metrics did not reach Results: ${JSON.stringify(startup)}`);
  if (/No metrics configured/i.test(startup.status)) throw new Error(`Results incorrectly reports no metrics: ${JSON.stringify(startup)}`);

  const gui = JSON.parse(await evaluate(cdp.send, `JSON.stringify((() => {
    const add = document.querySelector('#results-add-panel'); add.click();
    const panels = [...document.querySelectorAll('.results-plot-panel')];
    const findInput = (panel, text) => [...panel.querySelectorAll('.results-series-option')].find((label) => label.textContent.includes(text))?.querySelector('input');
    const findColor = (panel, text) => [...panel.querySelectorAll('.results-series-option')].find((label) => label.textContent.includes(text))?.querySelector('.results-series-swatch')?.style.getPropertyValue('--series-color') ?? null;
    const separated = globalThis.__vlabResultsUI.panelBindings();
    findInput(panels[0], 'Angular momentum')?.click();
    const combined = globalThis.__vlabResultsUI.panelBindings();
    findInput(panels[1], 'Polarization')?.click();
    const duplicated = globalThis.__vlabResultsUI.panelBindings();
    return { separated, combined, duplicated,
      polarizationColor1: findColor(panels[0], 'Polarization'), polarizationColor2: findColor(panels[1], 'Polarization'),
      angularColor1: findColor(panels[0], 'Angular momentum'), angularColor2: findColor(panels[1], 'Angular momentum') };
  })())`));
  if (gui.separated.length !== 2 || gui.separated[0].metricIds.join(',') !== 'polarization' || gui.separated[1].metricIds.join(',') !== 'angular_momentum') throw new Error(`Add plot did not choose the next unrepresented metric: ${JSON.stringify(gui)}`);
  if (!gui.combined[0].metricIds.includes('polarization') || !gui.combined[0].metricIds.includes('angular_momentum')) throw new Error(`GUI could not combine real metrics: ${JSON.stringify(gui)}`);
  if (!gui.duplicated[1].metricIds.includes('polarization') || !gui.duplicated[1].metricIds.includes('angular_momentum')) throw new Error(`GUI could not reuse metrics across panels: ${JSON.stringify(gui)}`);
  if (!gui.polarizationColor1 || gui.polarizationColor1 !== gui.polarizationColor2 || !gui.angularColor1 || gui.angularColor1 !== gui.angularColor2 || gui.polarizationColor1 === gui.angularColor1) throw new Error(`stable automatic metric colors failed: ${JSON.stringify(gui)}`);

  await evaluate(cdp.send, `document.querySelector('#run')?.click()`);
  let running = startup;
  for (let attempt = 0; attempt < 150; attempt += 1) { running = await snapshot(cdp.send); if (running.polarizationSamples > 0 && running.angularMomentumSamples > 0) break; await sleep(100); }
  await evaluate(cdp.send, `document.querySelector('#pause')?.click()`);
  if (running.polarizationSamples <= 0 || running.angularMomentumSamples <= 0) throw new Error(`both real metrics must produce live samples: ${JSON.stringify(running)}`);
  const latest = new Map(running.lastBatchSamples.map((sample) => [sample.metric_id, Number(sample.value)]));
  for (const id of ['polarization', 'angular_momentum']) {
    const value = latest.get(id); if (!Number.isFinite(value) || value < -1e-9 || value > 1.000000001) throw new Error(`${id} sample outside normalized finite range: ${JSON.stringify(running.lastBatchSamples)}`);
  }
  if (cdp.exceptions.length) throw new Error(`browser exceptions: ${JSON.stringify(cdp.exceptions)}`);
  console.log(JSON.stringify({ startup, gui, running }, null, 2));
  console.log("Built-in Active Elastic verified two real metrics end to end plus GUI separation, combination, reuse, and stable automatic colors.");
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error)); if (cdp?.exceptions?.length) console.error("JavaScript exceptions:", cdp.exceptions); if (chromeLog.trim()) console.error("Chrome stderr:\n" + chromeLog); process.exitCode = 1;
} finally { try { cdp?.socket?.close(); } catch {} child.kill("SIGTERM"); }
'''
(ROOT / "web/scripts/builtin-metric-smoke.mjs").write_text(smoke)

print("#198 two-metric generalization patch applied")
