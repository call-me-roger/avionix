import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { GENERIC_DATAREFS, GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import { AircraftSummary, UNIDENTIFIED_LABEL } from '@/features/aircraft/AircraftSummary';
import { ThemeProvider } from '@/theme/theme-context';

const base = initialSnapshot(GENERIC_PROFILE, 5);

const identified: SessionSnapshot['compatibility'] = {
  ...base.compatibility,
  identity: {
    icaoType: 'C172',
    description: 'Cessna 172 SP',
    tailNumber: 'N172SP',
    addOnVersion: null,
  },
  identified: true,
  checkedAt: 9_000,
  features: [
    { id: 'connection-health', label: 'Connection health', status: 'available', missing: [] },
    { id: 'flight-telemetry', label: 'Live telemetry', status: 'available', missing: [] },
    { id: 'heading-control', label: 'Heading control', status: 'available', missing: [] },
  ],
};

async function renderSummary(patch: Partial<SessionSnapshot>, onOpen = jest.fn()) {
  const snapshot: SessionSnapshot = { ...base, ...patch };
  await render(
    <ThemeProvider storage={createMemorySettingsStorage()}>
      <AircraftSummary snapshot={snapshot} now={10_000} onOpenCompatibility={onOpen} />
    </ThemeProvider>,
  );
  return onOpen;
}

describe('AircraftSummary', () => {
  it('names the aircraft, the profile and the verdict', async () => {
    await renderSummary({ state: 'connected', compatibility: identified });
    expect(screen.getByText('Cessna 172 SP (C172) · N172SP')).toBeTruthy();
    expect(screen.getByText('Generic X-Plane aircraft 1.0.0 · generic fallback')).toBeTruthy();
    expect(screen.getByText('All features available')).toBeTruthy();
  });

  it('says so when X-Plane reported no aircraft', async () => {
    await renderSummary({
      state: 'connected',
      compatibility: { ...base.compatibility, checkedAt: 9_000 },
    });
    expect(screen.getByText(UNIDENTIFIED_LABEL)).toBeTruthy();
  });

  it('counts what is degraded', async () => {
    await renderSummary({
      state: 'connected',
      compatibility: {
        ...identified,
        features: [
          { id: 'connection-health', label: 'Connection health', status: 'available', missing: [] },
          { id: 'flight-telemetry', label: 'Live telemetry', status: 'unavailable', missing: [] },
        ],
      },
    });
    expect(screen.getByText('1 feature not available')).toBeTruthy();
  });

  it('marks the result not current once the link is down', async () => {
    await renderSummary({ state: 'disconnected', compatibility: identified });
    expect(screen.getByText('Checked 1 s ago — not current')).toBeTruthy();
  });

  it('says nothing has been checked before the first connect', async () => {
    await renderSummary({ state: 'disconnected' });
    expect(screen.getByText('Not checked yet')).toBeTruthy();
  });

  it('opens the compatibility view', async () => {
    const onOpen = await renderSummary({ state: 'connected', compatibility: identified });
    fireEvent.press(screen.getByText('Compatibility details'));
    expect(onOpen).toHaveBeenCalled();
  });

  it('never renders a dataref name in the summary row', async () => {
    await renderSummary({ state: 'connected', compatibility: identified });
    expect(screen.queryByText(new RegExp(GENERIC_DATAREFS.airspeed))).toBeNull();
  });
});
