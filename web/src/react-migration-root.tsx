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

type ChromeState = {
  workerText: string;
  workerState: string;
  experimentTitle: string;
  showcaseAvailable: boolean;
  professorAvailable: boolean;
  professorLabel: string;
};

function legacyChromeState(): ChromeState {
  const worker = document.querySelector<HTMLElement>('#worker-status');
  const experiment = document.querySelector<HTMLSelectElement>('#experiment-select');
  const professor = document.querySelector<HTMLButtonElement>('#professor-menu');
  const showcase = document.querySelector<HTMLButtonElement>('.showcase-launcher');
  return {
    workerText: worker?.textContent?.trim() || 'Starting simulator…',
    workerState: worker?.dataset.state || 'loading',
    experimentTitle: experiment?.selectedOptions?.[0]?.textContent?.trim() || 'Experiment',
    showcaseAvailable: Boolean(showcase),
    professorAvailable: Boolean(professor && !professor.hidden),
    professorLabel: professor?.textContent?.trim() || 'Professor',
  };
}

function observeElement(
  element: Element | null,
  callback: () => void,
  options: MutationObserverInit,
) {
  if (!element) return () => {};
  const observer = new MutationObserver(callback);
  observer.observe(element, options);
  return () => observer.disconnect();
}

function useChromeState() {
  const [state, setState] = useState<ChromeState>(() => legacyChromeState());

  useEffect(() => {
    const update = () => setState(legacyChromeState());
    const worker = document.querySelector('#worker-status');
    const experiment = document.querySelector<HTMLSelectElement>('#experiment-select');
    const professor = document.querySelector('#professor-menu');
    const launchers = document.querySelector('.utility-launchers');

    const cleanup = [
      observeElement(worker, update, { attributes: true, attributeFilter: ['data-state'], childList: true, characterData: true, subtree: true }),
      observeElement(experiment, update, { childList: true, characterData: true, subtree: true }),
      observeElement(professor, update, { attributes: true, attributeFilter: ['hidden'], childList: true, characterData: true, subtree: true }),
      observeElement(launchers, update, { childList: true, subtree: true }),
    ];
    experiment?.addEventListener('change', update);
    update();
    return () => {
      cleanup.forEach((stop) => stop());
      experiment?.removeEventListener('change', update);
    };
  }, []);

  return state;
}

function scrollTo(selector: string) {
  const target = document.querySelector<HTMLElement>(selector);
  if (!target) return;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
}

function proxyClick(selector: string) {
  document.querySelector<HTMLButtonElement>(selector)?.click();
}

function visible(element: HTMLElement | null) {
  return Boolean(element && !element.hidden && element.getClientRects().length > 0);
}

function workerColor(state: string) {
  if (state === 'ready') return 'teal';
  if (state === 'error') return 'red';
  return 'cyan';
}

function WorkspaceNav({ closeMobile }: { closeMobile?: () => void }) {
  const action = (callback: () => void) => () => {
    callback();
    closeMobile?.();
  };
  return (
    <>
      <Button className="vlab-react-nav-button" variant="subtle" color="gray" onClick={action(() => scrollTo('.experiment-panel'))} data-vlab-nav="experiment">Experiment</Button>
      <Button className="vlab-react-nav-button" variant="subtle" color="gray" onClick={action(() => scrollTo('.stage-panel'))} data-vlab-nav="simulation">Simulation</Button>
      <Button className="vlab-react-nav-button" variant="subtle" color="gray" onClick={action(() => scrollTo('#live-results'))} data-vlab-nav="results">Results</Button>
      <Button className="vlab-react-nav-button" variant="subtle" color="gray" onClick={action(() => scrollTo('#authoring-workbench'))} data-vlab-nav="authoring">Authoring</Button>
    </>
  );
}

