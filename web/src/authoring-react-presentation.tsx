import { Badge, Button, Group, Paper, Stack, Title } from '@mantine/core';
import { useEffect, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArtifactCodeEditor } from './authoring-code-editor';
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

  const tabs = createPortal(
    <Paper className="vlab-react-authoring-tabs-shell" radius="md" p="xs">
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
            className="vlab-react-authoring-tab"
          >
            {artifact.label}{artifact.dirty ? ' •' : ''}
          </Button>
        ))}
      </Group>
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
      />,
      artifact.editorMount,
      `authoring-editor-${artifact.id}`,
    )];
  });

  return <>{header}{tabs}{editors}</>;
}
