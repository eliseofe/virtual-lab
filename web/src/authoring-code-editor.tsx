import { useEffect, useRef } from 'react';

const ACE_VERSION = '1.44.0';
const ACE_BASE_URL = `https://cdn.jsdelivr.net/npm/ace-builds@${ACE_VERSION}/src-min-noconflict`;
const ACE_SCRIPT_URL = `${ACE_BASE_URL}/ace.js`;
const ACE_LANGUAGE_TOOLS_SCRIPT_URL = `${ACE_BASE_URL}/ext-language_tools.js`;
const SOURCE_REPLACED_EVENT = 'vlab:artifact-source-replaced';

type AceRuntime = {
  edit: (element: HTMLElement) => any;
  require?: (module: string) => unknown;
  config: {
    set: (key: string, value: unknown) => void;
  };
};

type AuthoringDiagnostic = {
  severity: 'error' | 'warning';
  message: string;
  line: number | null;
  column: number | null;
};

type AuthoringCompletionItem = {
  value: string;
  caption: string;
  score: number;
  meta: string;
};

declare global {
  interface Window {
    ace?: AceRuntime;
  }
}

let acePromise: Promise<AceRuntime> | null = null;
let aceLanguageToolsPromise: Promise<void> | null = null;
const editors = new Map<string, any>();

export function focusArtifactLine(id: string, line: number): boolean {
  const editor = editors.get(id);
  if (!editor || !Number.isFinite(line)) return false;
  editor.gotoLine(Math.max(1, Math.trunc(line)), 0, true);
  editor.focus();
  return true;
}

export function openArtifactSearch(id: string): boolean {
  const editor = editors.get(id);
  if (!editor) return false;
  editor.focus();
  editor.execCommand('find');
  return true;
}


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

async function loadAceLanguageTools(): Promise<void> {
  const ace = await loadAce();
  try {
    if (ace.require?.('ace/ext/language_tools')) return;
  } catch {
    // The module is loaded by the explicit extension script below.
  }
  if (!aceLanguageToolsPromise) {
    aceLanguageToolsPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-vlab-ace-language-tools="true"]');
      const finish = () => {
        try {
          if (!ace.require?.('ace/ext/language_tools')) throw new Error('Ace language tools did not register.');
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      if (existing) {
        existing.addEventListener('load', finish, { once: true });
        existing.addEventListener('error', () => reject(new Error('Ace language tools failed to load.')), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = ACE_LANGUAGE_TOOLS_SCRIPT_URL;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.dataset.vlabAceLanguageTools = 'true';
      script.addEventListener('load', finish, { once: true });
      script.addEventListener('error', () => reject(new Error('Ace language tools failed to load.')), { once: true });
      document.head.append(script);
    });
  }
  return aceLanguageToolsPromise;
}

function applyAuthoringSupport(
  editor: any,
  host: HTMLElement,
  diagnostics: AuthoringDiagnostic[],
  completionItems: AuthoringCompletionItem[],
) {
  const annotations = diagnostics
    .filter((diagnostic) => diagnostic.line != null)
    .map((diagnostic) => ({
      row: Math.max(0, Number(diagnostic.line) - 1),
      column: diagnostic.column == null ? 0 : Math.max(0, Number(diagnostic.column) - 1),
      text: diagnostic.message,
      type: diagnostic.severity,
    }));
  editor.session.setAnnotations(annotations);

  const completer = {
    id: 'vlab-contract-completer',
    identifierRegexps: [/[A-Za-z0-9_.]/],
    getCompletions(_editor: unknown, _session: unknown, _position: unknown, _prefix: string, callback: (error: unknown, items: AuthoringCompletionItem[]) => void) {
      callback(null, completionItems);
    },
  };
  editor.setOption('enableBasicAutocompletion', completionItems.length ? [completer] : false);
  editor.setOption('enableLiveAutocompletion', false);

  host.dataset.vlabDiagnosticCount = String(diagnostics.length);
  host.dataset.vlabDiagnosticLineCount = String(annotations.length);
  host.dataset.vlabCompletionCount = String(completionItems.length);
  host.dataset.vlabCompletionEnabled = String(completionItems.length > 0);
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
  diagnostics,
  completionItems,
}: {
  id: string;
  label: string;
  format: string;
  source: HTMLTextAreaElement;
  selected: boolean;
  diagnostics: AuthoringDiagnostic[];
  completionItems: AuthoringCompletionItem[];
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<any>(null);
  const diagnosticsRef = useRef(diagnostics);
  const completionItemsRef = useRef(completionItems);
  diagnosticsRef.current = diagnostics;
  completionItemsRef.current = completionItems;

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
        await loadAceLanguageTools();
        if (disposed || !hostRef.current) return;

        editor = ace.edit(host);
        editorRef.current = editor;
        editors.set(id, editor);
        editor.setOptions({
          fontSize: '13px',
          showPrintMargin: false,
          showGutter: true,
          showFoldWidgets: true,
          fadeFoldWidgets: false,
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
        editor.session.setFoldStyle?.('markbeginend');
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
        applyAuthoringSupport(editor, host, diagnosticsRef.current, completionItemsRef.current);
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
      editors.delete(id);
      editorRef.current = null;
      delete source.dataset.vlabEditorEnhanced;
      delete host.dataset.vlabCodeEditorReady;
      delete host.dataset.vlabEditorEngine;
      delete host.dataset.vlabSyntaxMode;
      delete host.dataset.vlabCodeEditorReadonly;
      delete host.dataset.vlabDiagnosticCount;
      delete host.dataset.vlabDiagnosticLineCount;
      delete host.dataset.vlabCompletionCount;
      delete host.dataset.vlabCompletionEnabled;
      delete host.dataset.vlabCodeEditorError;
    };
  }, [format, id, label, source]);

  useEffect(() => {
    const editor = editorRef.current;
    const host = hostRef.current;
    if (editor && host) applyAuthoringSupport(editor, host, diagnostics, completionItems);
  }, [diagnostics, completionItems]);

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