function ApplicationChrome() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [utilityOpen, setUtilityOpen] = useState(false);
  const state = useChromeState();

  useEffect(() => {
    document.body.classList.add('vlab-react-chrome-mounted');
    return () => document.body.classList.remove('vlab-react-chrome-mounted');
  }, []);

  useEffect(() => {
    const dialog = document.querySelector<HTMLDialogElement>('#workspace-utilities');
    if (!dialog) return;
    const syncOpen = () => setUtilityOpen(dialog.open);
    const restoreFocus = () => {
      syncOpen();
      requestAnimationFrame(() => {
        const view = dialog.dataset.view === 'professor' ? 'professor' : 'account';
        const desktopTarget = document.querySelector<HTMLElement>(`[data-vlab-nav="${view}"]`);
        const desktopAccount = document.querySelector<HTMLElement>('[data-vlab-nav="account"]');
        const navigationToggle = document.querySelector<HTMLElement>('[data-vlab-nav-toggle="true"]');
        const target = visible(desktopTarget)
          ? desktopTarget
          : visible(desktopAccount)
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
  const professorA11y = {
    'aria-haspopup': 'dialog' as const,
    'aria-controls': 'professor-extension-inbox',
  };

  return (
    <Box data-vlab-react-foundation="mounted" data-vlab-react-chrome="mounted">
      <Paper component="header" className="vlab-react-chrome" radius={0} shadow="sm">
        <Container size="xl" py={8}>
          <Group justify="space-between" gap="md" wrap="nowrap">
            <Box className="vlab-react-brand">
              <Group gap="xs" align="baseline" wrap="nowrap" className="vlab-react-brand-lockup">
                <Title order={1} size="h3" c="white" className="vlab-react-brand-title">Virtual Lab</Title>
                <Text size="xs" fw={700} tt="uppercase" c="cyan.2" lts="0.12em" visibleFrom="sm">Swarm robotics</Text>
              </Group>
              <Text size="xs" c="gray.4" lineClamp={1} className="vlab-react-experiment-name" data-vlab-current-experiment>{state.experimentTitle}</Text>
            </Box>

            <Group gap={2} wrap="nowrap" visibleFrom="lg" className="vlab-react-nav">
              <WorkspaceNav />
              <Button className="vlab-react-nav-button" variant="subtle" color="gray" onClick={() => proxyClick('.showcase-launcher')} disabled={!state.showcaseAvailable} data-vlab-nav="showcase">Showcase</Button>
            </Group>

            <Group gap="xs" wrap="nowrap">
              <Badge className="vlab-react-status-badge" color={workerColor(state.workerState)} variant="light" data-vlab-worker-status>{state.workerText}</Badge>
              {state.professorAvailable && <Button className="vlab-react-account-button" visibleFrom="sm" variant="subtle" color="violet" onClick={() => proxyClick('#professor-menu')} data-vlab-nav="professor" {...professorA11y}>{state.professorLabel}</Button>}
              <Button className="vlab-react-account-button" visibleFrom="sm" variant="outline" color="gray" onClick={() => proxyClick('#account-menu')} data-vlab-nav="account" {...accountA11y}>Account</Button>
              <Burger hiddenFrom="lg" opened={mobileOpen} onClick={() => setMobileOpen((value) => !value)} color="white" aria-label="Open workspace navigation" data-vlab-nav-toggle="true" />
            </Group>
          </Group>
        </Container>
      </Paper>

      <Drawer opened={mobileOpen} onClose={() => setMobileOpen(false)} title="Virtual Lab" position="right" size="xs">
        <Stack gap="xs">
          <WorkspaceNav closeMobile={() => setMobileOpen(false)} />
          <Button variant="light" color="cyan" onClick={() => { proxyClick('.showcase-launcher'); setMobileOpen(false); }} disabled={!state.showcaseAvailable} data-vlab-nav="showcase-mobile">Showcase</Button>
          {state.professorAvailable && <Button variant="light" color="violet" onClick={() => { proxyClick('#professor-menu'); setMobileOpen(false); }} data-vlab-nav="professor-mobile" {...professorA11y}>{state.professorLabel}</Button>}
          <Button variant="filled" color="dark" onClick={() => { proxyClick('#account-menu'); setMobileOpen(false); }} data-vlab-nav="account-mobile" {...accountA11y}>Account</Button>
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