import '@mantine/core/styles.css';
import './react-chrome.css';

import {
  ActionIcon,
  Badge,
  Box,
  Burger,
  Button,
  Checkbox,
  Container,
  Drawer,
  Group,
  MantineProvider,
  Menu,
  Paper,
  Stack,
  Text,
  Title,
  createTheme,
} from '@mantine/core';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { AuthoringPresentation } from './authoring-react-presentation';
import { SimulationPresentation } from './simulation-react-presentation';
import {
  addResultsPanel,
  followLiveResults,
  panelIdFromEventTarget,
  readResultsPresentation,
  removeResultsPanel,
  subscribeResultsPresentation,
  toggleResultsMetric,
  type ResultsMetricPresentation,
  type ResultsPresentationSnapshot,
} from './results-react-adapter';

const mount = document.querySelector<HTMLElement>('#react-migration-root');

if (!mount) {
  throw new Error('React migration root is missing.');
}

const theme = createTheme({
  primaryColor: 'cyan',
  defaultRadius: 'lg',
  fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  headings: {
    fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontWeight: '650',
  },
});

function scrollTo(selector: string) {
  const target = document.querySelector<HTMLElement>(selector);
  if (!target) return;
  const chrome = document.querySelector<HTMLElement>('[data-vlab-react-chrome="mounted"]');
  const offset = (chrome?.getBoundingClientRect().height ?? 0) + 12;
  const top = Math.max(0, window.scrollY + target.getBoundingClientRect().top - offset);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top, behavior: reducedMotion ? 'auto' : 'smooth' });
}

function proxyClick(selector: string) {
  document.querySelector<HTMLButtonElement>(selector)?.click();
}

function visible(element: HTMLElement | null) {
  return Boolean(element && !element.hidden && element.getClientRects().length > 0);
}

type WorkspaceSection = 'control-panel' | 'simulation' | 'edit-experiment';

function WorkspaceNav({
  activeSection,
  onNavigate,
}: {
  activeSection: WorkspaceSection;
  onNavigate: (section: WorkspaceSection, selector: string) => void;
}) {
  const item = (section: WorkspaceSection, selector: string, label: string) => (
    <Button
      className="vlab-react-nav-button"
      variant="subtle"
      color="gray"
      onClick={() => onNavigate(section, selector)}
      data-vlab-nav={section}
      data-active={String(activeSection === section)}
      aria-current={activeSection === section ? 'location' : undefined}
    >
      {label}
    </Button>
  );
  return (
    <>
      {item('control-panel', '#control-panel', 'Control Panel')}
      {item('simulation', '#simulation', 'Simulation')}
      {item('edit-experiment', '#authoring-workbench', 'Experiment Authoring')}
    </>
  );
}

