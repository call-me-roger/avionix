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
  rowPhone: { flexDirection: 'row' as const, gap: theme.touch.spacing },
  rowWide: { flexDirection: 'row' as const, gap: theme.spacing.sm },
  flex1: { flex: 1 },
});

type ModeGroup = 'lateral' | 'vertical';

/**
 * Lateral modes on the left/top, vertical on the right/bottom, as on most autopilot heads. Each
 * group carries its own `testID`, so the panel can place the engage keys between them for the
 * GMC-507 wide layout (spec section 6) while the phone layout still stacks engage, lateral, vertical.
 */
const GROUPS: Readonly<Record<ModeGroup, { testID: string; keys: readonly string[] }>> = {
  lateral: { testID: 'ap-row-lateral', keys: ['hdg', 'nav', 'apr'] },
  vertical: { testID: 'ap-row-vertical', keys: ['alt', 'vs', 'flc'] },
};

/**
 * Each mode's state comes only from X-Plane's status (R5): the light bar's shape (engaged, armed,
 * off) and the spoken label carry it, never colour alone (R2). A press sends X-Plane's own command
 * for the mode; adoption is any change from the state shown at the press.
 *
 * Without `group`, both groups render stacked (the phone layout). With `group`, only that one
 * renders, so the panel can interleave the engage keys between them when wide.
 */
export function ModeButtons({
  readBack,
  blocked,
  layout = 'phone',
  group,
}: {
  readBack: ReadBack;
  blocked: boolean;
  layout?: 'phone' | 'wide';
  group?: ModeGroup;
}) {
  const { snapshot, activate } = usePanel();
  const styles = useThemedStyles(makeStyles);
  const rowStyle = layout === 'phone' ? styles.rowPhone : styles.rowWide;

  const button = (spec: ModeSpec) => {
    const state = modeState(autopilotNumber(snapshot, spec.status));
    return (
      <ControlButton
        key={spec.key}
        label={spec.label}
        accessibilityLabel={`${spec.label} mode, ${state}`}
        featureId={spec.featureId}
        target={spec.command}
        selected={state === 'engaged'}
        annunciation={state}
        style={layout === 'phone' ? styles.flex1 : undefined}
        invalid={blocked || readBack.pendingExpected(`mode-${spec.key}`) !== null}
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

  const groups: readonly ModeGroup[] = group === undefined ? ['lateral', 'vertical'] : [group];

  return (
    <View>
      {groups.map((name) => {
        const { testID, keys } = GROUPS[name];
        return (
          <View key={name}>
            <View testID={testID} style={rowStyle}>
              {keys.map((key) => {
                const spec = MODES.find((mode) => mode.key === key);
                return spec === undefined ? null : button(spec);
              })}
            </View>
            {keys.map((key) => {
              const message = readBack.messageFor(`mode-${key}`);
              return message === null ? null : (
                <BodyText key={key} tone="danger">
                  {message}
                </BodyText>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}
