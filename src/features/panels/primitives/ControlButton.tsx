import React, { useEffect, useState } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { featureOf } from '@/application/compatibility';
import type { OperationRefusal } from '@/application/session-snapshot';
import { controlAvailability } from '@/domain/panels/control-availability';
import { useHaptics } from '@/features/haptics/HapticsProvider';
import { FailureNotice } from '@/features/health/FailureNotice';
import { KeyEnabledContext } from '@/features/panels/primitives/KeyEnabledContext';
import { LightBar, type LightBarState } from '@/features/panels/primitives/LightBar';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';
import { avionicsText } from '@/theme/typography';

/** A disruptive control's second press must land within this window (spec decision 10). */
export const CONFIRM_WINDOW_MS = 3000;

export const REFUSAL_LABEL: Record<OperationRefusal, string> = {
  notConnected: 'Not sent: Avionix is not connected to X-Plane.',
  unavailable: 'Not sent: this control is not available on this aircraft.',
};

const makeStyles = (theme: Theme) => ({
  wrap: { gap: theme.spacing.xs, marginVertical: theme.touch.spacing / 2 },
  key: {
    backgroundColor: theme.avionics.keyFace,
    borderWidth: 1,
    borderColor: theme.avionics.bezelEdge,
    borderRadius: 6,
    minHeight: theme.touch.minTarget,
    minWidth: theme.touch.minTarget,
    paddingHorizontal: theme.spacing.md,
    paddingTop: 6,
    paddingBottom: 8,
    gap: 6,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  // Pressed is translated down 1 dp, a hardware key's own travel.
  pressed: { backgroundColor: theme.avionics.keyFacePressed, transform: [{ translateY: 1 }] },
  // Disabled is a transparent face, not a shade: told apart by shape, which the night palette's
  // dim colours cannot carry through colour alone.
  disabled: { backgroundColor: 'transparent' },
  armed: { borderWidth: 2, borderColor: theme.avionics.caution },
  legend: {
    ...avionicsText(theme, true),
    fontSize: theme.typography.legendSize,
    color: theme.avionics.legend,
  },
  legendDisabled: { color: theme.avionics.legendDim },
});

interface Props {
  label: string;
  /** The profile feature this control acts for; its availability gates the control (R8). */
  featureId: string;
  /** The binding name it writes or activates; its outcome is reported here (R9). */
  target: string;
  onPress: () => void;
  /** Two presses within CONFIRM_WINDOW_MS for disruptive controls. */
  confirm?: boolean;
  /** The panel's own input is not valid yet (e.g. an empty entry). */
  invalid?: boolean;
  accessibilityLabel?: string;
  /**
   * For a control whose sibling on the same target already shows the availability reason and the
   * outcome: without it, one read-only DataRef would print the same sentence under every button.
   */
  quiet?: boolean;
  /** One of a set of positions (a transponder mode): marked for sight and for screen readers. */
  selected?: boolean;
  /** The annunciator light bar above the legend; absent draws none. */
  annunciation?: LightBarState;
  /** Replaces the legend text when given (e.g. a display window made pressable). */
  children?: React.ReactNode;
  /** Applies to the outer wrap `View`, so a key can take `flex: 1` in a row. */
  style?: StyleProp<ViewStyle>;
}

/** The only way a panel renders a pressable control: it applies every framework rule at once. */
export function ControlButton(props: Props) {
  const { snapshot, link } = usePanel();
  const styles = useThemedStyles(makeStyles);
  const haptics = useHaptics();
  const availability = controlAvailability(featureOf(snapshot.compatibility, props.featureId));
  const outcome = snapshot.operations[props.target];
  const pending = outcome?.status === 'pending';
  const enabled = link.controlsEnabled && availability.usable && !pending && props.invalid !== true;

  const [armed, setArmed] = useState(false);
  if (armed && !enabled) {
    // Adjusting state while rendering is React's documented way to reset on a prop change; a
    // control that goes inert must not come back armed.
    setArmed(false);
  }
  useEffect(() => {
    if (!armed) {
      return;
    }
    const timer = setTimeout(() => setArmed(false), CONFIRM_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  const selectedAnnunciation: LightBarState | undefined =
    props.selected === undefined ? undefined : props.selected ? 'engaged' : 'off';
  const annunciation = props.annunciation ?? selectedAnnunciation;
  const shown = armed ? `Tap again: ${props.label}` : props.label;
  const accessibleName = armed ? shown : (props.accessibilityLabel ?? props.label);
  const onPress = () => {
    haptics.press();
    if (props.confirm === true && !armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    props.onPress();
  };
  const showLegend = armed || props.children === undefined;

  return (
    <View style={[styles.wrap, props.style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibleName}
        accessibilityState={{
          disabled: !enabled,
          busy: pending,
          selected: props.selected === true,
        }}
        disabled={!enabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.key,
          enabled ? null : styles.disabled,
          pressed ? styles.pressed : null,
          armed ? styles.armed : null,
        ]}
      >
        {annunciation === undefined ? null : <LightBar state={annunciation} />}
        <KeyEnabledContext.Provider value={enabled}>
          {showLegend ? (
            <Text style={[styles.legend, enabled ? null : styles.legendDisabled]}>{shown}</Text>
          ) : (
            props.children
          )}
        </KeyEnabledContext.Provider>
      </Pressable>
      {availability.reason === null || props.quiet === true ? null : (
        <BodyText muted>{availability.reason}</BodyText>
      )}
      {props.quiet === true ? null : <OperationNotice target={props.target} />}
    </View>
  );
}

/**
 * Failures reach the screen only through FailureNotice (R11); refusals in fixed words. Exported so
 * a row of quiet controls can print their target's outcome once.
 */
export function OperationNotice({ target }: { target: string }) {
  const { snapshot } = usePanel();
  const outcome = snapshot.operations[target];
  if (outcome === undefined || outcome.status !== 'failed') {
    return null;
  }
  if (outcome.failure !== null) {
    return <FailureNotice code={outcome.failure.code} step={outcome.failure.step} />;
  }
  return outcome.refusal === null ? null : (
    <BodyText tone="danger">{REFUSAL_LABEL[outcome.refusal]}</BodyText>
  );
}
