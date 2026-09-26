import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { featureOf } from '@/application/compatibility';
import type { OperationOutcome, OperationRefusal } from '@/application/session-snapshot';
import { controlAvailability } from '@/domain/panels/control-availability';
import { FailureNotice } from '@/features/health/FailureNotice';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

/** A disruptive control's second press must land within this window (spec decision 10). */
export const CONFIRM_WINDOW_MS = 3000;

export const REFUSAL_LABEL: Record<OperationRefusal, string> = {
  notConnected: 'Not sent: Avionix is not connected to X-Plane.',
  unavailable: 'Not sent: this control is not available on this aircraft.',
};

const makeStyles = (theme: Theme) => ({
  wrap: { gap: theme.spacing.xs, marginVertical: theme.touch.spacing / 2 },
  button: {
    minHeight: theme.touch.minTarget,
    minWidth: theme.touch.minTarget,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  disabled: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
  armed: { borderColor: theme.colors.danger },
  label: {
    color: theme.colors.onPrimary,
    fontSize: theme.typography.titleSize,
    fontWeight: 'bold' as const,
  },
  labelDisabled: { color: theme.colors.textMuted },
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
}

/** The only way a panel renders a pressable control: it applies every framework rule at once. */
export function ControlButton(props: Props) {
  const { snapshot, link } = usePanel();
  const styles = useThemedStyles(makeStyles);
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

  const shown = armed ? `Tap again: ${props.label}` : props.label;
  const accessibleName = armed ? shown : (props.accessibilityLabel ?? props.label);
  const onPress = () => {
    if (props.confirm === true && !armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    props.onPress();
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibleName}
        accessibilityState={{ disabled: !enabled, busy: pending }}
        disabled={!enabled}
        onPress={onPress}
        style={[styles.button, enabled ? null : styles.disabled, armed ? styles.armed : null]}
      >
        <Text style={[styles.label, enabled ? null : styles.labelDisabled]}>{shown}</Text>
      </Pressable>
      {availability.reason === null ? null : <BodyText muted>{availability.reason}</BodyText>}
      <Outcome outcome={outcome} />
    </View>
  );
}

/** Failures reach the screen only through FailureNotice (R11); refusals in fixed words. */
function Outcome({ outcome }: { outcome: OperationOutcome | undefined }) {
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
