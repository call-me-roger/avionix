import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { isEightThirtyThreeOnly } from '@/domain/radios/channels';
import { entryText, parseEntry } from '@/domain/radios/entry';
import { isEmergencySquawk } from '@/domain/radios/squawk';
import { firstNumber } from '@/features/panels/instruments/useInstrumentValues';
import { ControlButton } from '@/features/panels/primitives/ControlButton';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import type { ReadBack } from '@/features/panels/primitives/useReadBack';
import { Keypad } from '@/features/panels/radios/Keypad';
import { type EntryTarget, formatFrequency } from '@/features/panels/radios/radios';
import type { RadioEntry } from '@/features/panels/radios/useRadioEntry';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const makeStyles = (theme: Theme) => ({
  wrap: {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 2,
    borderStyle: 'dashed' as const,
    borderColor: theme.colors.primary,
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
  cancelLabel: { color: theme.colors.primary, fontSize: theme.typography.titleSize },
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
  const still =
    current === null ? '' : ` ${target.title} is still ${formatFrequency(target.kind, current)}.`;
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
  const styles = useThemedStyles(makeStyles);
  const { write } = usePanel();
  const target = entry.target;
  if (target === null) {
    return null;
  }
  const parsed = parseEntry(target.kind, entry.draft);
  const shown = parsed.status === 'valid' ? parsed.text : entryText(target.kind, entry.draft);
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
    <View style={styles.wrap}>
      <Text style={styles.title}>{target.title}</Text>
      <View
        style={styles.display}
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${target.title}, new value ${shown.replace(/_/g, '')}`}
      >
        <BodyText>New</BodyText>
        <Text style={styles.draft}>{shown}</Text>
      </View>
      {parsed.status === 'valid' && parsed.note !== null ? (
        <BodyText tone="danger">{parsed.note}</BodyText>
      ) : null}
      {parsed.status !== 'valid' && parsed.message !== null ? (
        <BodyText tone="danger">{parsed.message}</BodyText>
      ) : null}
      <Keypad
        kind={target.kind}
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
          <Text style={styles.cancelLabel}>Cancel</Text>
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
