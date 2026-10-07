import React, { useEffect, useRef, useState } from 'react';
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
  // `compact`: a key in a dense grid (the CDU) keeps its 48 dp minimum but gives its legend the width.
  compact: { paddingHorizontal: theme.spacing.xs },
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
  /** Presses queue in the panel (CDU keys): the target's pending outcome does not disable the key. */
  repeatable?: boolean;
  /** Replaces the legend text when given (e.g. a display window made pressable). */
  children?: React.ReactNode;
  /**
   * A key in a dense grid (the CDU's 5- and 6-key rows on a phone): narrow side padding, and a
   * legend that shrinks (to 70 % at most) to fit on its lines — two when it has a `\n`, else one —
   * instead of breaking a word mid-character. The 48 dp minimum is unchanged.
   */
  compact?: boolean;
  /** Applies to the outer wrap `View`, so a key can take `flex: 1` in a row. */
  style?: StyleProp<ViewStyle>;
  /**
   * A held key (trim, START): press-in starts the hold and press-out ends it; a screen reader's
   * activation (a press with no press-in) is a nudge, start then end. With `confirm`, the first
   * press arms the key and only an armed key can be held. `onPress` is not called.
   */
  hold?: {
    onStart: () => void;
    onEnd: () => void;
    /** Legend while armed (with `confirm`), e.g. 'HOLD TO START'. Default: "Tap again: <label>". */
    armedLegend?: string;
  };
}

/** The only way a panel renders a pressable control: it applies every framework rule at once. */
export function ControlButton(props: Props) {
  const { snapshot, link } = usePanel();
  const styles = useThemedStyles(makeStyles);
  const haptics = useHaptics();
  const availability = controlAvailability(featureOf(snapshot.compatibility, props.featureId));
  const outcome = snapshot.operations[props.target];
  const pending = outcome?.status === 'pending' && props.repeatable !== true;
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
  const shown = armed ? (props.hold?.armedLegend ?? `Tap again: ${props.label}`) : props.label;
  const accessibleName = armed ? shown : (props.accessibilityLabel ?? props.label);

  // Whether this press started a hold: `onPress` follows `onPressOut`, and must not nudge again.
  // Reset on every press-in: a touch the system cancels (a scroll takes it) ends with press-out
  // and no `onPress`, and must not swallow the next tap.
  const holdStarted = useRef(false);

  const onPressIn = () => {
    holdStarted.current = false;
    if (props.hold === undefined || !enabled) {
      return;
    }
    if (props.confirm === true && !armed) {
      return;
    }
    holdStarted.current = true;
    haptics.press();
    props.hold.onStart();
  };
  const onPressOut = () => {
    if (props.hold !== undefined && holdStarted.current) {
      props.hold.onEnd();
    }
  };
  const onPress = () => {
    if (props.hold !== undefined) {
      if (holdStarted.current) {
        // The hold already ran from press-in to press-out.
        holdStarted.current = false;
        setArmed(false);
        return;
      }
      haptics.press();
      if (props.confirm === true && !armed) {
        setArmed(true);
        return;
      }
      // A screen reader's activation fires only onPress: a nudge (HoldLease's minimum hold).
      setArmed(false);
      props.hold.onStart();
      props.hold.onEnd();
      return;
    }
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
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={({ pressed }) => [
          styles.key,
          props.compact === true ? styles.compact : null,
          enabled ? null : styles.disabled,
          pressed ? styles.pressed : null,
          armed ? styles.armed : null,
        ]}
      >
        {/* Dimmed on stale values, not on `enabled`: a pending or override-disabled key still
            shows X-Plane's current state at full brightness. */}
        {annunciation === undefined ? null : (
          <LightBar state={annunciation} dim={!link.valuesCurrent} />
        )}
        <KeyEnabledContext.Provider value={enabled}>
          {showLegend ? (
            <Text
              style={[styles.legend, enabled ? null : styles.legendDisabled]}
              {...(props.compact === true
                ? {
                    adjustsFontSizeToFit: true,
                    minimumFontScale: 0.7,
                    numberOfLines: shown.includes('\n') ? 2 : 1,
                  }
                : null)}
            >
              {shown}
            </Text>
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
