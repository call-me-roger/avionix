import React from 'react';
import { Text, View } from 'react-native';

import { TRIM_HOLD_CAP_MS } from '@/domain/panels/hold-lease';
import { FEATURE_TRIM, TAKEOFF_TRIM, type TrimSpec } from '@/domain/systems/controls';
import { holdCapped, holdNoResponse, trimSetNotTaken } from '@/domain/systems/messages';
import {
  TRIM_TARGET_TOLERANCE,
  numberAt,
  trimAtLimit,
  trimReadout,
} from '@/domain/systems/readouts';
import { ControlButton } from '@/features/panels/primitives/ControlButton';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { useHoldControl } from '@/features/panels/primitives/useHoldControl';
import type { ReadBack } from '@/features/panels/primitives/useReadBack';
import {
  aircraftName,
  bindingOk,
  sentenceCase,
  valueOf,
} from '@/features/panels/systems/availability';
import { UnitLines } from '@/features/panels/systems/SwitchGroup';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';
import { avionicsText, numeric } from '@/theme/typography';

/** A mark centred on its `left`, standing across the track. */
const markBox = (top: number, width: number, height: number) => ({
  position: 'absolute' as const,
  top,
  width,
  height,
  marginLeft: -width / 2,
});

const makeStyles = (theme: Theme) => ({
  unit: { gap: theme.spacing.xs },
  header: { flexDirection: 'row' as const, justifyContent: 'space-between' as const },
  caption: {
    ...avionicsText(theme, true),
    fontSize: theme.typography.captionSize,
    color: theme.avionics.legendDim,
  },
  readout: {
    ...numeric(theme, true),
    fontSize: theme.typography.captionSize,
    color: theme.avionics.legend,
  },
  stale: { color: theme.avionics.legendDim },
  row: { flexDirection: 'row' as const, gap: theme.touch.spacing },
  key: { flex: 1 },
  // The scale: a 6 dp track, a centre tick, the takeoff band (pitch) and the pointer.
  track: { height: 6, margin: 6, borderRadius: 3, backgroundColor: theme.avionics.lightOff },
  tick: { ...markBox(-3, 2, 12), backgroundColor: theme.avionics.legendDim },
  takeoff: { ...markBox(-4, 6, 14), borderWidth: 1.5, borderColor: theme.avionics.engaged },
  pointer: { ...markBox(-5, 4, 16), backgroundColor: theme.avionics.legend },
  pointerDim: { backgroundColor: theme.avionics.legendDim },
  takeoffDim: { borderColor: theme.avionics.legendDim },
  ends: { flexDirection: 'row' as const, justifyContent: 'space-between' as const },
});

/** Where `value` (−1..1) sits along the track. */
const along = (value: number) => `${((Math.max(-1, Math.min(1, value)) + 1) / 2) * 100}%` as const;

/** Hidden from screen readers: the readout beside it speaks the same position. */
function TrimScale({
  spec,
  value,
  takeoff,
}: {
  spec: TrimSpec;
  value: number | null;
  takeoff: number | null;
}) {
  const { link } = usePanel();
  const styles = useThemedStyles(makeStyles);
  const dim = !link.valuesCurrent;
  const mark = (at: number, style: object, dimStyle: object | null, testID?: string) => (
    <View testID={testID} style={[style, { left: along(at) }, dim ? dimStyle : null]} />
  );
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.track}>
        {mark(0, styles.tick, null)}
        {takeoff === null
          ? null
          : mark(takeoff, styles.takeoff, styles.takeoffDim, `trim-${spec.axis}-takeoff`)}
        {value === null
          ? null
          : mark(value, styles.pointer, styles.pointerDim, `trim-${spec.axis}-pointer`)}
      </View>
      <View style={styles.ends}>
        <Text style={styles.caption}>{spec.decrease.legend}</Text>
        <Text style={styles.caption}>{spec.increase.legend}</Text>
      </View>
    </View>
  );
}

/** Did the set command bring the trim toward `target` (or any change when the target is unknown)? */
function movedToward(before: number | null, after: number | null, target: number | null) {
  if (after === null) {
    return false;
  }
  if (target === null) {
    return after !== before;
  }
  if (Math.abs(after - target) <= TRIM_TARGET_TOLERANCE) {
    return true;
  }
  return before !== null && Math.abs(after - target) < Math.abs(before - target);
}

