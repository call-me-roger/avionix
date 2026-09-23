import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { ALL_DATAREF_NAMES } from '@/application/mvp-bindings';
import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { LinkStatusBar } from '@/features/health/LinkStatusBar';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { ThemeProvider } from '@/theme/theme-context';

async function renderBar(patch: Partial<SessionSnapshot>, onOpen = jest.fn()) {
  const base = initialSnapshot(ALL_DATAREF_NAMES, 5);
  const snapshot: SessionSnapshot = { ...base, ...patch };
  await render(
    <ThemeProvider storage={createMemorySettingsStorage()}>
      <LinkStatusBar snapshot={snapshot} now={10_000} onOpenDiagnostics={onOpen} />
    </ThemeProvider>,
  );
  return onOpen;
}

const connected = (health: Partial<SessionSnapshot['health']>): Partial<SessionSnapshot> => {
  const base = initialSnapshot(ALL_DATAREF_NAMES, 5);
  return { state: 'connected', health: { ...base.health, ...health } };
};

describe('LinkStatusBar', () => {
  it('says the values are live when they are', async () => {
    await renderBar(connected({ activity: 'running', live: true, lastHeartbeatAt: 9_900 }));
    expect(screen.getByText('Live')).toBeTruthy();
    expect(screen.getByText('X-Plane is running')).toBeTruthy();
    expect(screen.getByText('100 ms ago')).toBeTruthy();
  });

  it('marks the readouts not live when the heartbeat has gone quiet', async () => {
    await renderBar(
      connected({ activity: 'pausedOrStalled', live: false, lastHeartbeatAt: 2_000 }),
    );
    expect(screen.getByText('Not live')).toBeTruthy();
    expect(screen.getByText('X-Plane is paused or not running')).toBeTruthy();
  });

  it('names the paused simulator rather than blaming the link', async () => {
    await renderBar(connected({ activity: 'paused', live: false, lastHeartbeatAt: 2_000 }));
    expect(screen.getByText('X-Plane is paused')).toBeTruthy();
  });

  it('shows the retry attempt against its budget while reconnecting', async () => {
    await renderBar({ state: 'reconnecting', reconnectAttempt: 2 });
    expect(screen.getByText('Reconnecting, attempt 2 of 5')).toBeTruthy();
  });

  it('opens diagnostics when tapped', async () => {
    const onOpen = await renderBar(
      connected({ activity: 'running', live: true, lastHeartbeatAt: 9_900 }),
    );
    fireEvent.press(screen.getByTestId('link-status-bar'));
    expect(onOpen).toHaveBeenCalled();
  });

  it('is announced as one button naming the link state', async () => {
    await renderBar(connected({ activity: 'running', live: true, lastHeartbeatAt: 9_900 }));
    expect(screen.getByLabelText(/Connected.*X-Plane is running.*live/i)).toBeTruthy();
  });
});