function ApplicationChrome() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [utilityOpen, setUtilityOpen] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceSection>('control-panel');
  const [authState, setAuthState] = useState(() => document.body.dataset.vlabAuthState ?? 'signed-out');

  useEffect(() => {
    document.body.classList.add('vlab-react-chrome-mounted');
    return () => document.body.classList.remove('vlab-react-chrome-mounted');
  }, []);

  useEffect(() => {
    const syncAuthState = () => setAuthState(document.body.dataset.vlabAuthState ?? 'signed-out');
    const observer = new MutationObserver(syncAuthState);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-vlab-auth-state'],
    });
    syncAuthState();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const sections: Array<[WorkspaceSection, string]> = [
      ['control-panel', '#control-panel'],
      ['simulation', '#simulation'],
      ['edit-experiment', '#authoring-workbench'],
    ];
    const syncActiveWorkspace = () => {
      const chrome = document.querySelector<HTMLElement>('[data-vlab-react-chrome="mounted"]');
      const marker = (chrome?.getBoundingClientRect().height ?? 0) + 24;
      let active: WorkspaceSection = 'control-panel';
      for (const [section, selector] of sections) {
        const target = document.querySelector<HTMLElement>(selector);
        if (target && target.getBoundingClientRect().top <= marker) active = section;
      }
      setActiveWorkspace(active);
    };
    syncActiveWorkspace();
    window.addEventListener('scroll', syncActiveWorkspace, { passive: true });
    window.addEventListener('resize', syncActiveWorkspace);
    return () => {
      window.removeEventListener('scroll', syncActiveWorkspace);
      window.removeEventListener('resize', syncActiveWorkspace);
    };
  }, []);

  useEffect(() => {
    const dialog = document.querySelector<HTMLDialogElement>('#workspace-utilities');
    if (!dialog) return;
    const syncOpen = () => setUtilityOpen(dialog.open);
    const restoreFocus = () => {
      syncOpen();
      requestAnimationFrame(() => {
        const desktopAccount = document.querySelector<HTMLElement>('[data-vlab-nav="account"]');
        const navigationToggle = document.querySelector<HTMLElement>('[data-vlab-nav-toggle="true"]');
        const target = visible(desktopAccount)
          ? desktopAccount
          : visible(navigationToggle)
            ? navigationToggle
            : null;
        target?.focus({ preventScroll: true });
      });
    };
    const observer = new MutationObserver(syncOpen);
    observer.observe(dialog, { attributes: true, attributeFilter: ['open'] });
    dialog.addEventListener('close', restoreFocus);
    syncOpen();
    return () => {
      observer.disconnect();
      dialog.removeEventListener('close', restoreFocus);
    };
  }, []);

  const accountA11y = {
    'aria-haspopup': 'dialog' as const,
    'aria-controls': 'workspace-utilities',
    'aria-expanded': utilityOpen,
  };
  const accountLabel = authState === 'signed-in' ? 'Account' : 'Sign In';
  const navigateWorkspace = (section: WorkspaceSection, selector: string) => {
    setActiveWorkspace(section);
    scrollTo(selector);
  };
  return (
    <Box data-vlab-react-foundation="mounted" data-vlab-react-chrome="mounted">
      <Paper component="header" className="vlab-react-chrome" radius={0} shadow="sm">
        <Container size="xl" py={8}>
          <Group justify="space-between" gap="md" wrap="nowrap" className="vlab-react-header-layout">
            <Box className="vlab-react-brand">
              <Title order={1} size="h3" c="white" className="vlab-react-brand-title">Virtual Lab</Title>
              <Text size="xs" c="gray.3" className="vlab-react-brand-byline">
                <span className="vlab-react-owner-name">Eliseo Ferrante</span> · Swarm robotics
              </Text>
            </Box>

            <Group component="nav" aria-label="Workspace" gap={2} wrap="nowrap" className="vlab-react-nav">
              <WorkspaceNav activeSection={activeWorkspace} onNavigate={navigateWorkspace} />
            </Group>

            <Group gap="xs" wrap="nowrap" className="vlab-react-utilities">
              <Button className="vlab-react-account-button" visibleFrom="sm" variant="outline" color="gray" onClick={() => proxyClick('#account-menu')} data-vlab-nav="account" aria-label={accountLabel} {...accountA11y}>{accountLabel}</Button>
              <Burger hiddenFrom="lg" opened={mobileOpen} onClick={() => setMobileOpen((value) => !value)} color="white" aria-label="Open utilities" data-vlab-nav-toggle="true" />
            </Group>
          </Group>
        </Container>
      </Paper>

      <Drawer opened={mobileOpen} onClose={() => setMobileOpen(false)} title="Utilities" position="right" size="xs">
        <Stack gap="xs">
          <Text size="xs" c="dimmed"><strong>Eliseo Ferrante</strong> · Swarm robotics</Text>
          <Button variant="light" color="gray" onClick={() => { proxyClick('[data-vlab-nav="help"]'); setMobileOpen(false); }} data-vlab-nav="help-mobile">Help</Button>
          <Button variant="filled" color="dark" onClick={() => { proxyClick('#account-menu'); setMobileOpen(false); }} data-vlab-nav="account-mobile" aria-label={accountLabel} {...accountA11y}>{accountLabel}</Button>
        </Stack>
      </Drawer>
    </Box>
  );
}

function resultsStatusColor(state: string) {
  if (state === 'ok') return 'teal';
  if (state === 'warning') return 'orange';
  if (state === 'error') return 'red';
  return 'gray';
}

function metricById(metrics: ResultsMetricPresentation[], id: string) {
  return metrics.find((metric) => metric.id === id);
}

function panelTitle(snapshot: ResultsPresentationSnapshot, metricIds: string[]) {
  if (metricIds.length === 0) return 'Choose metrics';
  if (metricIds.length === 1) return metricById(snapshot.metrics, metricIds[0])?.label ?? metricIds[0];
  return `${metricIds.length} metrics`;
}

