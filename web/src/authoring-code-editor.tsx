import { useEffect, useRef } from 'react';

const CODEMIRROR_URL = 'https://esm.sh/codemirror@6.0.2?bundle';
const SOURCE_REPLACED_EVENT = 'vlab:artifact-source-replaced';

type CodeMirrorRuntime = {
  EditorView: any;
  EditorState: any;
  Compartment: any;
  Decoration: any;
  ViewPlugin: any;
  minimalSetup: any;
  lineNumbers: () => any;
};

let runtimePromise: Promise<CodeMirrorRuntime> | null = null;

function loadCodeMirror(): Promise<CodeMirrorRuntime> {
  if (!runtimePromise) {
    runtimePromise = import(/* @vite-ignore */ CODEMIRROR_URL).then((core) => ({
      EditorView: core.EditorView,
      EditorState: core.EditorState,
      Compartment: core.Compartment,
      Decoration: core.Decoration,
      ViewPlugin: core.ViewPlugin,
      minimalSetup: core.minimalSetup,
      lineNumbers: core.lineNumbers,
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

function pythonLikeSyntax(runtime: CodeMirrorRuntime) {
  const token = /#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:def|class|if|elif|else|for|while|in|return|and|or|not|is|None|True|False|import|from|as|pass|break|continue)\b|\b(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\b/g;

  const buildDecorations = (view: any) => {
    const ranges: any[] = [];
    const text = view.state.doc.toString();
    token.lastIndex = 0;
    for (let match = token.exec(text); match; match = token.exec(text)) {
      const value = match[0];
      let className = 'vlab-syntax-keyword';
      if (value.startsWith('#')) className = 'vlab-syntax-comment';
      else if (value.startsWith('"') || value.startsWith("'")) className = 'vlab-syntax-string';
      else if (/^(?:\d|\.)/.test(value)) className = 'vlab-syntax-number';
      ranges.push(runtime.Decoration.mark({ class: className }).range(match.index, match.index + value.length));
    }
    return runtime.Decoration.set(ranges, true);
  };

  return runtime.ViewPlugin.fromClass(
    class {
      decorations: any;
      constructor(view: any) {
        this.decorations = buildDecorations(view);
      }
      update(update: any) {
        if (update.docChanged) this.decorations = buildDecorations(update.view);
      }
    },
    { decorations: (plugin: any) => plugin.decorations },
  );
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
    let resetFromAuthoritativeSource: (() => void) | null = null;
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
          ...(pythonLike(format) ? [pythonLikeSyntax(runtime)] : []),
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

        resetFromAuthoritativeSource = () => {
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
        host.dataset.vlabSyntaxMode = pythonLike(format) ? 'python-like' : 'plain';
        host.dataset.vlabCodeEditorReadonly = String(source.readOnly);
        delete host.dataset.vlabCodeEditorError;
        view.requestMeasure();
      } catch (error) {
        delete source.dataset.vlabEditorEnhanced;
        host.dataset.vlabCodeEditorReady = 'error';
        host.dataset.vlabCodeEditorError = error instanceof Error ? error.message : String(error);
        console.error(`Virtual Lab code editor failed to initialize for '${id}'.`, error);
      }
    };

    void start();

    return () => {
      disposed = true;
      readOnlyObserver?.disconnect();
      if (resetFromAuthoritativeSource) source.removeEventListener(SOURCE_REPLACED_EVENT, resetFromAuthoritativeSource);
      if (view) view.destroy();
      viewRef.current = null;
      delete source.dataset.vlabEditorEnhanced;
      delete host.dataset.vlabCodeEditorReady;
      delete host.dataset.vlabSyntaxMode;
      delete host.dataset.vlabCodeEditorReadonly;
      delete host.dataset.vlabCodeEditorError;
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
