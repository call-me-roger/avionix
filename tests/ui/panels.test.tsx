import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { SETUP_ROUTE } from '@/application/panel-layout';
import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import {
  FEATURE_HEADING_CONTROL,
  GENERIC_COMMANDS,
  GENERIC_DATAREFS,
  GENERIC_PROFILE,
} from '@/domain/aircraft/profiles/generic';
import { BasicDataPanel } from '@/features/panels/basic-data/BasicDataPanel';
import { HeadingPanel } from '@/features/panels/heading/HeadingPanel';
import type { PanelActions } from '@/features/panels/primitives/PanelContext';
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

function makeActions(): PanelActions & { write: jest.Mock; activate: jest.Mock } {
  return { write: jest.fn(async () => undefined), activate: jest.fn(async () => undefined) };
}

async function renderPanel(
  Component: React.ComponentType,
  snapshot: SessionSnapshot,
  actions: PanelActions = makeActions(),
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
    expect(PANEL_IDS).toEqual(['basic-data', 'heading']);
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
    expect(findPanel(PANELS, 'heading')?.descriptor.title).toBe('Heading');
    expect(findPanel(PANELS, 'nope')).toBeNull();
  });
});

describe('Basic data panel', () => {
  it('shows airspeed, heading bug and sim time from the simulator', async () => {
    await renderPanel(
      BasicDataPanel,
      live({
        telemetry: {
          [GENERIC_DATAREFS.airspeed]: { value: 124.3, receivedAt: NOW },
          [GENERIC_DATAREFS.headingBug]: { value: 270, receivedAt: NOW },
          [GENERIC_DATAREFS.heartbeat]: { value: 812, receivedAt: NOW },
        },
      }),
    );
    expect(screen.getByLabelText('Indicated airspeed: 124.3 kt')).toBeTruthy();
    expect(screen.getByLabelText('Heading bug: 270°')).toBeTruthy();
    expect(screen.getByLabelText('Sim running time: 812 s')).toBeTruthy();
  });

  it('says airspeed is not on this aircraft when its DataRef is missing', async () => {
    const snapshot = live();
    await renderPanel(BasicDataPanel, {
      ...snapshot,
      compatibility: {
        ...snapshot.compatibility,
        bindings: {
          [GENERIC_DATAREFS.airspeed]: {
            name: GENERIC_DATAREFS.airspeed,
            kind: 'dataref',
            status: 'missing',
          },
        },
      },
    });
    expect(
      screen.getByLabelText('Indicated airspeed: not available on this aircraft'),
    ).toBeTruthy();
  });
});

describe('Heading panel', () => {
  it('writes the heading bug through the heading feature', async () => {
    const actions = makeActions();
    await renderPanel(HeadingPanel, live(), actions);
    await fireEvent.changeText(screen.getByLabelText('New heading'), '95');
    await fireEvent.press(screen.getByRole('button', { name: 'Set New heading' }));
    expect(actions.write).toHaveBeenCalledWith(
      FEATURE_HEADING_CONTROL,
      GENERIC_DATAREFS.headingBug,
      95,
    );
  });

  it('refuses a heading outside 0 to 360 before anything is sent', async () => {
    const actions = makeActions();
    await renderPanel(HeadingPanel, live(), actions);
    await fireEvent.changeText(screen.getByLabelText('New heading'), '400');
    await fireEvent.press(screen.getByRole('button', { name: 'Set New heading' }));
    expect(actions.write).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a number from 0 to 360.')).toBeTruthy();
  });

  it('activates heading up', async () => {
    const actions = makeActions();
    await renderPanel(HeadingPanel, live(), actions);
    await fireEvent.press(screen.getByRole('button', { name: 'Heading up' }));
    expect(actions.activate).toHaveBeenCalledWith(
      FEATURE_HEADING_CONTROL,
      GENERIC_COMMANDS.headingUp,
    );
  });

  it('shows the simulator’s heading, never the one it just wrote', async () => {
    const actions = makeActions();
    await renderPanel(
      HeadingPanel,
      live({
        telemetry: { [GENERIC_DATAREFS.headingBug]: { value: 90, receivedAt: NOW } },
        operations: {
          [GENERIC_DATAREFS.headingBug]: { status: 'ok', failure: null, refusal: null, at: NOW },
        },
      }),
      actions,
    );
    await fireEvent.changeText(screen.getByLabelText('New heading'), '95');
    await fireEvent.press(screen.getByRole('button', { name: 'Set New heading' }));
    expect(screen.getByLabelText('Heading bug: 90°')).toBeTruthy();
    expect(screen.queryByLabelText('Heading bug: 95°')).toBeNull();
  });

  it('says heading control has not been checked yet before the first connect', async () => {
    await renderPanel(HeadingPanel, base);
    expect(screen.getAllByText('Heading control has not been checked yet.').length).toBeGreaterThan(
      0,
    );
  });
});
