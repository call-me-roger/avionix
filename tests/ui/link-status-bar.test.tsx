import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import { LinkStatusBar } from '@/features/health/LinkStatusBar';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { ThemeProvider } from '@/theme/theme-context';

async function renderBar(patch: Partial<SessionSnapshot>, onOpen = jest.fn()) {
  const base = initialSnapshot(GENERIC_PROFILE, 5);
  const snapshot: SessionSnapshot = { ...base, ...patch };
  await render(
    <ThemeProvider storage={createMemorySettingsStorage()}>
      <LinkStatusBar snapshot={snapshot} now={10_000} onOpenDiagnostics={onOpen} />
    </ThemeProvider>,
  );
  return onOpen;
}

const connected = (health: Partial<SessionSnapshot['health']>): Partial<SessionSnapshot> => {
  const base = initialSnapshot(GENERIC_PROFILE, 5);
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

  it.each([
    ['disconnected', 'Not connected'],
    ['connecting', 'Connecting'],
    ['pairing', 'Waiting for the pairing code'],
    ['connected', 'Connected'],
    ['reconnecting', 'Reconnecting'],
    ['error', 'Connection failed'],
  ] as const)('shows the literal label text for %s', async (state, label) => {
    await renderBar({ state });
    expect(screen.getByText(label)).toBeTruthy();
  });

  it('shows the retry attempt against its budget while reconnecting', async () => {
    await renderBar({ state: 'reconnecting', reconnectAttempt: 2 });
    expect(screen.getByText('Reconnecting, attempt 2 of 5')).toBeTruthy();
  });

  it('announces the retry attempt in the accessibility label too, not only the visible line', async () => {
    await renderBar({ state: 'reconnecting', reconnectAttempt: 2 });
    expect(screen.getByText('Reconnecting, attempt 2 of 5')).toBeTruthy();
    expect(
      screen.getByLabelText(/Reconnecting\..*Reconnecting, attempt 2 of 5\..*Open diagnostics\./s),
    ).toBeTruthy();
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
