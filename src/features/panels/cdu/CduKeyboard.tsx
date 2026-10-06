import React from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';

import type { SessionSnapshot } from '@/application/session-snapshot';
import { cduKeysFeatureId } from '@/domain/aircraft/profiles/generic';
import {
  ALPHA_ROWS,
  CDU_KEYS,
  type CduKey,
  type CduUnit,
  FUNCTION_ROWS,
  NUMERIC_ROWS,
  cduCommand,
} from '@/domain/cdu/keys';
import { ControlButton } from '@/features/panels/primitives/ControlButton';
import type { LightBarState } from '@/features/panels/primitives/LightBar';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const NOT_AVAILABLE = ', not available on this aircraft';

/** Whether this aircraft lacks the command behind one of `unit`'s keys (spec §4.5, R9). */
export function isKeyMissing(snapshot: SessionSnapshot, unit: CduUnit, id: string): boolean {
  return snapshot.compatibility.bindings[cduCommand(unit, id)]?.status === 'missing';
}

/** How many of `unit`'s 70 keys, line-select keys included, have no command on this aircraft. */
export function missingKeyCount(snapshot: SessionSnapshot, unit: CduUnit): number {
  return CDU_KEYS.filter((entry) => isKeyMissing(snapshot, unit, entry.id)).length;
}

/** A key's spoken name, with the reason when its command is missing. */
export function keyLabel(spoken: string, missing: boolean): string {
  return missing ? `${spoken}${NOT_AVAILABLE}` : spoken;
}

/**
 * One CDU key, line-select keys included: the only place the key rules live. Quiet (the panel's
 * one message line speaks for every key) and repeatable (a press still in flight never disables
 * it, so `LL` sends two presses through the queue); compact, so a 4–5 letter legend fits a phone's
 * 5- and 6-key rows. Disabled with its reason spoken when its command is missing (R9) and while
 * the screen has not arrived (spec §4.4); the link gate (C5) is ControlButton's own.
 */
export function CduKeyButton({
  entry,
  unit,
  press,
  waiting,
  spoken = entry.spoken,
  annunciation,
  style,
  children,
}: {
  entry: CduKey;
  unit: CduUnit;
  press: (keyId: string) => void;
  waiting: boolean;
  /** Overrides the catalogue's spoken name (EXEC speaks its light). */
  spoken?: string;
  annunciation?: LightBarState;
  style?: StyleProp<ViewStyle>;
  /** Drawn instead of the legend (a line-select key's bar). */
  children?: React.ReactNode;
}) {
  const { snapshot } = usePanel();
  const missing = isKeyMissing(snapshot, unit, entry.id);
  return (
    <ControlButton
      label={entry.legend === '' ? entry.name : entry.legend}
      accessibilityLabel={keyLabel(spoken, missing)}
      featureId={cduKeysFeatureId(unit)}
      target={cduCommand(unit, entry.id)}
      quiet
      repeatable
      compact
      invalid={missing || waiting}
      annunciation={annunciation}
      onPress={() => press(entry.id)}
      style={style}
    >
      {children}
    </ControlButton>
  );
}

const makeStyles = (theme: Theme) => ({
  row: { flexDirection: 'row' as const, gap: theme.touch.spacing },
  key: { flex: 1 },
  blocksRow: { flexDirection: 'row' as const, gap: theme.touch.spacing },
  blocksColumn: { flexDirection: 'column' as const },
  // Five alpha columns beside three numeric ones: the blocks share the row in that ratio.
  alpha: { flex: 5 },
  numeric: { flex: 3 },
});

interface Props {
  unit: CduUnit;
  press: (keyId: string) => void;
  execLit: boolean;
  /** The screen has not arrived yet: every key is drawn, none can be pressed (spec §4.4). */
  waiting: boolean;
  /** The numeric block beside the alpha block, or below it when the width cannot hold 8 keys. */
  sideBySide: boolean;
}

/** The CDU's function, alpha and numeric keys (spec §4.5), in rows of `CduKeyButton`s. */
export function CduKeyboard({ unit, press, execLit, waiting, sideBySide }: Props) {
  const styles = useThemedStyles(makeStyles);

  const key = (entry: CduKey) => {
    const exec = entry.id === 'exec';
    return (
      <CduKeyButton
        key={entry.id}
        entry={entry}
        unit={unit}
        press={press}
        waiting={waiting}
        // Spec §4.5: EXEC is spoken "EXEC, light on" / "EXEC", not by its catalogue name.
        spoken={exec ? (execLit ? 'EXEC, light on' : 'EXEC') : entry.spoken}
        annunciation={exec ? (execLit ? 'lit' : 'off') : undefined}
        style={styles.key}
      />
    );
  };

  const rows = (block: readonly (readonly CduKey[])[]) =>
    block.map((row) => (
      <View key={row[0]?.id} style={styles.row}>
        {row.map(key)}
      </View>
    ));

  return (
    <View testID="cdu-keys">
      {rows(FUNCTION_ROWS)}
      <View testID="cdu-blocks" style={sideBySide ? styles.blocksRow : styles.blocksColumn}>
        <View style={sideBySide ? styles.alpha : undefined}>{rows(ALPHA_ROWS)}</View>
        <View style={sideBySide ? styles.numeric : undefined}>{rows(NUMERIC_ROWS)}</View>
      </View>
    </View>
  );
}
