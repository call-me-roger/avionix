import React from 'react';
import { View } from 'react-native';

import type { SwitchSpec } from '@/domain/systems/controls';
import { missingControls, unitUnavailable } from '@/domain/systems/messages';
import { AvionicsUnit } from '@/features/panels/primitives/AvionicsUnit';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import type { ReadBack } from '@/features/panels/primitives/useReadBack';
import { aircraftName, presence, sentenceCase } from '@/features/panels/systems/availability';
import { SwitchKey } from '@/features/panels/systems/SwitchKey';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  row: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, columnGap: theme.touch.spacing },
  // Three to a row on a phone; a lone key on the last row takes the width.
  key: { flexBasis: '30%' as const, flexGrow: 1 },
});

/**
 * Under a unit: the S3 line naming every control not drawn or disabled (muted), then each
 * read-back failure (danger), then any further sentences (hold messages).
 */
export function UnitLines({
  missing,
  readBack,
  keys,
  notes = [],
}: {
  missing: readonly string[];
  readBack: ReadBack;
  keys: readonly string[];
  notes?: readonly (string | null)[];
}) {
  const { snapshot } = usePanel();
  return (
    <>
      {missing.length === 0 ? null : (
        <BodyText muted>{missingControls(aircraftName(snapshot), missing)}</BodyText>
      )}
      {keys.map((key) => {
        const message = readBack.messageFor(key);
        return message === null ? null : (
          <BodyText key={key} tone="danger">
            {message}
          </BodyText>
        );
      })}
      {notes.map((note, index) => (note === null ? null : <BodyText key={index}>{note}</BodyText>))}
    </>
  );
}

/** A unit of two-position switches (lights, anti-ice, electrical): spec §4.6, S3. */
export function SwitchGroup({
  label,
  specs,
  readBack,
}: {
  label: string;
  specs: readonly SwitchSpec[];
  readBack: ReadBack;
}) {
  const { snapshot } = usePanel();
  const styles = useThemedStyles(makeStyles);
  const states = specs.map((spec) => ({
    spec,
    ...presence(snapshot, spec.state, [spec.on, spec.off]),
  }));
  const drawn = states.filter((state) => state.shown);
  if (drawn.length === 0) {
    return (
      <AvionicsUnit label={label}>
        <BodyText muted>{unitUnavailable(sentenceCase(label), aircraftName(snapshot))}</BodyText>
      </AvionicsUnit>
    );
  }
  const missing = states.filter((state) => !state.enabled).map((state) => state.spec.legend);
  return (
    <AvionicsUnit label={label}>
      <View style={styles.row}>
        {drawn.map(({ spec }) => (
          <SwitchKey key={spec.key} spec={spec} readBack={readBack} style={styles.key} />
        ))}
      </View>
      <UnitLines missing={missing} readBack={readBack} keys={drawn.map(({ spec }) => spec.key)} />
    </AvionicsUnit>
  );
}
