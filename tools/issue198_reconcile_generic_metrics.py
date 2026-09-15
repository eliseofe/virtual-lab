from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def replace_once(rel, old, new):
    path = ROOT / rel
    text = path.read_text()
    if old not in text:
        if new in text:
            return
        raise RuntimeError(f"needle not found in {rel}: {old[:120]!r}")
    path.write_text(text.replace(old, new, 1))

# Preserve the established contract: Metrics is compulsory but presented by the
# generic artifact adapter. The built-in page may predeclare that generic editor
# so startup does not need the former hand-built emergency DOM fixture.
replace_once(
    "web/src/experiment-artifacts.js",
    'Object.freeze({ id: "metrics", type: "metrics", label: "Metrics", format: METRICS_LANGUAGE, order: 40, registryField: null, editorSelector: "#metrics-source" }),',
    'Object.freeze({ id: "metrics", type: "metrics", label: "Metrics", format: METRICS_LANGUAGE, order: 40, registryField: null, editorSelector: null }),',
)
replace_once(
    "web/src/experiment-artifacts.js",
    '''function dynamicEditorFor(root, id) {\n  const container = root.querySelector("#additional-experiment-artifacts");\n  if (!container?.querySelector) return null;\n  return container.querySelector(`[data-experiment-artifact-editor="true"][data-experiment-artifact-id="${id}"]`);\n}''',
    '''function dynamicEditorFor(root, id) {\n  const selector = `[data-experiment-artifact-editor="true"][data-experiment-artifact-id="${id}"]`;\n  const declared = root.querySelector?.(selector);\n  if (declared) return declared;\n  const container = root.querySelector("#additional-experiment-artifacts");\n  return container?.querySelector?.(selector) ?? null;\n}''',
)
replace_once(
    "web/src/experiment-artifacts.js",
    '''    const descriptor = CORE_BY_ID.get(artifact.id);\n    const editor = descriptor ? editorFor(root, descriptor) : null;\n    if (editor) { editor.value = artifact.content; applyArtifactMetadata(editor, artifact); }''',
    '''    const descriptor = CORE_BY_ID.get(artifact.id);\n    const editor = descriptor ? (editorFor(root, descriptor) ?? dynamicEditorFor(root, artifact.id)) : dynamicEditorFor(root, artifact.id);\n    if (editor) { editor.value = artifact.content; applyArtifactMetadata(editor, artifact); }''',
)

# Reconcile the new regression test with the generic Metrics contract.
path = ROOT / "web/tests/issue198-builtin-metric.test.mjs"
text = path.read_text().replace(', pathToFileURL', '')
text = text.replace(
    '  assert.match(artifacts, /id: "metrics"[\\s\\S]*editorSelector: "#metrics-source"/);',
    '  assert.match(artifacts, /id: "metrics"[\\s\\S]*editorSelector: null/);',
)
text = text.replace(
    'test("#198 Metrics is a normal static core editor rather than an emergency DOM fixture", () => {',
    'test("#198 built-in Metrics uses the generic artifact contract without an emergency DOM fixture", () => {',
)
path.write_text(text)

# The owner-UX regression should assert the improved multi-metric Add plot policy,
# not the now-obsolete always-first-metric implementation detail.
path = ROOT / "web/tests/issue198-results-owner-ux.test.mjs"
text = path.read_text()
text = text.replace(
    'assert.match(results, /addPanel\\(ids\\.slice\\(0, 1\\)\\)/);',
    'assert.match(results, /defaultMetricIdForNewPanel\\(\\)/);\n  assert.match(results, /addPanel\\(\\[id\\]\\)/);',
)
path.write_text(text)

print("#198 generic Metrics architecture reconciled")
