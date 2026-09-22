import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function text(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("#203 mounts a real CodeMirror foundation through React without replacing source authority", async () => {
  const [presentation, editor, adapter] = await Promise.all([
    text("../src/authoring-react-presentation.tsx"),
    text("../src/authoring-code-editor.tsx"),
    text("../src/authoring-react-adapter.ts"),
  ]);

  assert.match(presentation, /ArtifactCodeEditor/);
  assert.match(presentation, /createPortal\([\s\S]*artifact\.editorMount/);
  assert.match(adapter, /textarea\.code-editor/);
  assert.match(adapter, /ensureEditorMount/);

  assert.match(editor, /codemirror@6\.0\.2/);
  assert.match(editor, /codemirror@6\.0\.2\?bundle/);
  assert.match(editor, /runtime\.minimalSetup/);
  assert.match(editor, /runtime\.lineNumbers\(\)/);
  assert.match(editor, /pythonLikeSyntax\(runtime\)/);
  assert.match(editor, /runtime\.ViewPlugin\.fromClass/);
  assert.match(editor, /runtime\.Decoration\.mark/);
  assert.doesNotMatch(editor, /@codemirror\/view@|@codemirror\/state@|@codemirror\/lang-python@/);
  assert.doesNotMatch(editor, /basicSetup/);
});

test("#203 mirrors edits through existing input and interaction-boundary contracts", async () => {
  const [editor, registry] = await Promise.all([
    text("../src/authoring-code-editor.tsx"),
    text("../src/registry-ui-v3.js"),
  ]);

  assert.match(editor, /source\.value = next/);
  assert.match(editor, /new Event\('input', \{ bubbles: true \}\)/);
  assert.match(editor, /new FocusEvent\('blur'\)/);
  assert.match(editor, /new FocusEvent\('focusout', \{ bubbles: true \}\)/);
  assert.match(registry, /\[data-vlab-artifact-editor-surface='true'\]/);
  assert.match(registry, /target\?\.closest/);
});

test("#203 authoritative revision loads reset editor state without manufacturing an edit", async () => {
  const [editor, artifacts] = await Promise.all([
    text("../src/authoring-code-editor.tsx"),
    text("../src/experiment-artifacts.js"),
  ]);

  assert.match(artifacts, /vlab:artifact-source-replaced/);
  assert.match(artifacts, /notifyAuthoritativeSourceReplaced\(editor\)/);
  assert.match(editor, /SOURCE_REPLACED_EVENT = 'vlab:artifact-source-replaced'/);
  assert.match(editor, /syncingFromSource = true/);
  assert.match(editor, /view\.setState\(runtime\.EditorState\.create/);
  assert.match(editor, /if \(!update\.docChanged \|\| syncingFromSource\) return/);
});

test("#203 mirrors source read-only state and retains textarea fallback", async () => {
  const [editor, css] = await Promise.all([
    text("../src/authoring-code-editor.tsx"),
    text("../src/react-chrome.css"),
  ]);

  assert.match(editor, /runtime\.EditorState\.readOnly\.of\(source\.readOnly\)/);
  assert.match(editor, /runtime\.EditorView\.editable\.of\(!source\.readOnly\)/);
  assert.match(editor, /MutationObserver\(syncReadOnly\)/);
  assert.match(editor, /source\.dataset\.vlabEditorEnhanced = 'true'/);
  assert.match(editor, /catch \(error\)[\s\S]*delete source\.dataset\.vlabEditorEnhanced/);
  assert.match(css, /textarea\.code-editor\[data-vlab-editor-enhanced="true"\]/);
  assert.match(css, /\.vlab-code-editor-host \.cm-editor/);
  assert.match(css, /\.cm-lineNumbers \.cm-gutterElement/);
});

test("#203 does not hardcode Virtual Lab scientific symbols as fake semantic highlighting", async () => {
  const editor = await text("../src/authoring-code-editor.tsx");
  for (const scientificName of ["Motion(", "obs.", "PROXIMAL_RANGE", "DESIRED_DISTANCE", "ActiveElastic"]) {
    assert.equal(editor.includes(scientificName), false, scientificName);
  }
});
