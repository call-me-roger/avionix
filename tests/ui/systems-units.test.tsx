import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import {
  type OperationOutcome,
  type SessionSnapshot,
  initialSnapshot,
} from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import type { ActivationResult } from '@/domain/panels/activation';
import type { HoldPhase } from '@/domain/panels/hold-lease';
import type { DataRefValue } from '@/domain/simulator/types';
import {
  BATTERY,
  DIMMERS,
  ENGINES,
  EXTERIOR_LIGHTS,
  FEATURE_ELECTRICAL,
  FEATURE_ENGINE_START,
  FEATURE_FLAPS,
  FEATURE_FUEL,
  FEATURE_GEAR,
  FEATURE_LIGHTS_EXTERIOR,
  FEATURE_LIGHTS_INTERIOR,
  FEATURE_PARKING_BRAKE,
  FEATURE_TRIM,
  FLAPS,
  FUEL_SELECTOR,
  GEAR,
  PARKING_BRAKE,
  TRIMS,
  magnetoPositions,
  starterCommand,
} from '@/domain/systems/controls';
import { ENGINES_NOT_SHOWN } from '@/domain/systems/messages';
import type { PanelScopeActions } from '@/features/panels/primitives/PanelContext';
import { PanelScope } from '@/features/panels/primitives/PanelFrame';
import { type ReadBack, useReadBack } from '@/features/panels/primitives/useReadBack';
import {
  EngineSection,
  FlightSection,
  IceSection,
  LightsSection,
} from '@/features/panels/systems/sections';
import { ThemeProvider } from '@/theme/theme-context';
import { lightTheme } from '@/theme/tokens';

import { SYSTEMS_VALUES, systemsCompatibility, systemsTelemetry } from '../helpers/systems';

jest.mock('@/platform/haptics', () => ({ haptics: { press: jest.fn(), failure: jest.fn() } }));

const NOW = 1_000_000;
const HIDDEN = { includeHiddenElements: true };
const base = initialSnapshot(GENERIC_PROFILE, 5);
const identified: SessionSnapshot['compatibility'] = {
  ...base.compatibility,
  identity: { ...base.compatibility.identity, description: 'Cessna 172', icaoType: 'C172' },
  identified: true,
};

const BEACON = EXTERIOR_LIGHTS[0]!;
const PITCH = TRIMS[0]!;

type Status = 'ok' | 'missing' | 'readOnly';

interface SnapshotOptions {
  values?: Record<string, DataRefValue | undefined>;
  bindings?: Partial<Record<string, Status>>;
  operations?: Record<string, OperationOutcome>;
  stale?: boolean;
}

function snapshot({
  values = {},
  bindings = {},
  operations = {},
  stale = false,
}: SnapshotOptions = {}): SessionSnapshot {
  const merged: Record<string, DataRefValue> = {};
  for (const [name, value] of Object.entries({ ...SYSTEMS_VALUES, ...values })) {
    if (value !== undefined) {
      merged[name] = value;
    }
  }
  return {
    ...base,
    state: stale ? 'reconnecting' : 'connected',
    health: { ...base.health, activity: 'running', live: true, lastHeartbeatAt: NOW },
    telemetry: systemsTelemetry(merged, NOW),
    compatibility: systemsCompatibility(identified, bindings),
    operations,
  };
}

/** X-Plane accepted `name` at NOW: a read-back watch then has three seconds. */
const accepted = (name: string): Record<string, OperationOutcome> => ({
  [name]: { status: 'ok', failure: null, refusal: null, at: NOW },
});

const hold = jest.fn<Promise<ActivationResult>, [string, string, HoldPhase]>(async () => 'ok');
const activate = jest.fn<Promise<ActivationResult>, [string, string, number?]>(async () => 'ok');
const write = jest.fn<Promise<void>, [string, string, DataRefValue]>(async () => undefined);
const actions: PanelScopeActions = { write, activate, hold };

