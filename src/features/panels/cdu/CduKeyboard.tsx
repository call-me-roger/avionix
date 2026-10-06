import React from 'react';
import { View } from 'react-native';

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

/**
 * The CDU's function, alpha and numeric keys (spec §4.5). Every key is a quiet, repeatable
 * `ControlButton`: it never prints a notice of its own (the panel's one message line does), and a
 * press still in flight never disables it, so `LL` sends two presses through the panel's queue.
 */
export function CduKeyboard({ unit, press, execLit, waiting, sideBySide }: Props) {
  const { snapshot } = usePanel();
  const styles = useThemedStyles(makeStyles);

  const key = (entry: CduKey) => {
    const missing = isKeyMissing(snapshot, unit, entry.id);
    const exec = entry.id === 'exec';
    // Spec §4.5: EXEC is spoken "EXEC, light on" / "EXEC", not by its catalogue name.
    const spoken = exec ? (execLit && !missing ? 'EXEC, light on' : 'EXEC') : entry.spoken;
    return (
      <ControlButton
        key={entry.id}
        label={entry.legend}
        accessibilityLabel={keyLabel(spoken, missing)}
        featureId={cduKeysFeatureId(unit)}
        target={cduCommand(unit, entry.id)}
        quiet
        repeatable
        invalid={missing || waiting}
        annunciation={exec ? (execLit ? 'lit' : 'off') : undefined}
        onPress={() => press(entry.id)}
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
