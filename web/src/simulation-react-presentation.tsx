import './simulation-react.css';

import { Badge, Box, Button, Group, Paper, Select, SimpleGrid, Slider, Stack, Text, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  invokeSimulationAction,
  readSimulationPresentation,
  setSimulationGlyph,
  setSimulationSpeed,
  subscribeSimulationPresentation,
  type SimulationPresentationSnapshot,
} from './simulation-react-adapter';

function stateColor(state: string) {
  return state === 'Running' ? 'teal' : 'gray';
}

export function SimulationPresentation() {
  const [snapshot, setSnapshot] = useState<SimulationPresentationSnapshot | null>(() => readSimulationPresentation());
  const sync = () => setSnapshot(readSimulationPresentation());
  const syncSoon = () => queueMicrotask(sync);

  useEffect(() => {
    sync();
    return subscribeSimulationPresentation(syncSoon);
  }, []);

  useEffect(() => {
    if (!snapshot) return;
    document.body.classList.add('vlab-react-simulation-mounted');
    return () => document.body.classList.remove('vlab-react-simulation-mounted');
  }, [Boolean(snapshot)]);

  if (!snapshot) return null;

  const action = (name: 'run' | 'pause' | 'restart' | 'newSeed' | 'fit') => {
    invokeSimulationAction(name);
    syncSoon();
  };

  return createPortal(
    <Paper className="vlab-react-simulation" radius="md" p="md" data-vlab-react-simulation="mounted">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" gap="md" className="vlab-react-simulation-heading">
          <Box>
            <Text size="xs" fw={800} tt="uppercase" c="cyan.8" lts="0.12em">Simulation</Text>
            <Title order={2} size="h3">Arena</Title>
          </Box>
          <Group gap="xs" wrap="wrap">
            <Badge variant="light" color={stateColor(snapshot.runState)} data-vlab-simulation-state>{snapshot.runState}</Badge>
            <Badge variant="outline" color="gray">Seed {snapshot.seed}</Badge>
          </Group>
        </Group>

        <Group gap="xs" wrap="wrap" className="vlab-react-simulation-actions">
          <Button disabled={snapshot.runDisabled} onClick={() => action('run')} data-vlab-simulation-action="run">Run</Button>
          <Button variant="light" disabled={snapshot.pauseDisabled} onClick={() => action('pause')} data-vlab-simulation-action="pause">Pause</Button>
          <Button variant="default" disabled={snapshot.restartDisabled} onClick={() => action('restart')} data-vlab-simulation-action="restart">Restart</Button>
          <Button variant="default" disabled={snapshot.newSeedDisabled} onClick={() => action('newSeed')} data-vlab-simulation-action="new-seed">New seed</Button>
        </Group>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          <Paper withBorder radius="md" p="sm" className="vlab-react-simulation-speed">
            <Stack gap="xs">
              <Group justify="space-between" align="end">
                <Box>
                  <Text size="sm" fw={700}>Execution speed</Text>
                  <Text size="xs" c="dimmed">Target {snapshot.targetSpeed}</Text>
                </Box>
                <Box ta="right">
                  <Text size="xs" c="dimmed">Actual</Text>
                  <Text fw={700} data-vlab-simulation-actual-speed>{snapshot.actualSpeed}</Text>
                </Box>
              </Group>
              <Slider
                value={snapshot.speed}
                min={snapshot.speedMin}
                max={snapshot.speedMax}
                step={snapshot.speedStep}
                disabled={snapshot.speedDisabled}
                onChange={(value) => { setSimulationSpeed(value); syncSoon(); }}
                aria-label="Execution speed multiplier"
                data-vlab-simulation-speed
              />
            </Stack>
          </Paper>

          <SimpleGrid cols={3} spacing="xs" className="vlab-react-simulation-stats">
            <Paper withBorder radius="md" p="sm">
              <Text size="xs" c="dimmed">Time (s)</Text>
              <Text fw={700} data-vlab-simulation-time>{snapshot.scientificTime}</Text>
            </Paper>
            <Paper withBorder radius="md" p="sm">
              <Text size="xs" c="dimmed">Physics</Text>
              <Text fw={700} data-vlab-simulation-physics>{snapshot.physicsTicks}</Text>
            </Paper>
            <Paper withBorder radius="md" p="sm">
              <Text size="xs" c="dimmed">Control</Text>
              <Text fw={700} data-vlab-simulation-control>{snapshot.controlUpdates}</Text>
            </Paper>
          </SimpleGrid>
        </SimpleGrid>

        <Group justify="space-between" align="end" gap="md" className="vlab-react-simulation-view">
          <Group gap="xs">
            <Badge variant="dot" color={snapshot.cameraStatus === 'Fit' ? 'teal' : 'cyan'}>View {snapshot.cameraStatus}</Badge>
            <Button variant="default" disabled={snapshot.fitDisabled} onClick={() => action('fit')} data-vlab-simulation-fit>Fit arena</Button>
          </Group>
          <Select
            label="Agents"
            value={snapshot.glyph}
            onChange={(value) => { if (value) { setSimulationGlyph(value); syncSoon(); } }}
            data={[
              { value: 'directional', label: 'Directional' },
              { value: 'arrow', label: 'Arrow' },
              { value: 'dot', label: 'Dot' },
            ]}
            allowDeselect={false}
            w={180}
            data-vlab-simulation-glyph
          />
        </Group>
      </Stack>
    </Paper>,
    snapshot.mount,
  );
}