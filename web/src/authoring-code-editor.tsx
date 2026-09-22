import { useEffect, useRef } from 'react';

const CODEMIRROR_URL = 'https://esm.sh/codemirror@6.0.2';
const CODEMIRROR_VIEW_URL = 'https://esm.sh/@codemirror/view@6.43.12';
const CODEMIRROR_STATE_URL = 'https://esm.sh/@codemirror/state@6.7.5';
const CODEMIRROR_PYTHON_URL = 'https://esm.sh/@codemirror/lang-python@6.2.1';
const SOURCE_REPLACED_EVENT = 'vlab:artifact-source-replaced';

type CodeMirrorRuntime = {
  EditorView: any;
  EditorState: any;
  Compartment: any;
  minimalSetup: any;
  lineNumbers: () => any;
  python: () => any;
};

let runtimePromise: Promise<CodeMirrorRuntime> | null = null;

function loadCodeMirror(): Promise<CodeMirrorRuntime> {
  if (!runtimePromise) {
    runtimePromise = Promise.all([
      import(/* @vite-ignore */ CODEMIRROR_URL),
      import(/* @vite-ignore */ CODEMIRROR_VIEW_URL),
      import(/* @vite-ignore */ CODEMIRROR_STATE_URL),
      import(/* @vite-ignore */ CODEMIRROR_PYTHON_URL),
    ]).then(([core, view, state, python]) => ({
      EditorView: core.EditorView,
      EditorState: state.EditorState,
      Compartment: state.Compartment,
      minimalSetup: core.minimalSetup,
      lineNumbers: view.lineNumbers,
      python: python.python,
    }));
  }
  return runtimePromise;
}

function pythonLike(format: string) {
  return format === 'python-vlab' || format.startsWith('python-vlab-');
}

function emitInteractionBoundary(source: HTMLTextAreaElement) {
  source.dispatchEvent(new FocusEvent('blur'));
  source.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

export function ArtifactCodeEditor({
  id,
  label,
  format,
  source,
  selected,
}: {
  id: string;
  label: string;
  format: string;
  source: HTMLTextAreaElement;
  selected: boolean;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<any>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let view: any = null;
    let readOnlyObserver: MutationObserver | null = null;
    let syncingFromSource = false;

    const start = async () => {
      try {
        const runtime = await loadCodeMirror();
        if (disposed || !hostRef.current) return;

        const readOnly = new runtime.Compartment();
        const readOnlyExtension = () => [
          runtime.EditorState.readOnly.of(source.readOnly),
          runtime.EditorView.editable.of(!source.readOnly),
        ];

        const updateListener = runtime.EditorView.updateListener.of((update: any) => {
          if (!update.docChanged || syncingFromSource) return;
          const next = update.state.doc.toString();
          if (source.value !== next) source.value = next;
          source.dispatchEvent(new Event('input', { bubbles: true }));
        });

        const interactionBoundary = runtime.EditorView.domEventHandlers({
          blur: () => {
            emitInteractionBoundary(source);
            return false;
          },
        });

        const contentAttributes = runtime.EditorView.contentAttributes.of({
          'aria-label': source.getAttribute('aria-label') || label,
          'aria-multiline': 'true',
          'autocomplete': 'off',
          'autocapitalize': 'off',
          'spellcheck': 'false',
          'data-vlab-code-editor-content': id,
        });

        const extensions = () => [
          runtime.minimalSetup,
          runtime.lineNumbers(),
          ...(pythonLike(format) ? [runtime.python()] : []),
          readOnly.of(readOnlyExtension()),
          updateListener,
          interactionBoundary,
          contentAttributes,
        ];

        view = new runtime.EditorView({
          doc: source.value,
          extensions: extensions(),
          parent: hostRef.current,
        });
        viewRef.current = view;

        const resetFromAuthoritativeSource = () => {
          if (!view) return;
          syncingFromSource = true;
          try {
            view.setState(runtime.EditorState.create({
              doc: source.value,
              extensions: extensions(),
            }));
          } finally {
            syncingFromSource = false;
          }
        };

        const syncReadOnly = () => {
          if (!view) return;
          view.dispatch({ effects: readOnly.reconfigure(readOnlyExtension()) });
          host.dataset.vlabCodeEditorReadonly = String(source.readOnly);
        };

        source.addEventListener(SOURCE_REPLACED_EVENT, resetFromAuthoritativeSource);
        readOnlyObserver = new MutationObserver(syncReadOnly);
        readOnlyObserver.observe(source, {
          attributes: true,
          attributeFilter: ['readonly', 'aria-readonly'],
        });

        source.dataset.vlabEditorEnhanced = 'true';
        host.dataset.vlabCodeEditorReady = 'true';
        host.dataset.vlabSyntaxMode = pythonLike(format) ? 'python' : 'plain';
        host.dataset.vlabCodeEditorReadonly = String(source.readOnly);
        view.requestMeasure();
      } catch (error) {
        delete source.dataset.vlabEditorEnhanced;
        host.dataset.vlabCodeEditorReady = 'error';
        console.error(`Virtual Lab code editor failed to initialize for '${id}'.`, error);
      }
    };

    void start();

    return () => {
      disposed = true;
      readOnlyObserver?.disconnect();
      source.removeEventListener(SOURCE_REPLACED_EVENT, () => {});
      if (view) view.destroy();
      viewRef.current = null;
      delete source.dataset.vlabEditorEnhanced;
      delete host.dataset.vlabCodeEditorReady;
      delete host.dataset.vlabSyntaxMode;
      delete host.dataset.vlabCodeEditorReadonly;
    };
  }, [format, id, label, source]);

  useEffect(() => {
    if (selected) viewRef.current?.requestMeasure?.();
  }, [selected]);

  return (
    <div
      ref={hostRef}
      className="vlab-code-editor-host"
      data-vlab-artifact-editor-surface="true"
      data-vlab-artifact-id={id}
    />
  );
}
