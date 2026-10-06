import React from 'react';
import { View } from 'react-native';

import {
  FEATURE_AUTOPILOT,
  FEATURE_AUTOTHROTTLE,
  FEATURE_FLIGHT_DIRECTOR,
  GENERIC_COMMANDS as C,
  GENERIC_DATAREFS as D,
} from '@/domain/aircraft/profiles/generic';
import { autothrottleArmed, autothrottleEngaged } from '@/domain/autopilot/modes';
import type { DataRefValue } from '@/domain/simulator/types';
import { autopilotNumber } from '@/features/panels/autopilot/autopilot';
import { firstNumber } from '@/features/panels/instruments/useInstrumentValues';
import { ControlButton, OperationNotice } from '@/features/panels/primitives/ControlButton';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import type { ReadBack } from '@/features/panels/primitives/useReadBack';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  rowPhone: { flexDirection: 'row' as const, gap: theme.touch.spacing },
  rowWide: { flexDirection: 'row' as const, gap: theme.spacing.sm },
  flex1: { flex: 1 },
});

const KEYS = ['ap', 'fd', 'at-arm', 'at'] as const;

interface Press {
  featureId: string;
  command: string;
  key: (typeof KEYS)[number];
  name: string;
  expected: number;
  matches?: (value: DataRefValue | undefined) => boolean;
  sentence: string;
}

/**
 * AP, FD, A/T ARM and A/T. Every press sends the command for the state it asks for, never a
 * toggle, so a stale display can never flip the wrong way; the disconnect is one tap.
 *
 * `layout` 'phone' (the default) stretches each key to fill the row equally; 'wide' sizes keys to
 * their content, for the GMC-507 layout's centre group.
 */
export function EngageRow({
  readBack,
  blocked,
  layout = 'phone',
}: {
  readBack: ReadBack;
  blocked: boolean;
  layout?: 'phone' | 'wide';
}) {
  const { snapshot, activate } = usePanel();
  const styles = useThemedStyles(makeStyles);
  const read = (name: string) => autopilotNumber(snapshot, name);
  const apOn = read(D.autopilotServos) === 1;
  const fdOn = read(D.flightDirectorBars) === 1;
  const autothrottle = read(D.autothrottle);
  const armed = autothrottleArmed(autothrottle);
  const engaged = autothrottleEngaged(autothrottle);

  const press = (spec: Press) => {
    void activate(spec.featureId, spec.command);
    readBack.watch({
      key: spec.key,
      name: spec.name,
      operation: spec.command,
      expected: spec.expected,
      matches: spec.matches,
      failure: () => spec.sentence,
    });
  };
  const atValue = (value: DataRefValue | undefined) => firstNumber(value);

  const buttons = [
    {
      label: 'AP',
      accessibilityLabel: apOn ? 'Disconnect autopilot' : 'Engage autopilot',
      featureId: FEATURE_AUTOPILOT,
      selected: apOn,
      spec: {
        featureId: FEATURE_AUTOPILOT,
        command: apOn ? C.autopilotDisconnect : C.autopilotEngage,
        key: 'ap',
        name: D.autopilotServos,
        expected: apOn ? 0 : 1,
        sentence: apOn
          ? 'X-Plane did not disconnect the autopilot. Disconnect it in X-Plane.'
          : 'X-Plane did not engage the autopilot. Check that it has power.',
      },
    },
    {
      label: 'FD',
      accessibilityLabel: fdOn ? 'Turn flight director off' : 'Turn flight director on',
      featureId: FEATURE_FLIGHT_DIRECTOR,
      selected: fdOn,
      spec: {
        featureId: FEATURE_FLIGHT_DIRECTOR,
        command: fdOn ? C.flightDirectorOff : C.flightDirectorOn,
        key: 'fd',
        name: D.flightDirectorBars,
        expected: fdOn ? 0 : 1,
        sentence: `X-Plane did not turn the flight director ${fdOn ? 'off' : 'on'}.`,
      },
    },
    {
      label: 'A/T ARM',
      accessibilityLabel: armed ? 'Disarm autothrottle' : 'Arm autothrottle',
      featureId: FEATURE_AUTOTHROTTLE,
      selected: armed,
      spec: {
        featureId: FEATURE_AUTOTHROTTLE,
        command: armed ? C.autothrottleDisarm : C.autothrottleArm,
        key: 'at-arm',
        name: D.autothrottle,
        expected: armed ? -1 : 0,
        matches: armed
          ? (value: DataRefValue | undefined) => (atValue(value) ?? 0) < 0
          : (value: DataRefValue | undefined) => (atValue(value) ?? -1) >= 0,
        sentence: armed
          ? 'X-Plane did not disarm the autothrottle.'
          : 'X-Plane did not arm the autothrottle. This aircraft may not have one.',
      },
    },
    {
      label: 'A/T',
      accessibilityLabel: engaged ? 'Disengage autothrottle' : 'Engage autothrottle',
      featureId: FEATURE_AUTOTHROTTLE,
      selected: engaged,
      quiet: true,
      spec: {
        featureId: FEATURE_AUTOTHROTTLE,
        command: engaged ? C.autothrottleOff : C.autothrottleOn,
        key: 'at',
        name: D.autothrottle,
        expected: engaged ? 0 : 1,
        matches: engaged
          ? (value: DataRefValue | undefined) => (atValue(value) ?? 1) < 1
          : (value: DataRefValue | undefined) => (atValue(value) ?? 0) >= 1,
        sentence: engaged
          ? 'X-Plane did not disengage the autothrottle.'
          : 'X-Plane did not engage the autothrottle. This aircraft may not have one.',
      },
    },
  ] as const satisfies readonly {
    label: string;
    accessibilityLabel: string;
    featureId: string;
    selected: boolean;
    quiet?: boolean;
    spec: Press;
  }[];

  return (
    <View>
      <View testID="ap-row-engage" style={layout === 'phone' ? styles.rowPhone : styles.rowWide}>
        {buttons.map((button) => (
          <ControlButton
            key={button.label}
            label={button.label}
            accessibilityLabel={button.accessibilityLabel}
            featureId={button.featureId}
            target={button.spec.command}
            selected={button.selected}
            annunciation={button.selected ? 'engaged' : 'off'}
            quiet={'quiet' in button}
            invalid={blocked}
            style={layout === 'phone' ? styles.flex1 : undefined}
            onPress={() => press(button.spec)}
          />
        ))}
      </View>
      {/* A/T shares its feature with A/T ARM, which prints the reason; its outcome is its own. */}
      <OperationNotice target={engaged ? C.autothrottleOff : C.autothrottleOn} />
      {KEYS.map((key) => {
        const message = readBack.messageFor(key);
        return message === null ? null : (
          <BodyText key={key} tone="danger">
            {message}
          </BodyText>
        );
      })}
    </View>
  );
}