type Section = (props: { readBack: ReadBack }) => React.JSX.Element;

function Harness({ section: Component }: { section: Section }) {
  const readBack = useReadBack();
  return <Component readBack={readBack} />;
}

function tree(section: Section, snap: SessionSnapshot, now = NOW) {
  return (
    <ThemeProvider storage={createMemorySettingsStorage()} systemSchemeOverride="light">
      <PanelScope snapshot={snap} now={now} actions={actions}>
        <Harness section={section} />
      </PanelScope>
    </ThemeProvider>
  );
}

const button = (name: string) => screen.getByRole('button', { name });
const queryButton = (name: string) => screen.queryByRole('button', { name });

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe('switch keys', () => {
  it('sends _on from off, ignores a second tap until X-Plane answers, and _off from on', async () => {
    const { rerender } = await render(tree(LightsSection, snapshot()));
    await fireEvent.press(button('Beacon, off'));
    expect(activate).toHaveBeenCalledWith(FEATURE_LIGHTS_EXTERIOR, BEACON.on);
    expect(button('Beacon, off')).toBeDisabled();
    await fireEvent.press(button('Beacon, off'));
    expect(activate).toHaveBeenCalledTimes(1);

    await rerender(
      tree(
        LightsSection,
        snapshot({ values: { [BEACON.state]: 1 }, operations: accepted(BEACON.on) }),
      ),
    );
    expect(button('Beacon, on')).toBeEnabled();
    await fireEvent.press(button('Beacon, on'));
    expect(activate).toHaveBeenLastCalledWith(FEATURE_LIGHTS_EXTERIOR, BEACON.off);
  });

  it('says so when X-Plane did not take it within three seconds', async () => {
    const { rerender } = await render(tree(LightsSection, snapshot()));
    await fireEvent.press(button('Beacon, off'));
    await rerender(tree(LightsSection, snapshot({ operations: accepted(BEACON.on) }), NOW + 3000));
    expect(
      screen.getByText("The Cessna 172 didn't turn the beacon on. It's still off."),
    ).toBeTruthy();
  });

  describe('availability (S3)', () => {
    it('does not draw a switch whose state did not resolve, and names it', async () => {
      await render(tree(LightsSection, snapshot({ bindings: { [BEACON.state]: 'missing' } })));
      expect(screen.queryByTestId('switch-beacon')).toBeNull();
      expect(screen.getByTestId('switch-landing')).toBeTruthy();
      expect(screen.getByText('Not available on the Cessna 172: BCN.')).toBeTruthy();
    });

    it('draws a switch whose command did not resolve disabled, and names it', async () => {
      await render(tree(LightsSection, snapshot({ bindings: { [BEACON.on]: 'missing' } })));
      expect(screen.getByTestId('switch-beacon')).toBeTruthy();
      expect(button('Beacon, off')).toBeDisabled();
      expect(screen.getByText('Not available on the Cessna 172: BCN.')).toBeTruthy();
    });

    it('says the whole unit is unavailable when no switch is drawn', async () => {
      const bindings = Object.fromEntries(
        EXTERIOR_LIGHTS.map((spec) => [spec.state, 'missing' as const]),
      );
      await render(tree(LightsSection, snapshot({ bindings })));
      expect(screen.getByText("Exterior lights isn't available on the Cessna 172.")).toBeTruthy();
      expect(screen.queryByText(/^Not available on/)).toBeNull();
    });
  });

  it('takes two taps to turn the battery off', async () => {
    await render(
      tree(EngineSection, snapshot({ values: { [BATTERY.state]: [1, 0, 0, 0, 0, 0, 0, 0] } })),
    );
    await fireEvent.press(button('Battery, on'));
    expect(button('Tap again: BATT')).toBeTruthy();
    expect(activate).not.toHaveBeenCalled();
    await fireEvent.press(button('Tap again: BATT'));
    expect(activate).toHaveBeenCalledWith(FEATURE_ELECTRICAL, BATTERY.off);
  });

  it('turns anti-ice on with its own command', async () => {
    await render(tree(IceSection, snapshot()));
    await fireEvent.press(button('Pitot heat, off'));
    expect(activate).toHaveBeenCalledWith('anti-ice', 'sim/ice/pitot_heat0_on');
  });
});

