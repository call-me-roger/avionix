import { render, screen } from '@testing-library/react-native';
import React from 'react';

import type { DiscoverySnapshot } from '@/application/connector-discovery';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { DiscoveredConnectors } from '@/features/connection/DiscoveredConnectors';
import { ThemeProvider } from '@/theme/theme-context';

const emptySnapshot: DiscoverySnapshot = {
  availability: 'available',
  scanning: false,
  connectors: [],
  error: null,
};

async function renderConnectors(snapshot: DiscoverySnapshot, enabled: boolean) {
  return render(
    <ThemeProvider storage={createMemorySettingsStorage()} systemSchemeOverride="light">
      <DiscoveredConnectors snapshot={snapshot} enabled={enabled} onSelect={() => undefined} />
    </ThemeProvider>,
  );
}

describe('DiscoveredConnectors', () => {
  it('shows "No connectors found yet." when idle with an empty list', async () => {
    await renderConnectors(emptySnapshot, true);
    expect(screen.getByText('No connectors found yet.')).toBeTruthy();
    expect(screen.queryByText('Looking for connectors…')).toBeNull();
  });

  it('shows nothing when disabled', async () => {
    await renderConnectors(emptySnapshot, false);
    expect(screen.queryByText('Connectors on this network')).toBeNull();
    expect(screen.queryByText('No connectors found yet.')).toBeNull();
  });
});
