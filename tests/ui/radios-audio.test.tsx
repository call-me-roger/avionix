import { fireEvent, render, screen, within } from '@testing-library/react-native';
import React from 'react';

import {
  type OperationOutcome,
  type SessionSnapshot,
  initialSnapshot,
} from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { GENERIC_DATAREFS as D, GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import type { ActivationResult } from '@/domain/panels/activation';
import type { HoldPhase } from '@/domain/panels/hold-lease';
import {
  AUDIO_STATE_NAMES,
  FEATURE_AUDIO_MARKER,
  FEATURE_AUDIO_MONITOR,
  FEATURE_AUDIO_TRANSMIT,
  MARKER_LAMPS,
  MICS,
  MONITORS,
  type MicSpec,
  TRANSMIT,
} from '@/domain/audio/catalogue';
import type { DataRefValue } from '@/domain/simulator/types';
import { AudioUnit } from '@/features/panels/radios/AudioUnit';
import type { PanelScopeActions } from '@/features/panels/primitives/PanelContext';
import { PanelFrame, PanelScope } from '@/features/panels/primitives/PanelFrame';
import { useReadBack } from '@/features/panels/primitives/useReadBack';
import { RadiosPanel } from '@/features/panels/radios/RadiosPanel';
import { UnitsProvider } from '@/features/units/UnitsProvider';
import { ThemeProvider } from '@/theme/theme-context';

import { AUDIO_VALUES, audioCompatibility, audioTelemetry } from '../helpers/audio';

jest.mock('@/platform/haptics', () => ({ haptics: { press: jest.fn(), failure: jest.fn() } }));

const NOW = 1_000_000;
const HIDDEN = { includeHiddenElements: true };
const base = initialSnapshot(GENERIC_PROFILE, 5);
const identified: SessionSnapshot['compatibility'] = {
  ...base.compatibility,
  identity: { ...base.compatibility.identity, description: 'Cessna 172', icaoType: 'C172' },
  identified: true,
};

type Status = 'ok' | 'missing' | 'readOnly' | 'unchecked';

function snapshot({
  values = {},
  bindings = {},
  operations = {},
  stale = false,
  noFlight = false,
  absent = [],
}: {
  values?: Record<string, DataRefValue>;
  /** Names resolved but whose value has not arrived (dropped telemetry on a panel switch). */
  absent?: readonly string[];
  bindings?: Partial<Record<string, Status>>;
  operations?: Record<string, OperationOutcome>;
  stale?: boolean;
  noFlight?: boolean;
} = {}): SessionSnapshot {
  return {
    ...base,
    state: stale ? 'reconnecting' : 'connected',
    health: {
      ...base.health,
      activity: noFlight ? 'noFlight' : 'running',
      live: true,
      lastHeartbeatAt: NOW,
    },
    telemetry: audioTelemetry(
      Object.fromEntries(
        Object.entries({ ...AUDIO_VALUES, ...values }).filter(([name]) => !absent.includes(name)),
      ),
      NOW,
    ),
    compatibility: audioCompatibility(identified, bindings),
    operations,
  };
}

const accepted = (name: string): Record<string, OperationOutcome> => ({
  [name]: { status: 'ok', failure: null, refusal: null, at: NOW },
});

const hold = jest.fn<Promise<ActivationResult>, [string, string, HoldPhase]>(async () => 'ok');
const activate = jest.fn<Promise<ActivationResult>, [string, string, number?]>(async () => 'ok');
const write = jest.fn<Promise<void>, [string, string, DataRefValue]>(async () => undefined);
const actions: PanelScopeActions = { write, activate, hold };

function Harness() {
  const readBack = useReadBack();
  return <AudioUnit readBack={readBack} />;
}

function tree(snap: SessionSnapshot, now = NOW) {
  return (
    <ThemeProvider storage={createMemorySettingsStorage()} systemSchemeOverride="light">
      <PanelScope snapshot={snap} now={now} actions={actions}>
        <Harness />
      </PanelScope>
    </ThemeProvider>
  );
}

const RADIO_VALUES: Record<string, DataRefValue> = {
  [D.com1Active]: 121_500,
  [D.com1Standby]: 118_005,
  [D.com2Active]: 118_000,
  [D.com2Standby]: 124_850,
  [D.nav1Active]: 11_030,
  [D.nav1Standby]: 10_850,
  [D.nav2Active]: 11_390,
  [D.nav2Standby]: 11_720,
  [D.transponderCode]: 7000,
  [D.transponderMode]: 3,
};

function panelTree(snap: SessionSnapshot, now = NOW) {
  const storage = createMemorySettingsStorage();
  return (
    <ThemeProvider storage={storage} systemSchemeOverride="light">
      <UnitsProvider storage={storage}>
        <PanelFrame title="Radios" snapshot={snap} now={now} actions={actions}>
          <RadiosPanel />
        </PanelFrame>
      </UnitsProvider>
    </ThemeProvider>
  );
}

const button = (name: string) => screen.getByRole('button', { name });

afterEach(() => jest.clearAllMocks());

const [, MIC2] = MICS as [MicSpec, MicSpec];
const monitorBy = (legend: string) => MONITORS.find((spec) => spec.legend === legend)!;
const barOf = (name: string) =>
  within(button(name)).getByTestId(/^light-bar-/, HIDDEN).props.testID as string;

describe('the AUDIO unit', () => {
  it('draws the MIC row and the seven monitor keys with X-Plane’s state', async () => {
    await render(tree(snapshot()));
    expect(barOf('Transmit on COM1, selected')).toBe('light-bar-engaged');
    expect(barOf('Transmit on COM2')).toBe('light-bar-off');
    expect(barOf('Listen to COM1, on')).toBe('light-bar-lit');
    expect(barOf('Listen to COM2, off')).toBe('light-bar-off');
    for (const name of [
      'Listen to NAV1, off',
      'Listen to NAV2, off',
      'Listen to the ADF, off',
      'Listen to the DME, off',
      'Listen to the marker beacons, on',
    ]) {
      expect(button(name)).toBeTruthy();
    }
  });

  it('sends the other COM’s transmit command and waits for X-Plane', async () => {
    const { rerender } = await render(tree(snapshot()));
    await fireEvent.press(button('Transmit on COM2'));
    expect(activate).toHaveBeenCalledWith(FEATURE_AUDIO_TRANSMIT, MIC2.command);
    await rerender(tree(snapshot({ operations: accepted(MIC2.command) })));
    expect(button('Transmit on COM2')).toBeDisabled();
    await rerender(
      tree(snapshot({ values: { [TRANSMIT.selection]: 7 }, operations: accepted(MIC2.command) })),
    );
    expect(barOf('Transmit on COM2, selected')).toBe('light-bar-engaged');
    expect(barOf('Transmit on COM1')).toBe('light-bar-off');
  });

  it('keeps the selected MIC key inert', async () => {
    await render(tree(snapshot()));
    expect(button('Transmit on COM1, selected')).toBeDisabled();
  });

  it('sends _on for a receiver that is off and _off for one that is on', async () => {
    await render(tree(snapshot()));
    await fireEvent.press(button('Listen to COM2, off'));
    expect(activate).toHaveBeenLastCalledWith(FEATURE_AUDIO_MONITOR, monitorBy('COM2').on);
    await fireEvent.press(button('Listen to the marker beacons, on'));
    expect(activate).toHaveBeenLastCalledWith(FEATURE_AUDIO_MARKER, monitorBy('MKR').off);
  });

  it('says so when X-Plane does not adopt a change', async () => {
    const { rerender } = await render(tree(snapshot()));
    await fireEvent.press(button('Listen to COM2, off'));
    await rerender(tree(snapshot({ operations: accepted(monitorBy('COM2').on) }), NOW + 3_100));
    expect(screen.getByText("The Cessna 172 didn't start listening to COM2.")).toBeTruthy();
  });

  it('draws the transmitting COM lit and inert under auto-listen', async () => {
    await render(tree(snapshot({ values: { [TRANSMIT.autoListen]: 1, [MONITORS[0]!.state]: 0 } })));
    const key = button('Listen to COM1, heard while transmitting');
    expect(key).toBeDisabled();
    expect(barOf('Listen to COM1, heard while transmitting')).toBe('light-bar-lit');
    expect(button('Listen to COM2, off')).not.toBeDisabled();
  });

  it('says when the transmitting COM is not heard', async () => {
    await render(tree(snapshot({ values: { [MONITORS[0]!.state]: 0 } })));
    expect(screen.getByText("You transmit on COM1 but aren't listening to it.")).toBeTruthy();
  });

  it('selects no MIC for a selection X-Plane reports as neither COM', async () => {
    await render(tree(snapshot({ values: { [TRANSMIT.selection]: 9 } })));
    expect(button('Transmit on COM1')).not.toBeDisabled();
    expect(button('Transmit on COM2')).not.toBeDisabled();
    expect(screen.queryByText(/aren't listening/)).toBeNull();
  });

  it('keeps both MIC keys inert until X-Plane’s selection arrives', async () => {
    await render(tree(snapshot({ absent: [TRANSMIT.selection] })));
    expect(button('Transmit on COM1, unknown')).toBeDisabled();
    expect(button('Transmit on COM2, unknown')).toBeDisabled();
    await fireEvent.press(button('Transmit on COM1, unknown'));
    expect(activate).not.toHaveBeenCalled();
  });

  it('does not blame a pending COM listen on a MIC press that rewrote it', async () => {
    const { rerender } = await render(tree(snapshot()));
    await fireEvent.press(button('Listen to COM2, off'));
    await fireEvent.press(button('Transmit on COM2'));
    expect(activate).toHaveBeenLastCalledWith(FEATURE_AUDIO_TRANSMIT, MIC2.command);
    const operations = { ...accepted(monitorBy('COM2').on), ...accepted(MIC2.command) };
    await rerender(
      tree(snapshot({ values: { [TRANSMIT.selection]: 7 }, operations }), NOW + 3_100),
    );
    expect(screen.queryByText(/didn't start listening to COM2/)).toBeNull();
  });

  it('lists a definitively missing key and keeps the rest working', async () => {
    await render(tree(snapshot({ bindings: { [monitorBy('MKR').state]: 'missing' } })));
    expect(screen.queryByRole('button', { name: /marker beacons/ })).toBeNull();
    expect(screen.getByText('Not available on the Cessna 172: MKR.')).toBeTruthy();
    expect(button('Listen to COM2, off')).not.toBeDisabled();
  });

  it('shows the label only while names are unchecked', async () => {
    const unchecked = Object.fromEntries(
      [
        TRANSMIT.selection,
        TRANSMIT.autoListen,
        ...MONITORS.flatMap((m) => [m.state, m.on, m.off]),
        ...MICS.map((m) => m.command),
      ].map((name) => [name, 'unchecked' as const]),
    );
    await render(tree(snapshot({ bindings: unchecked })));
    expect(screen.getByText('AUDIO')).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByText(/available/)).toBeNull();
  });

  it('says the audio panel is not available when no state name resolves', async () => {
    const missing = Object.fromEntries(AUDIO_STATE_NAMES.map((name) => [name, 'missing' as const]));
    await render(tree(snapshot({ bindings: missing })));
    expect(screen.getByText("The audio panel isn't available on the Cessna 172.")).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('neither draws nor speaks the lamps before their values arrive', async () => {
    await render(tree(snapshot({ absent: [MARKER_LAMPS[2]!.state] })));
    expect(screen.queryByLabelText(/Marker beacon/)).toBeNull();
    expect(screen.queryByText('I', HIDDEN)).toBeNull();
  });

  it('lights the marker lamp X-Plane reports and speaks it', async () => {
    await render(tree(snapshot({ values: { [MARKER_LAMPS[1]!.state]: 1 } })));
    expect(screen.getByLabelText('Marker beacon: middle')).toBeTruthy();
  });

  it('dims the bars, hides the lamps and keeps the keys inert when values are stale', async () => {
    await render(tree(snapshot({ stale: true, values: { [MARKER_LAMPS[0]!.state]: 1 } })));
    expect(button('Listen to COM2, off')).toBeDisabled();
    expect(screen.queryByLabelText(/Marker beacon/)).toBeNull();
    expect(barOf('Transmit on COM1, selected')).toBe('light-bar-engaged');
  });

  it('draws nothing but its label with no flight loaded', async () => {
    await render(tree(snapshot({ noFlight: true })));
    expect(screen.getByText('AUDIO')).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('the Radios panel', () => {
  it('puts AUDIO above COM1', async () => {
    await render(panelTree(snapshot({ values: RADIO_VALUES })));
    const units = screen.getAllByRole('header').map((node) => node.props.children);
    expect(units.indexOf('AUDIO')).toBeLessThan(units.indexOf('COM1'));
  });

  it('shows MIC on the transmitting COM row only, and speaks it', async () => {
    await render(panelTree(snapshot({ values: { ...RADIO_VALUES, [TRANSMIT.selection]: 7 } })));
    // The MIC lamp is hidden from accessibility (the row's own label already speaks it).
    expect(within(screen.getByTestId('radio-row-com2')).getByText('MIC', HIDDEN)).toBeTruthy();
    expect(within(screen.getByTestId('radio-row-com1')).queryByText('MIC', HIDDEN)).toBeNull();
    expect(screen.getByLabelText(/^COM2, transmitting: active/)).toBeTruthy();
  });

  it('shows no MIC on either row for an unknown selection', async () => {
    await render(panelTree(snapshot({ values: { ...RADIO_VALUES, [TRANSMIT.selection]: 0 } })));
    expect(screen.queryByText('MIC', HIDDEN)).toBeNull();
  });
});