describe('gear', () => {
  it('shows three green lamps and takes two taps to raise the gear', async () => {
    await render(tree(FlightSection, snapshot()));
    expect(screen.getByLabelText('Gear down, three green')).toBeTruthy();
    for (const index of [0, 1, 2]) {
      expect(screen.getByTestId(`gear-lamp-${index}-down`, HIDDEN)).toBeTruthy();
    }
    expect(button('GEAR DOWN').props.accessibilityState).toMatchObject({ selected: true });
    await fireEvent.press(button('GEAR UP'));
    expect(activate).not.toHaveBeenCalled();
    await fireEvent.press(button('Tap again: GEAR UP'));
    expect(activate).toHaveBeenCalledWith(FEATURE_GEAR, GEAR.up);
  });

  it('explains a gear handle X-Plane kept down on the ground', async () => {
    const { rerender } = await render(tree(FlightSection, snapshot()));
    await fireEvent.press(button('GEAR UP'));
    await fireEvent.press(button('Tap again: GEAR UP'));
    await rerender(tree(FlightSection, snapshot({ operations: accepted(GEAR.up) }), NOW + 3000));
    expect(
      screen.getByText(
        "The Cessna 172 didn't move the gear handle up. X-Plane keeps the gear down while the aircraft is on the ground.",
      ),
    ).toBeTruthy();
  });

  it('shows fixed gear without a lever', async () => {
    await render(tree(FlightSection, snapshot({ values: { [GEAR.retractable]: 0 } })));
    expect(screen.getByText('Fixed landing gear')).toBeTruthy();
    expect(queryButton('GEAR UP')).toBeNull();
    expect(queryButton('GEAR DOWN')).toBeNull();
  });

  it('draws an in-transit lamp as an outline', async () => {
    await render(
      tree(
        FlightSection,
        snapshot({ values: { [GEAR.deployment]: [1, 0.5, 0, 0, 0, 0, 0, 0, 0, 0] } }),
      ),
    );
    expect(screen.getByLabelText('Gear in transit, one green')).toBeTruthy();
    expect(screen.getByTestId('gear-lamp-1-transit', HIDDEN)).toBeTruthy();
    expect(screen.getByTestId('gear-lamp-2-up', HIDDEN)).toBeTruthy();
  });
});

describe('flaps', () => {
  it('shows UP with ▲ disabled, and ▼ sends flaps down', async () => {
    await render(tree(FlightSection, snapshot()));
    expect(screen.getByText('UP')).toBeTruthy();
    expect(screen.getByLabelText('Flaps up')).toBeTruthy();
    expect(button('Flaps up one notch')).toBeDisabled();
    await fireEvent.press(button('Flaps down one notch'));
    expect(activate).toHaveBeenCalledWith(FEATURE_FLAPS, FLAPS.down);
  });

  it('shows the detent and MOVING while the flaps lag the handle', async () => {
    await render(
      tree(FlightSection, snapshot({ values: { [FLAPS.handle]: 2 / 3, [FLAPS.position]: 0.3 } })),
    );
    expect(screen.getByText('2 of 3')).toBeTruthy();
    expect(screen.getByText('MOVING')).toBeTruthy();
    expect(button('Flaps up one notch')).toBeEnabled();
    expect(button('Flaps down one notch')).toBeEnabled();
  });

  it('disables ▼ at FULL', async () => {
    await render(
      tree(FlightSection, snapshot({ values: { [FLAPS.handle]: 1, [FLAPS.position]: 1 } })),
    );
    expect(screen.getByText('FULL')).toBeTruthy();
    expect(screen.queryByText('MOVING')).toBeNull();
    expect(button('Flaps down one notch')).toBeDisabled();
  });

  it('says so when the handle did not move', async () => {
    const { rerender } = await render(tree(FlightSection, snapshot()));
    await fireEvent.press(button('Flaps down one notch'));
    await rerender(tree(FlightSection, snapshot({ operations: accepted(FLAPS.down) }), NOW + 3000));
    expect(screen.getByText("The Cessna 172 didn't move the flaps down.")).toBeTruthy();
  });
});

