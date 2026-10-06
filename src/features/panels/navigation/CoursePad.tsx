import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { GENERIC_DATAREFS as D, FEATURE_NAV_COURSE } from '@/domain/aircraft/profiles/generic';
import {
  SELECTOR_DIGITS,
  explainSelector,
  parseSelectorEntry,
  selectorDraftText,
} from '@/domain/autopilot/selector-entry';
import { selectorMatches } from '@/domain/autopilot/selectors';
import { courseNotTaken, NAV_COURSE_READBACK_KEY } from '@/features/panels/navigation/navigation';
import type { CourseEntry } from '@/features/panels/navigation/useCourseEntry';
import { firstNumber } from '@/features/panels/instruments/useInstrumentValues';
import { ControlButton } from '@/features/panels/primitives/ControlButton';
import { DisplayWindow } from '@/features/panels/primitives/DisplayWindow';
import { Keypad } from '@/features/panels/primitives/Keypad';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import type { ReadBack } from '@/features/panels/primitives/useReadBack';
import { entryPadStyles } from '@/features/panels/radios/EntryPad';
import { BodyText } from '@/theme/primitives';
import { useOnBezel } from '@/theme/surface-context';
import { useThemedStyles } from '@/theme/theme-context';

const KIND = 'heading';

/**
 * The course keypad: the same layout as `SelectorPad`, for the one selector the NAV unit owns. The
 * typed value lives only here, in the dashed "New" box, so it is never read as X-Plane's course
 * (spec §4); Set is the only path to a write, and an out-of-range draft explains itself once more
 * digits cannot help.
 */
export function CoursePad({ entry, readBack }: { entry: CourseEntry; readBack: ReadBack }) {
  const styles = useThemedStyles(entryPadStyles);
  const onBezel = useOnBezel();
  const { write } = usePanel();
  if (!entry.isOpen) {
    return null;
  }
  const parsed = parseSelectorEntry(KIND, entry.draft);
  const shown = selectorDraftText(KIND, entry.draft);
  const send = () => {
    if (parsed.status !== 'valid') {
      return;
    }
    const value = parsed.value;
    void write(FEATURE_NAV_COURSE, D.hsiCourse, value);
    readBack.watch({
      key: NAV_COURSE_READBACK_KEY,
      name: D.hsiCourse,
      operation: D.hsiCourse,
      expected: value,
      matches: selectorMatches(KIND, value),
      failure: (current) => courseNotTaken(value, firstNumber(current)),
    });
    entry.sent();
  };
  return (
    <View style={[styles.wrap, onBezel ? styles.wrapOnBezel : null]}>
      <Text style={[styles.title, onBezel ? styles.titleOnBezel : null]}>Course</Text>
      <View
        style={styles.display}
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={
          shown === '' ? 'Course, nothing typed yet' : `Course, new value ${shown}`
        }
      >
        <DisplayWindow text={shown === '' ? '—' : shown} role="selected" caption="NEW" />
      </View>
      {parsed.status === 'valid' ? <BodyText muted>{`Sets ${parsed.text}`}</BodyText> : null}
      {parsed.status === 'invalid' && explainSelector(KIND, entry.draft, parsed) ? (
        <BodyText tone="danger">{parsed.message}</BodyText>
      ) : null}
      <Keypad
        digits={SELECTOR_DIGITS}
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
          accessibilityLabel="Set course"
          featureId={FEATURE_NAV_COURSE}
          target={D.hsiCourse}
          invalid={parsed.status !== 'valid'}
          onPress={send}
        />
      </View>
    </View>
  );
}
