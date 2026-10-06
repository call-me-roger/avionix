import { fireEvent, render, screen, within } from '@testing-library/react-native';
import React from 'react';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { type SettingsStorage, createMemorySettingsStorage } from '@/application/settings-store';
import { deriveAvailability } from '@/domain/aircraft/availability';
import {
  GENERIC_COMMANDS as C,
  GENERIC_DATAREFS as D,
  GENERIC_PROFILE,
} from '@/domain/aircraft/profiles/generic';
import { NavControls } from '@/features/panels/navigation/NavControls';
import { useCourseEntry } from '@/features/panels/navigation/useCourseEntry';
import { PanelScope } from '@/features/panels/primitives/PanelFrame';
import { useReadBack } from '@/features/panels/primitives/useReadBack';
import { UnitsProvider } from '@/features/units/UnitsProvider';
import { ThemeProvider } from '@/theme/theme-context';

const NOW = 1_000_000;
const base = initialSnapshot(GENERIC_PROFILE, 5);

type Status = 'ok' | 'missing' | 'readOnly';

function telemetry(values: Record<string, number>, receivedAt = NOW) {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, { value, receivedAt }]),
  );
}

/** NAV1 on course 270, a valid TO on the deviation, no CTR step taken. */
const VALUES: Record<string, number> = {
  [D.heading]: 270,
  [D.hsiSource]: 0,
  [D.hsiCourse]: 270,
  [D.hsiHdef]: 0.8,
  [D.hsiFromTo]: 1,
  [D.hsiHorizontal]: 1,
  [D.hsiVdef]: 0,
  [D.hsiVertical]: 0,
  [D.hsiGsFlag]: 0,
};

/** Every binding NavControls reads, 'ok' unless overridden, fed through the real deriver so the
 * feature statuses (and their reasons) are exactly what the app would compute. */
function bindingResults(overrides: Partial<Record<string, Status>> = {}) {
  const names: Record<string, 'dataref' | 'command'> = {
    [D.hsiSource]: 'dataref',
    [D.hsiCourse]: 'dataref',
    [C.hsiDirect]: 'command',
    [D.hsiHdef]: 'dataref',
    [D.hsiFromTo]: 'dataref',
    [D.hsiHorizontal]: 'dataref',
    [D.hsiVdef]: 'dataref',
    [D.hsiVertical]: 'dataref',
    [D.hsiGsFlag]: 'dataref',
  };
  const results: Record<string, { name: string; kind: 'dataref' | 'command'; status: Status }> = {};
  for (const [name, kind] of Object.entries(names)) {
    results[name] = { name, kind, status: overrides[name] ?? 'ok' };
  }
  return results;
}

function compatibilityFor(overrides: Partial<Record<string, Status>> = {}) {
  const bindings = bindingResults(overrides);
  return {
    ...base.compatibility,
    bindings,
    features: deriveAvailability(GENERIC_PROFILE, bindings),
  };
}

const ok = (name: string) => ({
  [name]: { status: 'ok' as const, failure: null, refusal: null, at: NOW },
});

function live(
  values: Record<string, number> = {},
  overrides: Partial<SessionSnapshot> = {},
): SessionSnapshot {
  return {
    ...base,
    state: 'connected',
    health: { ...base.health, activity: 'running', live: true, lastHeartbeatAt: NOW },
    telemetry: telemetry({ ...VALUES, ...values }),
    compatibility: compatibilityFor(),
    ...overrides,
  };
}

function liveWithBindings(bindingOverrides: Partial<Record<string, Status>>): SessionSnapshot {
  return { ...live(), compatibility: compatibilityFor(bindingOverrides) };
}

const actions = { write: jest.fn(async () => undefined), activate: jest.fn(async () => undefined) };

function Harness() {
  const readBack = useReadBack();
  const entry = useCourseEntry();
  return <NavControls readBack={readBack} entry={entry} />;
}

function tree(
  snapshot: SessionSnapshot,
  now = NOW,
  storage: SettingsStorage = createMemorySettingsStorage(),
) {
  return (
    <ThemeProvider storage={storage} systemSchemeOverride="light">
      <UnitsProvider storage={storage}>
        <PanelScope snapshot={snapshot} now={now} actions={actions}>
          <Harness />
        </PanelScope>
      </UnitsProvider>
    </ThemeProvider>
  );
}

beforeEach(() => {
  (actions.write as jest.Mock).mockClear();
  (actions.activate as jest.Mock).mockClear();
});

const type = async (keys: string) => {
  for (const key of keys) {
    await fireEvent.press(screen.getByLabelText(key));
  }
};

