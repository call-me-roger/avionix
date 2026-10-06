import React from 'react';
import { View } from 'react-native';

import { featureOf } from '@/application/compatibility';
import {
  FEATURE_NAV_COURSE,
  FEATURE_NAV_SOURCE,
  GENERIC_COMMANDS as C,
  GENERIC_DATAREFS as D,
} from '@/domain/aircraft/profiles/generic';
import {
  formatSelector,
  selectorMatches,
  stepLabel,
  stepSelector,
  stepSpoken,
} from '@/domain/autopilot/selectors';
import { sourceLabel } from '@/domain/navigation/hsi';
import { controlAvailability } from '@/domain/panels/control-availability';
import { firstNumber } from '@/features/panels/instruments/useInstrumentValues';
import { CoursePad } from '@/features/panels/navigation/CoursePad';
import {
  NAV_COURSE_READBACK_KEY,
  NAV_SOURCE_KEYS,
  NAV_SOURCE_READBACK_KEY,
  courseNotTaken,
  sourceNotTaken,
} from '@/features/panels/navigation/navigation';
import type { CourseEntry } from '@/features/panels/navigation/useCourseEntry';
import { useNavValues } from '@/features/panels/navigation/useNavValues';
import { AvionicsUnit } from '@/features/panels/primitives/AvionicsUnit';
import { ControlButton, OperationNotice } from '@/features/panels/primitives/ControlButton';
import { DisplayWindow } from '@/features/panels/primitives/DisplayWindow';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import type { ReadBack } from '@/features/panels/primitives/useReadBack';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

const KIND = 'heading';
const STEPS: readonly number[] = [-10, -1, 1, 10];

const makeStyles = (theme: Theme) => ({
  wrap: { gap: theme.spacing.xs, paddingVertical: theme.spacing.sm },
  sources: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: theme.touch.spacing },
  steppers: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: theme.spacing.sm },
  flex1: { flex: 1 },
});

/**
 * The NAV control unit (spec §4): the HSI source keys, the course window and its steppers and
 * keypad, and CTR. `readBack` and `entry` come from the panel so the panel can place the keypad
 * under the course row, exactly as the autopilot's `SelectorRow`/`SelectorPad` split the work.
 */
export function NavControls({ readBack, entry }: { readBack: ReadBack; entry: CourseEntry }) {
  const { snapshot, link, write, activate } = usePanel();
  const styles = useThemedStyles(makeStyles);
  const { source, course, lateral } = useNavValues();

  const sourceAvailability = controlAvailability(
    featureOf(snapshot.compatibility, FEATURE_NAV_SOURCE),
  );
  const courseAvailability = controlAvailability(
    featureOf(snapshot.compatibility, FEATURE_NAV_COURSE),
  );

  const sourcePending = readBack.pendingExpected(NAV_SOURCE_READBACK_KEY) !== null;
  const sourceMessage = readBack.messageFor(NAV_SOURCE_READBACK_KEY);
  // A source X-Plane reports that has no key of its own (GPS2): a caption, never a lit key.
  const outOfRange = source !== null && !NAV_SOURCE_KEYS.some((key) => key.value === source);
  const outOfRangeLabel = outOfRange ? sourceLabel(source) : null;

  const base = readBack.pendingExpected(NAV_COURSE_READBACK_KEY) ?? course;
  const text = course === null ? '—' : formatSelector(KIND, course);
  const courseMessage = readBack.messageFor(NAV_COURSE_READBACK_KEY);

  const ctrHidden = snapshot.compatibility.bindings[C.hsiDirect]?.status === 'missing';

  const sendSource = (value: number, label: string) => {
    void write(FEATURE_NAV_SOURCE, D.hsiSource, value);
    readBack.watch({
      key: NAV_SOURCE_READBACK_KEY,
      name: D.hsiSource,
      operation: D.hsiSource,
      expected: value,
      failure: () => sourceNotTaken(label),
    });
  };

  const sendCourse = (value: number) => {
    void write(FEATURE_NAV_COURSE, D.hsiCourse, value);
    readBack.watch({
      key: NAV_COURSE_READBACK_KEY,
      name: D.hsiCourse,
      operation: D.hsiCourse,
      expected: value,
      matches: selectorMatches(KIND, value),
      failure: (current) => courseNotTaken(value, firstNumber(current)),
    });
  };

  return (
    <AvionicsUnit label="NAV" testID="nav-controls">
      <View style={styles.wrap}>
        <View style={styles.sources}>
          {NAV_SOURCE_KEYS.map((key) => (
            <ControlButton
              key={key.value}
              label={key.label}
              featureId={FEATURE_NAV_SOURCE}
              target={D.hsiSource}
              selected={source === key.value}
              quiet
              invalid={sourcePending}
              style={styles.flex1}
              onPress={() => sendSource(key.value, key.label)}
            />
          ))}
        </View>
        {outOfRangeLabel === null ? null : <BodyText muted>{`SRC ${outOfRangeLabel}`}</BodyText>}
        {sourceAvailability.reason === null ? null : (
          <BodyText muted>{sourceAvailability.reason}</BodyText>
        )}
        <OperationNotice target={D.hsiSource} />
        {sourceMessage === null ? null : <BodyText tone="danger">{sourceMessage}</BodyText>}

        <ControlButton
          label={text}
          accessibilityLabel="Enter course"
          featureId={FEATURE_NAV_COURSE}
          target={D.hsiCourse}
          quiet
          style={styles.flex1}
          onPress={entry.open}
        >
          <DisplayWindow text={text} role="selected" caption="CRS" stale={!link.valuesCurrent} />
        </ControlButton>
        {entry.isOpen ? <CoursePad entry={entry} readBack={readBack} /> : null}
        <View style={styles.steppers}>
          {STEPS.map((delta) => {
            const next = base === null ? null : stepSelector(KIND, base, delta);
            return (
              <ControlButton
                key={delta}
                label={stepLabel(KIND, delta)}
                accessibilityLabel={stepSpoken('Course', KIND, delta)}
                featureId={FEATURE_NAV_COURSE}
                target={D.hsiCourse}
                quiet
                invalid={next === null}
                onPress={() => {
                  if (next !== null) {
                    sendCourse(next);
                  }
                }}
              />
            );
          })}
        </View>
        {courseAvailability.reason === null ? null : (
          <BodyText muted>{courseAvailability.reason}</BodyText>
        )}
        <OperationNotice target={D.hsiCourse} />
        {courseMessage === null ? null : <BodyText tone="danger">{courseMessage}</BodyText>}

        {ctrHidden ? null : (
          <>
            <ControlButton
              label="CTR"
              accessibilityLabel="Centre on station"
              featureId={FEATURE_NAV_COURSE}
              target={C.hsiDirect}
              quiet
              invalid={!lateral.valid}
              onPress={() => void activate(FEATURE_NAV_COURSE, C.hsiDirect)}
            />
            <OperationNotice target={C.hsiDirect} />
          </>
        )}
      </View>
    </AvionicsUnit>
  );
}
