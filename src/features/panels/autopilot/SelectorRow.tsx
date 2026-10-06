import React from 'react';
import { Text, View } from 'react-native';

import { featureOf } from '@/application/compatibility';
import { GENERIC_COMMANDS as C, GENERIC_DATAREFS as D } from '@/domain/aircraft/profiles/generic';
import {
  SELECTOR_STEPS,
  formatSelector,
  selectorMatches,
  selectorNotTaken,
  stepLabel,
  stepSelector,
  stepSpoken,
} from '@/domain/autopilot/selectors';
import { controlAvailability } from '@/domain/panels/control-availability';
import {
  type SelectorSpec,
  autopilotNumber,
  selectorKind,
} from '@/features/panels/autopilot/autopilot';
import { firstNumber } from '@/features/panels/instruments/useInstrumentValues';
import { ControlButton, OperationNotice } from '@/features/panels/primitives/ControlButton';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import type { ReadBack } from '@/features/panels/primitives/useReadBack';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  wrap: { gap: theme.spacing.xs, paddingVertical: theme.spacing.sm },
  head: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    gap: theme.spacing.sm,
  },
  summary: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    gap: theme.spacing.sm,
    flexGrow: 1,
  },
  name: {
    color: theme.colors.text,
    fontSize: theme.typography.titleSize,
    fontWeight: 'bold' as const,
  },
  steppers: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: theme.spacing.sm },
});

/**
 * One selector: X-Plane's value (the button that opens the keypad), four steppers, and for the
 * airspeed X-Plane's knots/Mach switch. Each stepper press is one write (R3), computed from the
 * value the panel last sent while X-Plane has not shown it yet, so quick taps add up.
 */
export function SelectorRow({
  spec,
  readBack,
  blocked,
  onEnter,
  entry = null,
}: {
  spec: SelectorSpec;
  readBack: ReadBack;
  blocked: boolean;
  onEnter: () => void;
  /** The keypad, rendered under this row while this selector is being typed. */
  entry?: React.ReactNode;
}) {
  const { snapshot, link, write, activate } = usePanel();
  const styles = useThemedStyles(makeStyles);
  const isMach = autopilotNumber(snapshot, D.airspeedIsMach) === 1;
  const kind = selectorKind(spec.id, isMach);
  const current = autopilotNumber(snapshot, spec.name);
  const text = current === null ? '—' : formatSelector(kind, current);
  const availability = controlAvailability(featureOf(snapshot.compatibility, spec.featureId));
  const base = readBack.pendingExpected(spec.id) ?? current;
  const [small, large] = SELECTOR_STEPS[kind];
  const notLive = !link.valuesCurrent && current !== null;
  const showUnitSwitch =
    spec.id === 'speed' && snapshot.compatibility.bindings[C.knotsMachToggle]?.status !== 'missing';

  const send = (value: number) => {
    void write(spec.featureId, spec.name, value);
    readBack.watch({
      key: spec.id,
      name: spec.name,
      operation: spec.name,
      expected: value,
      matches: selectorMatches(kind, value),
      failure: (reported) => selectorNotTaken(kind, value, firstNumber(reported)),
    });
  };
  const switchUnit = () => {
    void activate(spec.featureId, C.knotsMachToggle);
    readBack.watch({
      key: 'speed-unit',
      name: D.airspeedIsMach,
      operation: C.knotsMachToggle,
      expected: isMach ? 0 : 1,
      failure: () =>
        `X-Plane did not switch the airspeed selector to ${isMach ? 'knots' : 'Mach'}.`,
    });
  };
  const message = readBack.messageFor(spec.id);
  const unitMessage = spec.id === 'speed' ? readBack.messageFor('speed-unit') : null;

  return (
    <View style={styles.wrap} testID={`selector-row-${spec.id}`}>
      <View style={styles.head}>
        <View
          style={styles.summary}
          accessible
          accessibilityLabel={`${spec.label} selector: ${text}${notLive ? ', not live' : ''}`}
        >
          <Text style={styles.name}>{spec.label}</Text>
          {notLive ? <BodyText muted>not live</BodyText> : null}
        </View>
        {/* The value mutes through this button's own disabled styling: the link disables every
            control whenever values are not current, so no separate stale style is needed here. */}
        <ControlButton
          label={text}
          accessibilityLabel={`Enter ${spec.label.toLowerCase()}`}
          featureId={spec.featureId}
          target={spec.name}
          quiet
          invalid={blocked}
          onPress={onEnter}
        />
        {showUnitSwitch ? (
          <ControlButton
            label={isMach ? 'Use knots' : 'Use Mach'}
            featureId={spec.featureId}
            target={C.knotsMachToggle}
            quiet
            invalid={blocked}
            onPress={switchUnit}
          />
        ) : null}
      </View>
      {entry}
      <View style={styles.steppers}>
        {[-large, -small, small, large].map((delta) => {
          const next = base === null ? null : stepSelector(kind, base, delta);
          return (
            <ControlButton
              key={delta}
              label={stepLabel(kind, delta)}
              accessibilityLabel={stepSpoken(spec.label, kind, delta)}
              featureId={spec.featureId}
              target={spec.name}
              quiet
              invalid={blocked || next === null}
              onPress={() => {
                if (next !== null) {
                  send(next);
                }
              }}
            />
          );
        })}
      </View>
      {availability.reason === null ? null : <BodyText muted>{availability.reason}</BodyText>}
      <OperationNotice target={spec.name} />
      {spec.id === 'speed' ? <OperationNotice target={C.knotsMachToggle} /> : null}
      {message === null ? null : <BodyText tone="danger">{message}</BodyText>}
      {unitMessage === null ? null : <BodyText tone="danger">{unitMessage}</BodyText>}
    </View>
  );
}
