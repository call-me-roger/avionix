import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { GENERIC_DATAREFS, GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import { UNIDENTIFIED_LABEL } from '@/features/aircraft/AircraftSummary';
import { CompatibilityScreen } from '@/features/aircraft/CompatibilityScreen';
import { ThemeProvider } from '@/theme/theme-context';

const base = initialSnapshot(GENERIC_PROFILE, 5);

const degraded: SessionSnapshot['compatibility'] = {
  ...base.compatibility,
  identity: {
    icaoType: 'B738',
    description: 'Boeing 737-800',
    tailNumber: 'N738AV',
    addOnVersion: '4.4',
  },
  identified: true,
  checkedAt: 9_000,
  writabilityReported: true,
  versionWarning:
    'This profile was written for 4.2 and 4.3. The aircraft reports 4.4, so some controls may have moved.',
  features: [
    { id: 'connection-health', label: 'Connection health', status: 'available', missing: [] },
    {
      id: 'heading-control',
      label: 'Heading control',
      status: 'unavailable',
      missing: [
        {
          name: GENERIC_DATAREFS.headingBug,
          kind: 'dataref',
          purpose: 'Heading bug, written when you set a heading',
          status: 'readOnly',
        },
      ],
    },
  ],
};

async function renderScreen(patch: Partial<SessionSnapshot>, onRecheck = jest.fn()) {
  const snapshot: SessionSnapshot = { ...base, ...patch };
  await render(
    <ThemeProvider storage={createMemorySettingsStorage()}>
      <CompatibilityScreen snapshot={snapshot} now={10_000} onRecheck={onRecheck} />
    </ThemeProvider>,
  );
  return onRecheck;
}

describe('CompatibilityScreen', () => {
  it('names the aircraft, its add-on version and the profile', async () => {
    await renderScreen({ state: 'connected', compatibility: degraded });
    expect(screen.getByText('Boeing 737-800 (B738) · N738AV')).toBeTruthy();
    expect(screen.getByText('Add-on version 4.4')).toBeTruthy();
    expect(
      screen.getByText('Profile: Generic X-Plane aircraft 1.0.0 (generic fallback)'),
    ).toBeTruthy();
  });

  it('shows the version warning', async () => {
    await renderScreen({ state: 'connected', compatibility: degraded });
    expect(screen.getByText(/some controls may have moved/)).toBeTruthy();
  });

  it('shows which aircraft versions the profile was tested with', async () => {
    await renderScreen({
      state: 'connected',
      compatibility: { ...degraded, testedWith: ['4.2', '4.3'] },
    });
    expect(screen.getByText('Tested with 4.2, 4.3')).toBeTruthy();
  });

  it('shows no tested-with line when the profile declares none', async () => {
    await renderScreen({ state: 'connected', compatibility: degraded });
    expect(screen.queryByText(/^Tested with/)).toBeNull();
  });

  it('names every missing binding with its purpose and why it cannot be used', async () => {
    await renderScreen({ state: 'connected', compatibility: degraded });
    expect(screen.getByText('Heading control')).toBeTruthy();
    expect(screen.getByText('not available on this aircraft')).toBeTruthy();
    expect(
      screen.getByText(
        `Heading bug, written when you set a heading — ${GENERIC_DATAREFS.headingBug} — read-only on this aircraft`,
      ),
    ).toBeTruthy();
  });

  it('explains the fallback when nothing was identified', async () => {
    await renderScreen({
      state: 'connected',
      compatibility: { ...base.compatibility, checkedAt: 9_000 },
    });
    expect(screen.getByText(UNIDENTIFIED_LABEL)).toBeTruthy();
    expect(screen.getByText('Avionix is using the generic profile.')).toBeTruthy();
  });

  it('warns when this X-Plane does not report write capability', async () => {
    await renderScreen({
      state: 'connected',
      compatibility: { ...degraded, writabilityReported: false },
    });
    expect(screen.getByText(/does not report which values can be written/)).toBeTruthy();
  });

  it('marks the result not current and disables the re-check when disconnected', async () => {
    const onRecheck = await renderScreen({ state: 'disconnected', compatibility: degraded });
    expect(screen.getByText('Last checked 1 s ago. Not current.')).toBeTruthy();
    fireEvent.press(screen.getByText('Check again'));
    expect(onRecheck).not.toHaveBeenCalled();
  });

  it('re-checks on demand while connected', async () => {
    const onRecheck = await renderScreen({ state: 'connected', compatibility: degraded });
    fireEvent.press(screen.getByText('Check again'));
    expect(onRecheck).toHaveBeenCalled();
  });
});
