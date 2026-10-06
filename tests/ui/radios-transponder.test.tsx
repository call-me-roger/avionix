import { fireEvent, render, screen, within } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import { type SessionSnapshot, initialSnapshot } from '@/application/session-snapshot';
import { type SettingsStorage, createMemorySettingsStorage } from '@/application/settings-store';
import {
  GENERIC_COMMANDS as C,
  GENERIC_DATAREFS as D,
  GENERIC_PROFILE,
} from '@/domain/aircraft/profiles/generic';
import type { PanelActions } from '@/features/panels/primitives/PanelContext';
import { PanelFrame } from '@/features/panels/primitives/PanelFrame';
import { RadiosPanel } from '@/features/panels/radios/RadiosPanel';
import { UnitsProvider } from '@/features/units/UnitsProvider';
import { ThemeProvider } from '@/theme/theme-context';
import { lightTheme } from '@/theme/tokens';

// LightBar is hidden from accessibility (the mode button's own label already speaks its state).
const HIDDEN = { includeHiddenElements: true };

const NOW = 1_000_000;
const base = initialSnapshot(GENERIC_PROFILE, 5);

function telemetry(values: Record<string, number | number[] | string>, receivedAt = NOW) {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, { value, receivedAt }]),
  );
}

const VALUES = {
  [D.com1Active]: 121_500,
  [D.com1Standby]: 118_005,
  [D.com2Active]: 118_000,
  [D.com2Standby]: 124_850,
  [D.nav1Active]: 11_030,
  [D.nav1Standby]: 10_850,
  [D.nav2Active]: 11_390,
  [D.nav2Standby]: 11_720,
  [D.nav1Id]: 'SUJPUwAAAAA=',
  [D.nav1HasDme]: 1,
  [D.nav1Dme]: 12.4,
  [D.nav1Course]: 247,
  [D.transponderCode]: 7000,
  [D.transponderMode]: 3,
  [D.atcAssignedCode]: 4521,
  [D.transponderIdenting]: 0,
};

