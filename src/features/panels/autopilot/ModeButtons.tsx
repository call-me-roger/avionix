import React from 'react';
import { View } from 'react-native';

import { modeNotTaken, modeState } from '@/domain/autopilot/modes';
import { MODES, type ModeSpec, autopilotNumber } from '@/features/panels/autopilot/autopilot';
import { firstNumber } from '@/features/panels/instruments/useInstrumentValues';
import { ControlButton } from '@/features/panels/primitives/ControlButton';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import type { ReadBack } from '@/features/panels/primitives/useReadBack';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  row: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: theme.spacing.sm },
});

/** Lateral modes on the first row, vertical on the second, as on most autopilot heads. */
const ROWS: readonly (readonly string[])[] = [
  ['hdg', 'nav', 'apr'],
  ['alt', 'vs', 'flc'],
];

/**
 * Each mode's state comes only from X-Plane's status (R5): ● engaged, ○ armed, plain off — told
 * apart by shape and in the spoken label, never by colour alone (R2). A press sends X-Plane's own
 * command for the mode; adoption is any change from the state shown at the press.
 */
export function ModeButtons({ readBack, blocked }: { readBack: ReadBack; blocked: boolean }) {
  const { snapshot, activate } = usePanel();
  const styles = useThemedStyles(makeStyles);

  const button = (spec: ModeSpec) => {
    const state = modeState(autopilotNumber(snapshot, spec.status));
    return (
      <ControlButton
        key={spec.key}
        label={state === 'armed' ? `○ ${spec.label}` : spec.label}
        accessibilityLabel={`${spec.label} mode, ${state}`}
        featureId={spec.featureId}
        target={spec.command}
        selected={state === 'engaged'}
        invalid={blocked}
        onPress={() => {
          void activate(spec.featureId, spec.command);
          readBack.watch({
            key: `mode-${spec.key}`,
            name: spec.status,
            operation: spec.command,
            expected: state === 'off' ? 1 : 0,
            matches: (value) => modeState(firstNumber(value)) !== state,
            failure: () => modeNotTaken(spec.label, state === 'off', spec.needsSource),
          });
        }}
      />
    );
  };

  return (
    <View>
      {ROWS.map((row) => (
        <View key={row.join()} style={styles.row}>
          {row.map((key) => {
            const spec = MODES.find((mode) => mode.key === key);
            return spec === undefined ? null : button(spec);
          })}
        </View>
      ))}
      {MODES.map((spec) => {
        const message = readBack.messageFor(`mode-${spec.key}`);
        return message === null ? null : (
          <BodyText key={spec.key} tone="danger">
            {message}
          </BodyText>
        );
      })}
    </View>
  );
}
