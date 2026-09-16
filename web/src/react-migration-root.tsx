import '@mantine/core/styles.css';

import { Box, MantineProvider, createTheme } from '@mantine/core';
import { createRoot } from 'react-dom/client';

const mount = document.querySelector<HTMLElement>('#react-migration-root');

if (!mount) {
  throw new Error('React migration root is missing.');
}

const theme = createTheme({
  primaryColor: 'blue',
  defaultRadius: 'md',
  fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  headings: {
    fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
});

function MigrationBoundary() {
  return (
    <MantineProvider theme={theme}>
      <Box component="span" data-vlab-react-foundation="mounted" />
    </MantineProvider>
  );
}

createRoot(mount).render(<MigrationBoundary />);
