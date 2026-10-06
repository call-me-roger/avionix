import React from 'react';
import { Pressable, Text, View } from 'react-native';

import {
  SELECTOR_DIGITS,
  explainSelector,
  hasSign,
  parseSelectorEntry,
  selectorDraftText,
} from '@/domain/autopilot/selector-entry';
import { selectorMatches, selectorNotTaken } from '@/domain/autopilot/selectors';
import { readBackKey } from '@/features/panels/autopilot/autopilot';
import type { SelectorEntry } from '@/features/panels/autopilot/useSelectorEntry';
import { firstNumber } from '@/features/panels/instruments/useInstrumentValues';
import { ControlButton } from '@/features/panels/primitives/ControlButton';
import { Keypad } from '@/features/panels/primitives/Keypad';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import type { ReadBack } from '@/features/panels/primitives/useReadBack';
import { entryPadStyles } from '@/features/panels/radios/EntryPad';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';

/**
 * A typed selector value, staged in the dashed box under "New" so it is never read as X-Plane's
 * (R3). Set is the only path to a write; an out-of-range draft says why once more digits cannot
 * help, and keeps Set disabled. No snapping.
 */
export function SelectorPad({
  entry,
  readBack,
  blocked,
}: {
  entry: SelectorEntry;
  readBack: ReadBack;
  blocked: boolean;
}) {
  const styles = useThemedStyles(entryPadStyles);
  const { write } = usePanel();
  const target = entry.target;
  if (target === null) {
    return null;
  }
  const { spec, kind } = target;
  const parsed = parseSelectorEntry(kind, entry.draft);
  const shown = selectorDraftText(kind, entry.draft);
  const title = `${spec.label} selector`;
  const lower = spec.label.toLowerCase();
  const send = () => {
    if (parsed.status !== 'valid') {
      return;
    }
    const value = parsed.value;
    void write(spec.featureId, spec.name, value);
    readBack.watch({
      key: readBackKey(spec, kind),
      name: spec.name,
      operation: spec.name,
      expected: value,
      matches: selectorMatches(kind, value),
      failure: (current) => selectorNotTaken(kind, value, firstNumber(current)),
    });
    entry.sent();
  };
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <View
        style={styles.display}
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={
          shown === '' ? `${title}, nothing typed yet` : `${title}, new value ${shown}`
        }
      >
        <BodyText>New</BodyText>
        <Text style={styles.draft}>{shown === '' ? '—' : shown}</Text>
      </View>
      {parsed.status === 'valid' ? <BodyText muted>{`Sets ${parsed.text}`}</BodyText> : null}
      {parsed.status === 'invalid' && explainSelector(kind, entry.draft, parsed) ? (
        <BodyText tone="danger">{parsed.message}</BodyText>
      ) : null}
      <Keypad
        digits={SELECTOR_DIGITS}
        onDigit={entry.digit}
        onErase={entry.erase}
        onClear={entry.clear}
        onSign={hasSign(kind) ? entry.sign : undefined}
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
          accessibilityLabel={`Set ${lower}`}
          featureId={spec.featureId}
          target={spec.name}
          invalid={blocked || parsed.status !== 'valid'}
          onPress={send}
        />
      </View>
    </View>
  );
}
