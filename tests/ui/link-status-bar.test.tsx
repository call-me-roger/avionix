import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import { LinkStatusBar, statusLamp } from '@/features/health/LinkStatusBar';
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

describe('statusLamp', () => {
  it('is live only when connected and the values are live', () => {
    expect(statusLamp('connected', true)).toBe('live');
    expect(statusLamp('connected', false)).toBe('notLive');
  });

  it.each(['connecting', 'pairing', 'reconnecting'] as const)('is not live while %s', (state) => {
    expect(statusLamp(state, false)).toBe('notLive');
  });

  it.each(['disconnected', 'error'] as const)('is down when %s', (state) => {
    expect(statusLamp(state, false)).toBe('down');
  });
});

describe('LinkStatusBar', () => {
  it('shows the live lamp and the combined line, with no age, when the values are live', async () => {
    await renderBar(connected({ activity: 'running', live: true, lastHeartbeatAt: 9_900 }));
    expect(screen.getByTestId('status-lamp-live')).toBeTruthy();
    expect(screen.getByText('Connected · Live')).toBeTruthy();
    // A live bar needs no age, which is the dark-cockpit principle: quiet while normal.
    expect(screen.queryByText(/updated/)).toBeNull();
  });

  it('marks the readouts not live when the heartbeat has gone quiet', async () => {
    await renderBar(
      connected({ activity: 'pausedOrStalled', live: false, lastHeartbeatAt: 2_000 }),
    );
    expect(screen.getByTestId('status-lamp-notLive')).toBeTruthy();
    expect(screen.getByText('Connected · X-Plane is paused or not running')).toBeTruthy();
    expect(screen.getByText('updated 8 s ago')).toBeTruthy();
  });

  it('names the paused simulator rather than blaming the link', async () => {
    await renderBar(connected({ activity: 'paused', live: false, lastHeartbeatAt: 2_000 }));
    expect(screen.getByText('Connected · X-Plane is paused')).toBeTruthy();
  });

  it.each([
    ['disconnected', 'Not connected', 'down'],
    ['connecting', 'Connecting', 'notLive'],
    ['pairing', 'Waiting for the pairing code', 'notLive'],
    ['error', 'Connection failed', 'down'],
  ] as const)('shows the literal label text and lamp for %s', async (state, label, lamp) => {
    await renderBar({ state });
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByTestId(`status-lamp-${lamp}`)).toBeTruthy();
  });

  it('shows the retry attempt against its budget while reconnecting, dot-joined', async () => {
    await renderBar({ state: 'reconnecting', reconnectAttempt: 2 });
    expect(screen.getByText('Reconnecting · attempt 2 of 5')).toBeTruthy();
    expect(screen.getByTestId('status-lamp-notLive')).toBeTruthy();
  });

  it('announces the retry attempt in the accessibility label too, not only the visible line', async () => {
    await renderBar({ state: 'reconnecting', reconnectAttempt: 2 });
    expect(screen.getByText('Reconnecting · attempt 2 of 5')).toBeTruthy();
    expect(
      screen.getByLabelText(/Reconnecting\..*Reconnecting, attempt 2 of 5\..*Open diagnostics\./s),
    ).toBeTruthy();
  });

  it('opens diagnostics when tapped', async () => {
    const onOpen = await renderBar(
      connected({ activity: 'running', live: true, lastHeartbeatAt: 9_900 }),
    );
    await fireEvent.press(screen.getByTestId('link-status-bar'));
    expect(onOpen).toHaveBeenCalled();
  });

  it('is announced as one button naming the link state', async () => {
    await renderBar(connected({ activity: 'running', live: true, lastHeartbeatAt: 9_900 }));
    expect(screen.getByLabelText(/Connected.*X-Plane is running.*live/i)).toBeTruthy();
  });
});