describe('trim', () => {
  it('holds the command while pressed and releases it on press-out', async () => {
    await render(tree(FlightSection, snapshot()));
    await fireEvent(button('Pitch trim nose up'), 'pressIn');
    expect(hold).toHaveBeenCalledWith(FEATURE_TRIM, PITCH.increase.command, 'press');
    await advance(300);
    await fireEvent(button('Pitch trim nose up'), 'pressOut');
    expect(hold).toHaveBeenLastCalledWith(FEATURE_TRIM, PITCH.increase.command, 'release');
    expect(activate).not.toHaveBeenCalled();
  });

  it('reads the trim in percent with its direction', async () => {
    await render(tree(FlightSection, snapshot({ values: { [PITCH.position]: 0.12 } })));
    expect(screen.getByText('12 % nose up')).toBeTruthy();
    expect(screen.getAllByText('centred')).toHaveLength(2);
    expect(screen.getByTestId('trim-pitch-takeoff', HIDDEN)).toBeTruthy();
  });

  it('sets takeoff trim and watches it move toward the mark', async () => {
    const { rerender } = await render(tree(FlightSection, snapshot()));
    await fireEvent.press(button('Set takeoff trim'));
    expect(activate).toHaveBeenCalledWith(FEATURE_TRIM, PITCH.set.command);
    expect(button('Set takeoff trim')).toBeDisabled();
    await rerender(
      tree(FlightSection, snapshot({ operations: accepted(PITCH.set.command) }), NOW + 3000),
    );
    expect(screen.getByText("The Cessna 172 didn't set takeoff trim.")).toBeTruthy();
  });

  it('opens no watch when the trim already reads the takeoff value', async () => {
    const atTakeoff = { [PITCH.position]: 0.1 };
    const { rerender } = await render(tree(FlightSection, snapshot({ values: atTakeoff })));
    await fireEvent.press(button('Set takeoff trim'));
    expect(activate).toHaveBeenCalledWith(FEATURE_TRIM, PITCH.set.command);
    expect(button('Set takeoff trim')).toBeEnabled();
    await rerender(
      tree(
        FlightSection,
        snapshot({ values: { [PITCH.position]: 0.5 }, operations: accepted(PITCH.set.command) }),
        NOW + 3000,
      ),
    );
    expect(screen.queryByText("The Cessna 172 didn't set takeoff trim.")).toBeNull();
  });
});

