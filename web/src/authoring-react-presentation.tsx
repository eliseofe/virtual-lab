import { Badge, Button, Group, Paper, Select, Stack, Title } from '@mantine/core';
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArtifactCodeEditor, focusArtifactLine, openArtifactSearch } from './authoring-code-editor';
import { artifactCompletionItems, collectArtifactDiagnostics } from './authoring-language-support.js';
import { artifactStructureSafe, symbolLabel } from './authoring-structure.js';
import {
  applyAuthoringChanges,
  readAuthoringPresentation,
  selectAuthoringArtifact,
  subscribeAuthoringPresentation,
  type AuthoringPresentationSnapshot,
} from './authoring-react-adapter';

function statusColor(state: string) {
  if (state === 'clean') return 'teal';
  if (state === 'dirty') return 'orange';
  if (state === 'working') return 'cyan';
  if (state === 'error') return 'red';
  return 'gray';
}

export function AuthoringPresentation() {
  const [snapshot, setSnapshot] = useState<AuthoringPresentationSnapshot | null>(() => readAuthoringPresentation());
  const [sourceVersion, setSourceVersion] = useState(0);
  const sync = () => setSnapshot(readAuthoringPresentation());
  const syncSoon = () => queueMicrotask(sync);

  useEffect(() => {
    sync();
    return subscribeAuthoringPresentation(syncSoon);
  }, []);

  useEffect(() => {
    if (!snapshot) return;
    const previousLabelledBy = snapshot.workbench.getAttribute('aria-labelledby');
    snapshot.workbench.setAttribute('aria-labelledby', 'vlab-react-authoring-heading');
    document.body.classList.add('vlab-react-authoring-mounted');
    return () => {
      document.body.classList.remove('vlab-react-authoring-mounted');
      if (previousLabelledBy) snapshot.workbench.setAttribute('aria-labelledby', previousLabelledBy);
      else snapshot.workbench.removeAttribute('aria-labelledby');
    };
  }, [snapshot?.workbench]);

  const selectedArtifact = snapshot?.artifacts.find((artifact) => artifact.selected) ?? null;

  useEffect(() => {
    const source = selectedArtifact?.source;
    if (!source) return;
    let timer: number | null = null;
    const onInput = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => setSourceVersion((value) => value + 1), 120);
    };
    source.addEventListener('input', onInput);
    return () => {
      source.removeEventListener('input', onInput);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [selectedArtifact?.source]);

  const selectedStructure = useMemo(() => {
    if (!selectedArtifact?.source) return null;
    void sourceVersion;
    return artifactStructureSafe(selectedArtifact.id, selectedArtifact.source.value);
  }, [selectedArtifact?.id, selectedArtifact?.source, sourceVersion]);

  const authoringSupport = useMemo(() => {
    if (!snapshot) return { diagnostics: {}, completions: {} };
    void sourceVersion;
    const sources = Object.fromEntries(
      snapshot.artifacts.map((artifact) => [artifact.id, artifact.source?.value ?? '']),
    );
    const diagnostics = collectArtifactDiagnostics(sources);
    const completions = Object.fromEntries(
      snapshot.artifacts.map((artifact) => [artifact.id, artifactCompletionItems(artifact.id, sources)]),
    );
    return { diagnostics, completions };
  }, [snapshot, sourceVersion]);

  if (!snapshot) return null;

  const activate = (id: string, focus = false) => {
    selectAuthoringArtifact(id);
    syncSoon();
    if (focus) {
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`[data-vlab-authoring-tab="${CSS.escape(id)}"]`)?.focus();
      });
    }
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, id: string) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const ids = snapshot.artifacts.map((artifact) => artifact.id);
    const current = Math.max(0, ids.indexOf(id));
    let next = current;
    if (event.key === 'ArrowLeft') next = (current - 1 + ids.length) % ids.length;
    if (event.key === 'ArrowRight') next = (current + 1) % ids.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = ids.length - 1;
    event.preventDefault();
    activate(ids[next], true);
  };

  const header = createPortal(
    <Paper className="vlab-react-authoring-head" radius="md" p="md" data-vlab-react-authoring="mounted">
      <Group justify="space-between" align="flex-start" gap="md" className="vlab-react-authoring-head-layout">
        <Title id="vlab-react-authoring-heading" order={2} size="h3" className="vlab-workspace-card-title">Experiment Authoring</Title>
        <Stack gap={8} align="flex-end" className="vlab-react-authoring-actions">
          <Badge color={statusColor(snapshot.statusState)} variant="light" className="vlab-react-authoring-status">
            {snapshot.statusText}
          </Badge>
          <Button
            variant="filled"
            color="cyan"
            disabled={snapshot.applyDisabled}
            onClick={() => { applyAuthoringChanges(); syncSoon(); }}
            data-vlab-authoring-apply
          >
            Apply changes & restart
          </Button>
        </Stack>
      </Group>
    </Paper>,
    snapshot.headMount,
  );

  const outlineData = selectedStructure?.symbols.map((symbol, index) => ({
    value: String(index),
    label: `${symbolLabel(symbol)} · L${symbol.line}`,
  })) ?? [];
  const selectedDiagnostics = selectedArtifact
    ? (authoringSupport.diagnostics[selectedArtifact.id] ?? [])
    : [];

  const tabs = createPortal(
    <Paper className="vlab-react-authoring-tabs-shell" radius="md" p="xs">
      <Stack gap={8}>
        <Group role="tablist" aria-label="Experiment artifacts" gap={6} wrap="nowrap" className="vlab-react-authoring-tabs">
          {snapshot.artifacts.map((artifact) => (
            <Button
              key={artifact.id}
              role="tab"
              variant={artifact.selected ? 'light' : 'subtle'}
              color={artifact.selected ? 'cyan' : 'gray'}
              aria-selected={artifact.selected}
              aria-controls={artifact.controls}
              tabIndex={artifact.selected ? 0 : -1}
              onClick={() => activate(artifact.id)}
              onKeyDown={(event) => onTabKeyDown(event, artifact.id)}
              data-vlab-authoring-tab={artifact.id}
              data-dirty={artifact.dirty ? 'true' : undefined}
              data-vlab-diagnostic-count={authoringSupport.diagnostics[artifact.id]?.length ?? 0}
              aria-label={`${artifact.label}${artifact.dirty ? ', unsaved changes' : ''}${authoringSupport.diagnostics[artifact.id]?.length ? `, ${authoringSupport.diagnostics[artifact.id].length} error${authoringSupport.diagnostics[artifact.id].length === 1 ? '' : 's'}` : ''}`}
              className="vlab-react-authoring-tab"
            >
              {artifact.label}{artifact.dirty ? ' •' : ''}
              {(authoringSupport.diagnostics[artifact.id]?.length ?? 0) > 0 && (
                <Badge size="xs" color="red" variant="filled" ml={6}>
                  {authoringSupport.diagnostics[artifact.id].length}
                </Badge>
              )}
            </Button>
          ))}
        </Group>
        {selectedArtifact && (
          <Group gap={8} wrap="nowrap" className="vlab-react-authoring-navigation">
            <div
              className="vlab-react-authoring-outline"
              data-vlab-authoring-outline={selectedArtifact.id}
              data-vlab-outline-symbol-count={outlineData.length}
              data-vlab-outline-state={selectedStructure?.error ? 'unavailable' : 'ready'}
            >
              <Select
                aria-label={`${selectedArtifact.label} outline`}
                placeholder={selectedStructure?.error ? 'Outline unavailable' : 'Outline'}
                data={outlineData}
                value={null}
                disabled={Boolean(selectedStructure?.error) || outlineData.length === 0}
                searchable={outlineData.length > 10}
                clearable={false}
                onChange={(value) => {
                  if (value == null || !selectedStructure) return;
                  const symbol = selectedStructure.symbols[Number(value)];
                  if (symbol) focusArtifactLine(selectedArtifact.id, symbol.line);
                }}
              />
            </div>
            <Button
              variant="subtle"
              color="gray"
              onClick={() => openArtifactSearch(selectedArtifact.id)}
              data-vlab-authoring-find={selectedArtifact.id}
              className="vlab-react-authoring-find"
            >
              Find
            </Button>
          </Group>
        )}
        {selectedArtifact && selectedDiagnostics.length > 0 && (
          <Stack
            gap={4}
            role="alert"
            aria-live="polite"
            data-vlab-authoring-diagnostics={selectedArtifact.id}
            data-vlab-authoring-diagnostic-count={selectedDiagnostics.length}
            className="vlab-react-authoring-diagnostics"
          >
            {selectedDiagnostics.map((diagnostic, index) => {
              const location = diagnostic.line == null
                ? 'Source'
                : `L${diagnostic.line}${diagnostic.column == null ? '' : `:${diagnostic.column}`}`;
              return (
                <Button
                  key={`${diagnostic.artifact}-${diagnostic.line ?? 'global'}-${index}`}
                  variant="light"
                  color={diagnostic.severity === 'warning' ? 'yellow' : 'red'}
                  size="compact-sm"
                  justify="flex-start"
                  onClick={() => {
                    if (diagnostic.line != null) focusArtifactLine(selectedArtifact.id, diagnostic.line);
                  }}
                  data-vlab-authoring-diagnostic
                  data-vlab-diagnostic-line={diagnostic.line ?? ''}
                  data-vlab-diagnostic-column={diagnostic.column ?? ''}
                  aria-label={`${location}: ${diagnostic.message}`}
                >
                  {location} · {diagnostic.message}
                </Button>
              );
            })}
          </Stack>
        )}
      </Stack>
    </Paper>,
    snapshot.tabsMount,
  );

  const editors = snapshot.artifacts.flatMap((artifact) => {
    if (!artifact.source || !artifact.editorMount) return [];
    return [createPortal(
      <ArtifactCodeEditor
        id={artifact.id}
        label={artifact.label}
        format={artifact.format}
        source={artifact.source}
        selected={artifact.selected}
        diagnostics={authoringSupport.diagnostics[artifact.id] ?? []}
        completionItems={authoringSupport.completions[artifact.id] ?? []}
      />,
      artifact.editorMount,
      `authoring-editor-${artifact.id}`,
    )];
  });

  return <>{header}{tabs}{editors}</>;
}