function live(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    ...base,
    state: 'connected',
    health: { ...base.health, activity: 'running', live: true, lastHeartbeatAt: NOW },
    telemetry: telemetry(VALUES),
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

const actions: PanelActions = {
  write: jest.fn(async () => undefined),
  activate: jest.fn(async () => undefined),
};

function tree(
  snapshot: SessionSnapshot,
  now = NOW,
  storage: SettingsStorage = createMemorySettingsStorage(),
) {
  return (
    <ThemeProvider storage={storage} systemSchemeOverride="light">
      <UnitsProvider storage={storage}>
        <PanelFrame title="Radios" snapshot={snapshot} now={now} actions={actions}>
          <RadiosPanel />
        </PanelFrame>
      </UnitsProvider>
    </ThemeProvider>
  );
}

beforeEach(() => {
  (actions.write as jest.Mock).mockClear();
  (actions.activate as jest.Mock).mockClear();
});

describe('Radios transponder', () => {
  it('shows the code and mode X-Plane reports', async () => {
    await render(tree(live()));
    expect(screen.getByLabelText('Transponder: squawk 7000, mode ALT')).toBeTruthy();
    expect(within(screen.getByTestId('xpdr-code')).getByText('7000')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Transponder altitude' }).props.accessibilityState,
    ).toMatchObject({ selected: true });
    expect(
      screen.getByRole('button', { name: 'Transponder standby' }).props.accessibilityState,
    ).toMatchObject({ selected: false });
  });

  it('shows the engaged light bar on the selected mode and the off bar on the others', async () => {
    await render(tree(live()));
    expect(
      within(screen.getByRole('button', { name: 'Transponder altitude' })).getByTestId(
        'light-bar-engaged',
        HIDDEN,
      ),
    ).toBeTruthy();
    for (const name of ['off', 'standby', 'on']) {
      expect(
        within(screen.getByRole('button', { name: `Transponder ${name}` })).getByTestId(
          'light-bar-off',
          HIDDEN,
        ),
      ).toBeTruthy();
    }
  });

  it('draws an emergency squawk in the warning colour, with EMERG in the caption', async () => {
    await render(tree(live({ telemetry: telemetry({ ...VALUES, [D.transponderCode]: 7700 }) })));
    const codeWindow = screen.getByTestId('xpdr-code');
    expect(within(codeWindow).getByText('7700')).toHaveStyle({
      color: lightTheme.avionics.warning,
    });
    expect(within(codeWindow).getByText(/EMERG/)).toBeTruthy();
  });

  it('writes the selected mode and checks it', async () => {
    const view = await render(tree(live()));
    await fireEvent.press(screen.getByRole('button', { name: 'Transponder standby' }));
    expect(actions.write).toHaveBeenCalledWith('transponder-mode', D.transponderMode, 1);
    const ok = {
      [D.transponderMode]: { status: 'ok' as const, failure: null, refusal: null, at: NOW },
    };
    await view.rerender(tree(live({ operations: ok }), NOW + 4000));
    expect(screen.getByText('X-Plane did not change the transponder to STBY.')).toBeTruthy();
  });

  it('names a reported mode the panel does not offer, with no position selected', async () => {
    await render(tree(live({ telemetry: telemetry({ ...VALUES, [D.transponderMode]: 7 }) })));
    expect(screen.getByLabelText('Transponder: squawk 7000, mode TA/RA')).toBeTruthy();
    for (const name of ['off', 'standby', 'on', 'altitude']) {
      expect(
        screen.getByRole('button', { name: `Transponder ${name}` }).props.accessibilityState,
      ).toMatchObject({ selected: false });
    }
  });

  it('shows a dash for a code that is not a squawk', async () => {
    await render(tree(live({ telemetry: telemetry({ ...VALUES, [D.transponderCode]: 8000 }) })));
    expect(screen.getByLabelText('Transponder: squawk —, mode ALT')).toBeTruthy();
  });

  it('enters a code on a 0–7 keypad and sends it', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter squawk code'));
    expect(screen.queryByLabelText('8')).toBeNull();
    expect(screen.queryByLabelText('9')).toBeNull();
    for (const key of ['0', '4', '0', '0']) {
      await fireEvent.press(screen.getByLabelText(key));
    }
    await fireEvent.press(screen.getByLabelText('Set Squawk code'));
    expect(actions.write).toHaveBeenCalledWith('transponder-code', D.transponderCode, 400);
  });

  it('never lets a lone key (Clear) stretch wider than one column (M4)', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter squawk code'));
    const style = StyleSheet.flatten(screen.getByLabelText('Clear').props.style);
    expect(style.flexGrow).toBeFalsy();
  });

  it('says when X-Plane did not take the squawk code', async () => {
    const view = await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter squawk code'));
    for (const key of ['0', '4', '0', '0']) {
      await fireEvent.press(screen.getByLabelText(key));
    }
    await fireEvent.press(screen.getByLabelText('Set Squawk code'));
    const ok = {
      [D.transponderCode]: { status: 'ok' as const, failure: null, refusal: null, at: NOW },
    };
    await view.rerender(tree(live({ operations: ok }), NOW + 4000));
    expect(screen.getByText('X-Plane did not take squawk 0400.')).toBeTruthy();
  });

  it('prints a failed squawk Set once, not twice, while the entry is open (M2)', async () => {
    const view = await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter squawk code'));
    for (const key of ['0', '4', '0', '0']) {
      await fireEvent.press(screen.getByLabelText(key));
    }
    await fireEvent.press(screen.getByLabelText('Set Squawk code'));
    const failed = {
      [D.transponderCode]: {
        status: 'failed' as const,
        failure: null,
        refusal: 'notConnected' as const,
        at: NOW,
      },
    };
    await view.rerender(tree(live({ operations: failed })));
    expect(screen.getAllByText('Not sent: Avionix is not connected to X-Plane.')).toHaveLength(1);
  });

  it('asks for four digits', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter squawk code'));
    await fireEvent.press(screen.getByLabelText('7'));
    expect(screen.getByText('Enter four digits.')).toBeTruthy();
    expect(screen.getByLabelText('Set Squawk code').props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  it('needs a second tap for an emergency code, and names it', async () => {
    await render(tree(live()));
    await fireEvent.press(screen.getByLabelText('Enter squawk code'));
    for (const key of ['7', '7', '0', '0']) {
      await fireEvent.press(screen.getByLabelText(key));
    }
    expect(screen.getByText('7700 — emergency')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Set Squawk code'));
    expect(actions.write).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Tap again: Set'));
    expect(actions.write).toHaveBeenCalledWith('transponder-code', D.transponderCode, 7700);
  });

  it('IDENT activates the command and says it was sent, and the IDENT annunciation follows X-Plane', async () => {
    const view = await render(tree(live()));
    await fireEvent.press(screen.getByRole('button', { name: 'IDENT' }));
    expect(actions.activate).toHaveBeenCalledWith('transponder-ident', C.transponderIdent);
    const ok = {
      [C.transponderIdent]: { status: 'ok' as const, failure: null, refusal: null, at: NOW },
    };
    await view.rerender(tree(live({ operations: ok }), NOW + 1000));
    expect(screen.getByText('IDENT sent')).toBeTruthy();
    expect(screen.queryByTestId('xpdr-ident')).toBeNull();
    await view.rerender(tree(live({ operations: ok }), NOW + 6000));
    expect(screen.queryByText('IDENT sent')).toBeNull();
    await view.rerender(
      tree(live({ telemetry: telemetry({ ...VALUES, [D.transponderIdenting]: 1 }) })),
    );
    expect(screen.getByTestId('xpdr-ident')).toHaveTextContent('IDENT');
    expect(screen.getByTestId('xpdr-ident')).toHaveStyle({ color: lightTheme.avionics.engaged });
  });

  it('shows the ATC-assigned code, and offers to squawk it when it differs', async () => {
    await render(tree(live()));
    expect(screen.getByText('ATC assigned 4521 — not set')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Squawk 4521' }));
    expect(actions.write).toHaveBeenCalledWith('transponder-code', D.transponderCode, 4521);
  });

  it('confirms a matching assigned code', async () => {
    await render(tree(live({ telemetry: telemetry({ ...VALUES, [D.transponderCode]: 4521 }) })));
    expect(screen.getByText('ATC assigned 4521 ✓')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Squawk 4521' })).toBeNull();
  });

  it('leaves the comparison out, silently, when there is no assigned code', async () => {
    const withoutAssigned: Record<string, number | number[] | string> = { ...VALUES };
    delete withoutAssigned[D.atcAssignedCode];
    for (const values of [
      withoutAssigned,
      { ...VALUES, [D.atcAssignedCode]: 0 },
      { ...VALUES, [D.atcAssignedCode]: 9999 },
    ]) {
      const view = await render(tree(live({ telemetry: telemetry(values) })));
      expect(screen.queryByText(/ATC assigned/)).toBeNull();
      await view.unmount();
    }
  });
});