describe('engines', () => {
  it('arms START with a tap, then holds the starter while pressed', async () => {
    await render(tree(EngineSection, snapshot()));
    expect(screen.getByLabelText('Engine 1 not running')).toBeTruthy();
    await fireEvent(button('Starter 1'), 'pressIn');
    expect(hold).not.toHaveBeenCalled();
    await fireEvent.press(button('Starter 1'));
    expect(button('HOLD TO START')).toBeTruthy();
    await fireEvent(button('HOLD TO START'), 'pressIn');
    expect(hold).toHaveBeenCalledWith(FEATURE_ENGINE_START, starterCommand(1), 'press');
    await advance(300);
    await fireEvent(button('HOLD TO START'), 'pressOut');
    expect(hold).toHaveBeenLastCalledWith(FEATURE_ENGINE_START, starterCommand(1), 'release');
  });

  it('lights START while the starter is engaged and RUN while the engine runs', async () => {
    const engaged = [1, ...new Array<number>(15).fill(0)];
    await render(
      tree(
        EngineSection,
        snapshot({ values: { [ENGINES.starter]: engaged, [ENGINES.running]: engaged } }),
      ),
    );
    expect(
      within(button('Starter 1, engaged')).getByTestId('light-bar-engaged', HIDDEN),
    ).toBeTruthy();
    expect(screen.getByLabelText('Engine 1 running')).toBeTruthy();
  });

  describe('magnetos', () => {
    it('selects BOTH for key 3 and takes two taps to change', async () => {
      await render(tree(EngineSection, snapshot()));
      expect(button('Magnetos 1 BOTH').props.accessibilityState).toMatchObject({ selected: true });
      expect(button('Magnetos 1 L').props.accessibilityState).toMatchObject({ selected: false });
      await fireEvent.press(button('Magnetos 1 L'));
      expect(activate).not.toHaveBeenCalled();
      await fireEvent.press(button('Tap again: L'));
      expect(activate).toHaveBeenCalledWith(
        FEATURE_ENGINE_START,
        magnetoPositions(1).find((position) => position.key === 'left')!.command,
      );
    });

    it('are absent for a turbine', async () => {
      const turbine = new Array<number>(16).fill(2);
      await render(tree(EngineSection, snapshot({ values: { [ENGINES.type]: turbine } })));
      expect(queryButton('Magnetos 1 BOTH')).toBeNull();
      expect(button('Starter 1')).toBeTruthy();
    });
  });

  describe('fuel selector', () => {
    it('takes two taps to select OFF', async () => {
      await render(tree(EngineSection, snapshot()));
      expect(button('Fuel selector BOTH').props.accessibilityState).toMatchObject({
        selected: true,
      });
      await fireEvent.press(button('Fuel selector OFF'));
      expect(activate).not.toHaveBeenCalled();
      await fireEvent.press(button('Tap again: OFF'));
      expect(activate).toHaveBeenCalledWith(FEATURE_FUEL, 'sim/fuel/fuel_selector_none');
    });

    it('selects LEFT with one tap', async () => {
      await render(tree(EngineSection, snapshot()));
      await fireEvent.press(button('Fuel selector LEFT'));
      expect(activate).toHaveBeenCalledWith(FEATURE_FUEL, 'sim/fuel/fuel_selector_lft');
    });

    it('omits BOTH when the aircraft has none, and the selector when it has none', async () => {
      const { rerender } = await render(
        tree(EngineSection, snapshot({ values: { [FUEL_SELECTOR.hasBoth]: 0 } })),
      );
      expect(queryButton('Fuel selector BOTH')).toBeNull();
      expect(button('Fuel selector LEFT')).toBeTruthy();
      await rerender(tree(EngineSection, snapshot({ values: { [FUEL_SELECTOR.hasSelector]: 0 } })));
      expect(queryButton('Fuel selector LEFT')).toBeNull();
      expect(screen.queryByText('FUEL')).toBeNull();
    });

    it('says so when the selector did not take', async () => {
      const { rerender } = await render(tree(EngineSection, snapshot()));
      await fireEvent.press(button('Fuel selector LEFT'));
      await rerender(
        tree(
          EngineSection,
          snapshot({ operations: accepted('sim/fuel/fuel_selector_lft') }),
          NOW + 3000,
        ),
      );
      expect(screen.getByText("The Cessna 172 didn't set the fuel selector to left.")).toBeTruthy();
    });
  });

  describe('engine count', () => {
    it('draws one unit per engine', async () => {
      await render(tree(EngineSection, snapshot({ values: { [ENGINES.count]: 2 } })));
      expect(screen.getByText('ENGINE 1')).toBeTruthy();
      expect(screen.getByText('ENGINE 2')).toBeTruthy();
      expect(button('Starter 2')).toBeTruthy();
    });

    it('draws four units and says the rest are not shown', async () => {
      await render(tree(EngineSection, snapshot({ values: { [ENGINES.count]: 6 } })));
      for (const engine of [1, 2, 3, 4]) {
        expect(screen.getByText(`ENGINE ${engine}`)).toBeTruthy();
      }
      expect(screen.queryByText('ENGINE 5')).toBeNull();
      expect(screen.getByText(ENGINES_NOT_SHOWN)).toBeTruthy();
    });

    it('draws one unit labelled ENGINE when the count is missing', async () => {
      await render(
        tree(
          EngineSection,
          snapshot({
            values: { [ENGINES.count]: undefined },
            bindings: { [ENGINES.count]: 'missing' },
          }),
        ),
      );
      expect(screen.getByText('ENGINE')).toBeTruthy();
      expect(screen.queryByText('ENGINE 1')).toBeNull();
      expect(button('Starter 1')).toBeTruthy();
    });
  });
});