/**
 * One trim axis (spec §4.3, §4.6): its scale and readout, two hold keys and a one-press set (T/O
 * or CTR). Not drawn without its position (S3); the TRIM unit names it then.
 */
export function TrimUnit({ spec, readBack }: { spec: TrimSpec; readBack: ReadBack }) {
  const { snapshot } = usePanel();
  return bindingOk(snapshot, spec.position) ? <TrimAxis spec={spec} readBack={readBack} /> : null;
}

function TrimAxis({ spec, readBack }: { spec: TrimSpec; readBack: ReadBack }) {
  const { snapshot, link, activate } = usePanel();
  const styles = useThemedStyles(makeStyles);
  const aircraft = aircraftName(snapshot);
  const value = numberAt(valueOf(snapshot, spec.position), 0);
  const readout = trimReadout(spec.axis, spec.name, value);
  const takeoff =
    spec.axis === 'pitch' && bindingOk(snapshot, TAKEOFF_TRIM)
      ? numberAt(valueOf(snapshot, TAKEOFF_TRIM), 0)
      : null;
  const target = spec.axis === 'pitch' ? takeoff : 0;
  const setKey = `trim-${spec.axis}-set`;

  const holdOptions = (command: string, direction: -1 | 1) => ({
    featureId: FEATURE_TRIM,
    command,
    capMs: TRIM_HOLD_CAP_MS,
    name: spec.name,
    value,
    cappedMessage: holdCapped(spec.name, TRIM_HOLD_CAP_MS / 1000, 'Press again to keep trimming.'),
    noResponseMessage: holdNoResponse(aircraft, `move the ${spec.name}`),
    atLimit: (current: number | null) => trimAtLimit(current, direction),
  });
  const decrease = useHoldControl(holdOptions(spec.decrease.command, -1));
  const increase = useHoldControl(holdOptions(spec.increase.command, 1));

  const holdKey = (action: TrimSpec['decrease'], control: typeof decrease) => (
    <ControlButton
      label={action.legend}
      accessibilityLabel={`${sentenceCase(spec.name)} ${action.name}`}
      featureId={FEATURE_TRIM}
      target={action.command}
      style={styles.key}
      invalid={!bindingOk(snapshot, action.command)}
      onPress={() => undefined}
      hold={{ onStart: control.start, onEnd: control.end }}
    />
  );

  const setTrim = () => {
    void activate(FEATURE_TRIM, spec.set.command);
    if (target !== null && value !== null && Math.abs(value - target) <= TRIM_TARGET_TOLERANCE) {
      return;
    }
    readBack.watch({
      key: setKey,
      name: spec.position,
      operation: spec.set.command,
      expected: target ?? value ?? 0,
      matches: (next) => movedToward(value, numberAt(next, 0), target),
      failure: () => trimSetNotTaken(aircraft, spec.set.sentence),
    });
  };

  return (
    <View style={styles.unit}>
      <View style={styles.header}>
        <Text style={styles.caption}>{spec.label}</Text>
        <Text
          style={[styles.readout, link.valuesCurrent ? null : styles.stale]}
          accessibilityLabel={readout?.spoken ?? `${sentenceCase(spec.name)} unknown`}
        >
          {readout?.text ?? '—'}
        </Text>
      </View>
      <TrimScale spec={spec} value={value} takeoff={takeoff} />
      <View style={styles.row}>
        {holdKey(spec.decrease, decrease)}
        <ControlButton
          label={spec.set.legend}
          accessibilityLabel={sentenceCase(spec.set.sentence)}
          featureId={FEATURE_TRIM}
          target={spec.set.command}
          style={styles.key}
          invalid={
            !bindingOk(snapshot, spec.set.command) || readBack.pendingExpected(setKey) !== null
          }
          onPress={setTrim}
        />
        {holdKey(spec.increase, increase)}
      </View>
      <UnitLines
        missing={[]}
        readBack={readBack}
        keys={[setKey]}
        notes={[decrease.message, increase.message]}
      />
    </View>
  );
}
