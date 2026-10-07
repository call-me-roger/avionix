import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { SETUP_ROUTE } from '@/application/panel-layout';
import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import {
  FEATURE_AUTOPILOT,
  FEATURE_MODE_HDG,
  GENERIC_COMMANDS,
  GENERIC_PROFILE,
} from '@/domain/aircraft/profiles/generic';
import { AutopilotPanel } from '@/features/panels/autopilot/AutopilotPanel';
import type { PanelScopeActions } from '@/features/panels/primitives/PanelContext';
import { PanelFrame } from '@/features/panels/primitives/PanelFrame';
import { PANELS, PANEL_IDS, findPanel } from '@/features/panels/registry';
import { ThemeProvider } from '@/theme/theme-context';

const NOW = 100_000;
const base = initialSnapshot(GENERIC_PROFILE, 5);

function live(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    ...base,
    state: 'connected',
    health: { ...base.health, activity: 'running', live: true, lastHeartbeatAt: NOW },
    compatibility: {
      ...base.compatibility,
      features: base.compatibility.features.map((feature) => ({
        ...feature,
        status: 'available' as const,
      })),
    },
    ...overrides,
  };
}

function makeActions(): PanelScopeActions & { write: jest.Mock; activate: jest.Mock } {
  return { write: jest.fn(async () => undefined), activate: jest.fn(async () => 'ok' as const) };
}

async function renderPanel(
  Component: React.ComponentType,
  snapshot: SessionSnapshot,
  actions: PanelScopeActions = makeActions(),
) {
  return render(
    <ThemeProvider storage={createMemorySettingsStorage()} systemSchemeOverride="light">
      <PanelFrame title="Panel" snapshot={snapshot} now={NOW} actions={actions}>
        <Component />
      </PanelFrame>
    </ThemeProvider>,
  );
}

describe('panel registry', () => {
  it('lists each panel once, in switcher order, never under the reserved Setup id', () => {
    expect(PANEL_IDS).toEqual([
      'instruments',
      'radios',
      'autopilot',
      'navigation',
      'systems',
      'cdu',
      'flight-data',
    ]);
    expect(new Set(PANEL_IDS).size).toBe(PANEL_IDS.length);
    expect(PANEL_IDS).not.toContain(SETUP_ROUTE);
  });

  it('declares only features the generic profile has', () => {
    const known = new Set(GENERIC_PROFILE.features.map((feature) => feature.id));
    for (const { descriptor } of PANELS) {
      for (const feature of descriptor.features) {
        expect(known.has(feature)).toBe(true);
      }
    }
  });

  it('finds a panel by id', () => {
    expect(findPanel(PANELS, 'autopilot')?.descriptor.title).toBe('Autopilot');
    expect(findPanel(PANELS, 'nope')).toBeNull();
  });
});

describe('PanelFrame fillsFrame', () => {
  function framed(fillsFrame?: boolean) {
    return (
      <ThemeProvider storage={createMemorySettingsStorage()} systemSchemeOverride="light">
        <PanelFrame
          title="Framed"
          snapshot={live({ state: 'disconnected' })}
          now={NOW}
          actions={makeActions()}
          fillsFrame={fillsFrame}
        >
          <Text>Body</Text>
        </PanelFrame>
      </ThemeProvider>
    );
  }

  it('scrolls the panel by default', async () => {
    await render(framed());
    const frame = screen.getByTestId('panel-frame');
    // Only the ScrollView takes keyboardShouldPersistTaps; a plain View never carries it.
    expect(frame.props.keyboardShouldPersistTaps).toBe('handled');
    expect(screen.getByRole('header', { name: 'Framed' })).toBeTruthy();
  });

  it('gives a fillsFrame panel a fixed-height View, keeping the title and the link notice', async () => {
    await render(framed(true));
    const frame = screen.getByTestId('panel-frame');
    expect(frame.props.keyboardShouldPersistTaps).toBeUndefined();
    expect(StyleSheet.flatten(frame.props.style)).toEqual(expect.objectContaining({ flex: 1 }));
    expect(screen.getByRole('header', { name: 'Framed' })).toBeTruthy();
    expect(screen.getByTestId('panel-notice')).toBeTruthy();
    expect(screen.getByText('Body')).toBeTruthy();
  });

  it('is set by the CDU alone', () => {
    expect(
      PANELS.filter(({ descriptor }) => descriptor.fillsFrame === true).map(
        ({ descriptor }) => descriptor.id,
      ),
    ).toEqual(['cdu']);
  });
});

describe('Autopilot panel', () => {
  it('engages the autopilot through its own feature', async () => {
    const actions = makeActions();
    await renderPanel(AutopilotPanel, live(), actions);
    await fireEvent.press(screen.getByLabelText('Engage autopilot'));
    expect(actions.activate).toHaveBeenCalledWith(
      FEATURE_AUTOPILOT,
      GENERIC_COMMANDS.autopilotEngage,
    );
  });

  it('activates a mode through its own feature', async () => {
    const actions = makeActions();
    await renderPanel(AutopilotPanel, live(), actions);
    await fireEvent.press(screen.getByLabelText('HDG mode, off'));
    expect(actions.activate).toHaveBeenCalledWith(FEATURE_MODE_HDG, GENERIC_COMMANDS.modeHeading);
  });

  it('shows the simulator’s mode state, never one just requested', async () => {
    const actions = makeActions();
    await renderPanel(AutopilotPanel, live(), actions);
    await fireEvent.press(screen.getByLabelText('HDG mode, off'));
    expect(screen.getByLabelText('HDG mode, off')).toBeTruthy();
  });

  it('says autopilot has not been checked yet before the first connect', async () => {
    await renderPanel(AutopilotPanel, base);
    expect(screen.getAllByText('Autopilot has not been checked yet.').length).toBeGreaterThan(0);
  });
});