describe('NAV control unit', () => {
  it('shows NAV1 selected and the course in the CRS window', async () => {
    await render(tree(live()));
    expect(screen.getByLabelText('NAV1').props.accessibilityState.selected).toBe(true);
    const enter = screen.getByLabelText('Enter course');
    expect(within(enter).getByText('CRS')).toBeTruthy();
    expect(within(enter).getByText('270°')).toBeTruthy();
  });

  it('writes the pressed source and watches it, disabling every key while it waits', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('NAV2'));
    expect(actions.write).toHaveBeenCalledWith('nav-source', D.hsiSource, 1);
    expect(screen.getByLabelText('NAV1').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText('NAV2').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText('GPS').props.accessibilityState.disabled).toBe(true);
  });

  it('says when X-Plane did not switch the HSI source', async () => {
    const view = await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('NAV2'));
    await view.rerender(tree(live({}, { operations: ok(D.hsiSource) }), NOW + 4000));
    expect(screen.getByText('X-Plane did not switch the HSI to NAV2.')).toBeTruthy();
  });

  it('shows SRC GPS2 with no key lit when the source is 3', async () => {
    await render(tree(live({ [D.hsiSource]: 3 })));
    expect(screen.getByText('SRC GPS2')).toBeTruthy();
    expect(screen.getByLabelText('NAV1').props.accessibilityState.selected).toBe(false);
    expect(screen.getByLabelText('NAV2').props.accessibilityState.selected).toBe(false);
    expect(screen.getByLabelText('GPS').props.accessibilityState.selected).toBe(false);
  });

  it('adds up three quick +1 taps on the course', async () => {
    await render(tree(live()));
    for (let i = 0; i < 3; i += 1) {
      await fireEvent.press(screen.getByLabelText('Course plus 1 degree'));
    }
    expect((actions.write as jest.Mock).mock.calls.map((call) => call[2])).toEqual([271, 272, 273]);
  });

  it('steps the course down from 0, shown as 360°', async () => {
    await render(tree(live({ [D.hsiCourse]: 0 })));
    expect(within(screen.getByLabelText('Enter course')).getByText('360°')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Course minus 1 degree'));
    expect(actions.write).toHaveBeenCalledWith('nav-course', D.hsiCourse, 359);
  });

  it('types 360 and Set sends 0', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter course'));
    await type('360');
    await fireEvent.press(screen.getByLabelText('Set course'));
    expect(actions.write).toHaveBeenCalledWith('nav-course', D.hsiCourse, 0);
  });

  it('refuses a typed 400 with the existing range sentence', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter course'));
    await type('400');
    expect(screen.getByText('Heading runs from 0 to 360.')).toBeTruthy();
    expect(screen.getByLabelText('Set course').props.accessibilityState.disabled).toBe(true);
  });

  it('says when X-Plane did not take the typed course', async () => {
    const view = await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Course plus 1 degree'));
    await view.rerender(tree(live({}, { operations: ok(D.hsiCourse) }), NOW + 4000));
    expect(
      screen.getByText('X-Plane did not take course 271°. The course still shows 270°.'),
    ).toBeTruthy();
  });

  it('disables CTR without a from/to flag, and activates hsiDirect once one is present', async () => {
    const view = await render(tree(live({ [D.hsiFromTo]: 0 })));
    expect(screen.getByLabelText('Centre on station').props.accessibilityState.disabled).toBe(true);
    await view.rerender(tree(live({ [D.hsiFromTo]: 1 })));
    await fireEvent.press(screen.getByLabelText('Centre on station'));
    expect(actions.activate).toHaveBeenCalledWith('nav-course', C.hsiDirect);
  });

  it('hides CTR when the aircraft lacks obs_HSI_direct', async () => {
    await render(tree(liveWithBindings({ [C.hsiDirect]: 'missing' })));
    expect(screen.queryByLabelText('Centre on station')).toBeNull();
  });

  it('disables the source keys with a reason when hsiSource is read-only', async () => {
    await render(tree(liveWithBindings({ [D.hsiSource]: 'readOnly' })));
    expect(screen.getByLabelText('NAV1').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText(/HSI source is not available on this aircraft/)).toBeTruthy();
  });

  it('disables the course window and steppers with a reason when hsiCourse is missing', async () => {
    await render(tree(liveWithBindings({ [D.hsiCourse]: 'missing' })));
    expect(screen.getByLabelText('Enter course').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText('Course plus 1 degree').props.accessibilityState.disabled).toBe(
      true,
    );
    expect(screen.getByText(/HSI course is not available on this aircraft/)).toBeTruthy();
  });
});
