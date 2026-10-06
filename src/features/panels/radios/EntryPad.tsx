import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { isEightThirtyThreeOnly } from '@/domain/radios/channels';
import {
  MAX_DIGITS,
  entryDigits,
  entryText,
  parseEntry,
  shouldExplain,
  typedValue,
} from '@/domain/radios/entry';
import { isEmergencySquawk } from '@/domain/radios/squawk';
import { firstNumber } from '@/features/panels/instruments/useInstrumentValues';
import { ControlButton } from '@/features/panels/primitives/ControlButton';
import { DisplayWindow } from '@/features/panels/primitives/DisplayWindow';
import { Keypad } from '@/features/panels/primitives/Keypad';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import type { ReadBack } from '@/features/panels/primitives/useReadBack';
import { type EntryTarget, formatFrequency } from '@/features/panels/radios/radios';
import type { RadioEntry } from '@/features/panels/radios/useRadioEntry';
import { BodyText } from '@/theme/primitives';
import { useOnBezel } from '@/theme/surface-context';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

/**
 * Shared with `SelectorPad.tsx` so the dashed "New" box looks the same across panels. The
 * `…OnBezel` variants apply when the pad sits inside an `AvionicsUnit` (always for SelectorPad,
 * on narrow layouts for EntryPad): app colours would read dark-on-dark there in the light theme.
 */
export const entryPadStyles = (theme: Theme) => ({
  wrap: {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 2,
    borderStyle: 'dashed' as const,
    borderColor: theme.colors.accent,
    maxWidth: 420,
    width: '100%' as const,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.titleSize,
    fontWeight: 'bold' as const,
  },
  display: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    gap: theme.spacing.sm,
  },
  draft: {
    color: theme.colors.text,
    fontSize: theme.typography.headingSize,
    fontWeight: 'bold' as const,
    fontVariant: ['tabular-nums' as const],
  },
  actions: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    gap: theme.touch.spacing,
  },
  cancel: {
    minHeight: theme.touch.minTarget,
    minWidth: theme.touch.minTarget,
    justifyContent: 'center' as const,
    paddingHorizontal: theme.spacing.lg,
  },
  cancelLabel: { color: theme.colors.accent, fontSize: theme.typography.titleSize },
  wrapOnBezel: { borderColor: theme.avionics.selected },
  titleOnBezel: { color: theme.avionics.legend },
  cancelLabelOnBezel: { color: theme.avionics.selected },
});

function notTakenSentence(
  target: EntryTarget,
  value: number,
  text: string,
  current: number | null,
) {
  if (target.kind === 'squawk') {
    return `X-Plane did not take squawk ${text}.`;
  }
  // A frequency that is not a positive number is no value at all (I3): the clause is omitted
  // rather than reading "is still 0.000" or "is still -1.999".
  const still =
    current === null || current <= 0
      ? ''
      : ` ${target.title} is still ${formatFrequency(target.kind, current)}.`;
  const hint =
    target.kind === 'com' && isEightThirtyThreeOnly(value)
      ? ' This aircraft’s radio may tune 25 kHz channels only.'
      : '';
  return `X-Plane did not take ${text}.${still}${hint}`;
}

/**
 * The staged value lives only here, in a dashed box under the word "New", so it can never be read
 * as X-Plane's value (C2, T2). Set is the only path to a write; an invalid draft explains itself
 * and keeps Set disabled (C3, T3). An emergency squawk takes a second tap.
 */
export function EntryPad({ entry, readBack }: { entry: RadioEntry; readBack: ReadBack }) {
  const styles = useThemedStyles(entryPadStyles);
  const onBezel = useOnBezel();
  const { write } = usePanel();
  const target = entry.target;
  if (target === null) {
    return null;
  }
  const parsed = parseEntry(target.kind, entry.draft);
  const draft = entry.draft;
  // The box always reads as typed, never the padded value a trailing zero would hide (I2): a
  // draft shorter than the full length only reveals what Set would actually send below, as "Sets
  // 121.500", muted rather than in the draft colour, so it still looks provisional.
  const shown = entryText(target.kind, draft);
  const sets =
    parsed.status === 'valid' && draft.length < MAX_DIGITS[target.kind] ? parsed.text : null;
  const explain = parsed.status === 'invalid' && shouldExplain(target.kind, draft, parsed);
  const accessibilityLabel =
    draft.length === 0
      ? `${target.title}, nothing typed yet`
      : `${target.title}, new value ${typedValue(target.kind, draft)}`;
  const send = () => {
    if (parsed.status !== 'valid') {
      return;
    }
    const { value, text } = parsed;
    void write(target.featureId, target.name, value);
    readBack.watch({
      key: target.readBackKey,
      name: target.name,
      operation: target.name,
      expected: value,
      failure: (current) => notTakenSentence(target, value, text, firstNumber(current)),
    });
    entry.sent();
  };
  return (
    <View style={[styles.wrap, onBezel ? styles.wrapOnBezel : null]}>
      <Text style={[styles.title, onBezel ? styles.titleOnBezel : null]}>{target.title}</Text>
      <View
        style={styles.display}
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={accessibilityLabel}
      >
        <DisplayWindow text={shown} role="selected" caption="NEW" />
      </View>
      {sets === null ? null : <BodyText muted>{`Sets ${sets}`}</BodyText>}
      {parsed.status === 'valid' && parsed.note !== null ? (
        <BodyText tone="danger">{parsed.note}</BodyText>
      ) : null}
      {parsed.status === 'incomplete' && parsed.message !== null ? (
        <BodyText tone="danger">{parsed.message}</BodyText>
      ) : null}
      {parsed.status === 'invalid' && explain ? (
        <BodyText tone="danger">{parsed.message}</BodyText>
      ) : null}
      <Keypad
        digits={entryDigits(target.kind)}
        onDigit={entry.digit}
        onErase={entry.erase}
        onClear={entry.clear}
      />
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel entry"
          onPress={entry.cancel}
          style={styles.cancel}
        >
          <Text style={[styles.cancelLabel, onBezel ? styles.cancelLabelOnBezel : null]}>
            Cancel
          </Text>
        </Pressable>
        <ControlButton
          label="Set"
          accessibilityLabel={`Set ${target.title}`}
          featureId={target.featureId}
          target={target.name}
          invalid={parsed.status !== 'valid'}
          confirm={
            parsed.status === 'valid' && target.kind === 'squawk' && isEmergencySquawk(parsed.value)
          }
          onPress={send}
        />
      </View>
    </View>
  );
}
