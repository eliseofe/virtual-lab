import '@mantine/core/styles.css';
import './react-chrome.css';

import {
  Badge,
  Box,
  Burger,
  Button,
  Container,
  Drawer,
  Group,
  MantineProvider,
  Paper,
  Stack,
  Text,
  Title,
  createTheme,
} from '@mantine/core';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

const mount = document.querySelector<HTMLElement>('#react-migration-root');

if (!mount) {
  throw new Error('React migration root is missing.');
}

const theme = createTheme({
  primaryColor: 'cyan',
  defaultRadius: 'md',
  fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  headings: {
    fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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

function openAccountDialog(
  returnFocus: HTMLElement,
  setAccountOpen: (open: boolean) => void,
) {
  const dialog = document.querySelector<HTMLDialogElement>('#workspace-utilities');
  const onClose = () => {
    setAccountOpen(false);
    requestAnimationFrame(() => {
      if (returnFocus.isConnected && returnFocus.getClientRects().length > 0) {
        returnFocus.focus({ preventScroll: true });
      }
    });
  };

  dialog?.addEventListener('close', onClose, { once: true });
  proxyClick('#account-menu');

  if (dialog?.open) {
    setAccountOpen(true);
  } else {
    dialog?.removeEventListener('close', onClose);
    setAccountOpen(false);
  }
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
  const [accountOpen, setAccountOpen] = useState(false);
  const state = useChromeState();

  useEffect(() => {
    document.body.classList.add('vlab-react-chrome-mounted');
    return () => document.body.classList.remove('vlab-react-chrome-mounted');
  }, []);

  return (
    <Box data-vlab-react-foundation="mounted" data-vlab-react-chrome="mounted">
      <Paper component="header" className="vlab-react-chrome" radius={0} shadow="sm">
        <Container size="xl" py="sm">
          <Group justify="space-between" gap="md" wrap="nowrap">
            <Box className="vlab-react-brand">
              <Text size="xs" fw={800} tt="uppercase" c="cyan.2" lts="0.16em">Virtual Lab</Text>
              <Title order={2} size="h3" c="white" className="vlab-react-brand-title">Swarm robotics simulation</Title>
              <Text size="xs" c="gray.4" lineClamp={1} className="vlab-react-experiment-name" data-vlab-current-experiment>{state.experimentTitle}</Text>
            </Box>

            <Group gap={4} wrap="nowrap" visibleFrom="lg">
              <WorkspaceNav />
              <Button variant="light" color="cyan" onClick={() => proxyClick('.showcase-launcher')} disabled={!state.showcaseAvailable} data-vlab-nav="showcase">Showcase</Button>
            </Group>

            <Group gap="xs" wrap="nowrap">
              <Badge className="vlab-react-status-badge" color={workerColor(state.workerState)} variant="light" data-vlab-worker-status>{state.workerText}</Badge>
              {state.professorAvailable && <Badge visibleFrom="md" className="vlab-react-role-badge" color="violet" variant="outline">{state.professorLabel}</Badge>}
              <Button
                visibleFrom="sm"
                variant="white"
                color="dark"
                onClick={(event) => openAccountDialog(event.currentTarget, setAccountOpen)}
                aria-haspopup="dialog"
                aria-controls="workspace-utilities"
                aria-expanded={accountOpen}
                data-vlab-nav="account"
              >Account</Button>
              <Burger
                hiddenFrom="lg"
                opened={mobileOpen}
                onClick={() => setMobileOpen((value) => !value)}
                color="white"
                aria-label="Open workspace navigation"
                data-vlab-mobile-navigation
              />
            </Group>
          </Group>
        </Container>
      </Paper>

      <Drawer opened={mobileOpen} onClose={() => setMobileOpen(false)} title="Virtual Lab" position="right" size="xs">
        <Stack gap="xs">
          <WorkspaceNav closeMobile={() => setMobileOpen(false)} />
          <Button variant="light" color="cyan" onClick={() => { proxyClick('.showcase-launcher'); setMobileOpen(false); }} disabled={!state.showcaseAvailable} data-vlab-nav="showcase-mobile">Showcase</Button>
          <Button
            variant="filled"
            color="dark"
            onClick={() => {
              const returnFocus = document.querySelector<HTMLElement>('[data-vlab-mobile-navigation]');
              setMobileOpen(false);
              if (returnFocus) openAccountDialog(returnFocus, setAccountOpen);
              else proxyClick('#account-menu');
            }}
            aria-haspopup="dialog"
            aria-controls="workspace-utilities"
            aria-expanded={accountOpen}
            data-vlab-nav="account-mobile"
          >Account</Button>
          {state.professorAvailable && <Badge className="vlab-react-role-badge" color="violet" variant="light">{state.professorLabel}</Badge>}
          <Text size="xs" c="dimmed">Account includes role-specific Professor tools when available.</Text>
        </Stack>
      </Drawer>
    </Box>
  );
}

createRoot(mount).render(
  <MantineProvider theme={theme}>
    <ApplicationChrome />
  </MantineProvider>,
);
