import { useEffect, useRef } from 'react';

const ACE_VERSION = '1.44.0';
const ACE_BASE_URL = `https://cdn.jsdelivr.net/npm/ace-builds@${ACE_VERSION}/src-min-noconflict`;
const ACE_SCRIPT_URL = `${ACE_BASE_URL}/ace.js`;
const SOURCE_REPLACED_EVENT = 'vlab:artifact-source-replaced';

type AceRuntime = {
  edit: (element: HTMLElement) => any;
  config: {
    set: (key: string, value: unknown) => void;
  };
};

declare global {
  interface Window {
    ace?: AceRuntime;
  }
}

let acePromise: Promise<AceRuntime> | null = null;

function loadAce(): Promise<AceRuntime> {
  if (window.ace) return Promise.resolve(window.ace);
  if (!acePromise) {
    acePromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-vlab-ace-runtime="true"]');
      const finish = () => {
        if (!window.ace) {
          reject(new Error('Ace loaded without exposing window.ace.'));
          return;
        }
        window.ace.config.set('basePath', ACE_BASE_URL);
        window.ace.config.set('modePath', ACE_BASE_URL);
        window.ace.config.set('themePath', ACE_BASE_URL);
        window.ace.config.set('workerPath', ACE_BASE_URL);
        resolve(window.ace);
      };
      if (existing) {
        existing.addEventListener('load', finish, { once: true });
        existing.addEventListener('error', () => reject(new Error('Ace runtime failed to load.')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = ACE_SCRIPT_URL;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.dataset.vlabAceRuntime = 'true';
      script.addEventListener('load', finish, { once: true });
      script.addEventListener('error', () => reject(new Error('Ace runtime failed to load.')), { once: true });
      document.head.append(script);
    });
  }
  return acePromise;
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
  const editorRef = useRef<any>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let editor: any = null;
    let readOnlyObserver: MutationObserver | null = null;
    let resetFromAuthoritativeSource: (() => void) | null = null;
    let syncingFromSource = false;

    const start = async () => {
      try {
        const ace = await loadAce();
        if (disposed || !hostRef.current) return;

        editor = ace.edit(host);
        editorRef.current = editor;
        editor.setOptions({
          fontSize: '13px',
          showPrintMargin: false,
          showGutter: true,
          highlightActiveLine: true,
          highlightSelectedWord: true,
          displayIndentGuides: true,
          useSoftTabs: true,
          tabSize: 4,
          wrap: false,
          behavioursEnabled: true,
          autoScrollEditorIntoView: false,
        });
        editor.renderer.setShowGutter(true);
        editor.session.setUseWorker(false);
        if (pythonLike(format)) editor.session.setMode('ace/mode/python');
        editor.setReadOnly(source.readOnly);
        editor.setValue(source.value, -1);
        editor.session.getUndoManager().reset();
        editor.clearSelection();
        editor.container.setAttribute('aria-label', source.getAttribute('aria-label') || label);
        editor.container.dataset.vlabCodeEditorContent = id;

        editor.session.on('change', () => {
          if (syncingFromSource) return;
          const next = editor.getValue();
          if (source.value !== next) source.value = next;
          source.dispatchEvent(new Event('input', { bubbles: true }));
        });

        editor.on('blur', () => emitInteractionBoundary(source));

        resetFromAuthoritativeSource = () => {
          if (!editor) return;
          syncingFromSource = true;
          try {
            editor.setValue(source.value, -1);
            editor.session.getUndoManager().reset();
            editor.clearSelection();
          } finally {
            syncingFromSource = false;
          }
        };

        const syncReadOnly = () => {
          if (!editor) return;
          editor.setReadOnly(source.readOnly);
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
        host.dataset.vlabEditorEngine = 'ace';
        host.dataset.vlabSyntaxMode = pythonLike(format) ? 'python' : 'plain';
        host.dataset.vlabCodeEditorReadonly = String(source.readOnly);
        delete host.dataset.vlabCodeEditorError;
        editor.resize(true);
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
      if (editor) {
        editor.destroy();
        host.replaceChildren();
      }
      editorRef.current = null;
      delete source.dataset.vlabEditorEnhanced;
      delete host.dataset.vlabCodeEditorReady;
      delete host.dataset.vlabEditorEngine;
      delete host.dataset.vlabSyntaxMode;
      delete host.dataset.vlabCodeEditorReadonly;
      delete host.dataset.vlabCodeEditorError;
    };
  }, [format, id, label, source]);

  useEffect(() => {
    if (selected) editorRef.current?.resize?.(true);
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