function ResultsPresentation() {
  const [snapshot, setSnapshot] = useState<ResultsPresentationSnapshot | null>(() => readResultsPresentation());
  const [detached, setDetached] = useState<Set<number>>(() => new Set());

  const sync = () => setSnapshot(readResultsPresentation());
  const syncSoon = () => queueMicrotask(sync);

  useEffect(() => {
    sync();
    return subscribeResultsPresentation(syncSoon);
  }, []);

  useEffect(() => {
    if (!snapshot) return;
    document.body.classList.add('vlab-react-results-mounted');
    return () => document.body.classList.remove('vlab-react-results-mounted');
  }, [Boolean(snapshot)]);

  useEffect(() => {
    const panelHost = document.querySelector<HTMLElement>('#results-panels');
    if (!panelHost) return;
    const markDetached = (event: Event) => {
      if (event instanceof PointerEvent && event.type === 'pointermove' && event.buttons === 0) return;
      const id = panelIdFromEventTarget(event.target);
      if (id == null) return;
      setDetached((current) => {
        if (current.has(id)) return current;
        const next = new Set(current);
        next.add(id);
        return next;
      });
    };
    const resetDetached = () => setDetached(new Set());
    panelHost.addEventListener('wheel', markDetached, { passive: true });
    panelHost.addEventListener('pointermove', markDetached);
    document.addEventListener('vlab:metric-reset', resetDetached);
    return () => {
      panelHost.removeEventListener('wheel', markDetached);
      panelHost.removeEventListener('pointermove', markDetached);
      document.removeEventListener('vlab:metric-reset', resetDetached);
    };
  }, [Boolean(snapshot)]);

  if (!snapshot) return null;

  const clearDetached = (panelId: number) => {
    setDetached((current) => {
      if (!current.has(panelId)) return current;
      const next = new Set(current);
      next.delete(panelId);
      return next;
    });
  };

  const header = createPortal(
    <Paper className="vlab-react-results-head" radius={0} p="sm" data-vlab-react-results="mounted">
      <Group justify="space-between" align="center" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" className="vlab-react-results-heading-group">
          <Title order={3} size="h4">Results</Title>
          <Badge variant="light" color={resultsStatusColor(snapshot.statusState)} className="vlab-react-results-status">{snapshot.statusText}</Badge>
        </Group>
        <Button
          size="sm"
          variant="light"
          color="cyan"
          disabled={!snapshot.canAdd}
          onClick={() => { addResultsPanel(); syncSoon(); }}
          data-vlab-results-add
        >
          Add plot
        </Button>
      </Group>
    </Paper>,
    snapshot.mount,
  );

  const panelControls = snapshot.panels.map((panel) => {
    const isDetached = detached.has(panel.id);
    const selected = panel.metricIds.map((id) => metricById(snapshot.metrics, id)).filter(Boolean) as ResultsMetricPresentation[];
    return createPortal(
      <Paper className="vlab-react-results-panel-head" radius={0} p="sm" data-vlab-results-panel-control={panel.id}>
        <Stack gap={8}>
          <Group justify="space-between" align="center" wrap="nowrap">
            <Box className="vlab-react-results-panel-title">
              <Text fw={700} size="sm" lineClamp={1}>{panelTitle(snapshot, panel.metricIds)}</Text>
              <Group gap={5} mt={4} wrap="wrap">
                {selected.slice(0, 3).map((metric) => (
                  <Badge key={metric.id} size="xs" variant="light" className="vlab-react-results-series-badge">
                    <span className="vlab-react-results-swatch" style={{ background: metric.color }} aria-hidden="true" />
                    {metric.label}
                  </Badge>
                ))}
                {selected.length > 3 && <Badge size="xs" variant="outline">+{selected.length - 3}</Badge>}
              </Group>
            </Box>
            <Group gap={6} wrap="nowrap">
              {isDetached ? (
                <Button
                  size="xs"
                  variant="filled"
                  color="cyan"
                  className="vlab-react-results-action"
                  onClick={() => { followLiveResults(panel.id); clearDetached(panel.id); syncSoon(); }}
                  data-vlab-results-follow={panel.id}
                >
                  Follow live
                </Button>
              ) : (
                <Badge size="sm" variant="dot" color="teal" data-vlab-results-live={panel.id}>Live data</Badge>
              )}
              <Menu shadow="md" width={240} closeOnItemClick={false} position="bottom-end">
                <Menu.Target>
                  <Button size="xs" variant="default" className="vlab-react-results-action" data-vlab-results-series={panel.id}>
                    Metrics · {panel.metricIds.length}
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Visible metrics</Menu.Label>
                  <Stack gap={4} p="xs">
                    {snapshot.metrics.map((metric) => (
                      <Box key={metric.id} data-vlab-results-panel={panel.id} data-vlab-results-metric={metric.id}>
                        <Checkbox
                          checked={panel.metricIds.includes(metric.id)}
                          onChange={() => {
                            toggleResultsMetric(panel.id, metric.id);
                            clearDetached(panel.id);
                            syncSoon();
                          }}
                          label={metric.label}
                          color="cyan"
                        />
                      </Box>
                    ))}
                  </Stack>
                </Menu.Dropdown>
              </Menu>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="lg"
                aria-label="Remove plot"
                title="Remove plot"
                onClick={() => { removeResultsPanel(panel.id); clearDetached(panel.id); syncSoon(); }}
                data-vlab-results-remove={panel.id}
              >
                ×
              </ActionIcon>
            </Group>
          </Group>
        </Stack>
      </Paper>,
      panel.mount,
      `results-panel-${panel.id}`,
    );
  });

  return <>{header}{panelControls}</>;
}

createRoot(mount).render(
  <MantineProvider theme={theme}>
    <ApplicationChrome />
    <SimulationPresentation />
    <ResultsPresentation />
    <AuthoringPresentation />
  </MantineProvider>,
);