describe('parking brake', () => {
  it('writes 0 to release it, and says so when X-Plane kept it set', async () => {
    const { rerender } = await render(tree(FlightSection, snapshot()));
    expect(
      within(button('Parking brake, set')).getByTestId('light-bar-engaged', HIDDEN),
    ).toBeTruthy();
    await fireEvent.press(button('Parking brake, set'));
    expect(write).toHaveBeenCalledWith(FEATURE_PARKING_BRAKE, PARKING_BRAKE.ratio, 0);
    await rerender(
      tree(FlightSection, snapshot({ operations: accepted(PARKING_BRAKE.ratio) }), NOW + 3000),
    );
    expect(screen.getByText("The Cessna 172 didn't release the parking brake.")).toBeTruthy();
  });

  it('is drawn disabled when the ratio is read-only', async () => {
    await render(
      tree(FlightSection, snapshot({ bindings: { [PARKING_BRAKE.ratio]: 'readOnly' } })),
    );
    expect(button('Parking brake, set')).toBeDisabled();
  });
});

describe('dimmers', () => {
  it('reads the brightness and steps it up', async () => {
    await render(tree(LightsSection, snapshot()));
    expect(screen.getAllByText('50 %')).toHaveLength(2);
    await fireEvent.press(button('Panel lights brighter'));
    expect(activate).toHaveBeenCalledWith(FEATURE_LIGHTS_INTERIOR, DIMMERS[0]!.up);
  });

  it('disables ▼ at zero', async () => {
    await render(tree(LightsSection, snapshot({ values: { [DIMMERS[0]!.state]: [0, 0, 0, 0] } })));
    expect(screen.getByText('0 %')).toBeTruthy();
    expect(button('Panel lights dimmer')).toBeDisabled();
    expect(button('Panel lights brighter')).toBeEnabled();
  });
});

describe('stale values', () => {
  const sections: [string, Section][] = [
    ['engine', EngineSection],
    ['lights', LightsSection],
    ['flight', FlightSection],
    ['ice', IceSection],
  ];

  it.each(sections)('disables every %s key and dims every lit bar', async (_name, section) => {
    await render(
      tree(
        section,
        snapshot({ stale: true, values: { [BEACON.state]: 1, [PARKING_BRAKE.ratio]: 1 } }),
      ),
    );
    const keys = screen.getAllByRole('button');
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key).toBeDisabled();
    }
    for (const bar of screen.queryAllByTestId('light-bar-engaged', HIDDEN)) {
      expect(StyleSheet.flatten(bar.props.style).backgroundColor).toBe(
        lightTheme.avionics.legendDim,
      );
    }
  });

  it('keeps an on switch engaged, dimmed', async () => {
    await render(tree(LightsSection, snapshot({ stale: true, values: { [BEACON.state]: 1 } })));
    const bar = within(button('Beacon, on')).getByTestId('light-bar-engaged', HIDDEN);
    expect(StyleSheet.flatten(bar.props.style).backgroundColor).toBe(lightTheme.avionics.legendDim);
  });
});
