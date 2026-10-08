import React from 'react';
import { Text, View } from 'react-native';

import { type MicKey, type MonitorKey, audioModel } from '@/domain/audio/audio-model';
import { FEATURE_AUDIO_TRANSMIT, MARKER_LAMPS, MONITORS, TRANSMIT } from '@/domain/audio/catalogue';
import { audioUnavailable, listenNotTaken, micNotTaken, notHeard } from '@/domain/audio/messages';
import { MARKER_LETTER, markerColour } from '@/features/panels/navigation/nav-presentation';
import { AvionicsUnit } from '@/features/panels/primitives/AvionicsUnit';
import { ControlButton } from '@/features/panels/primitives/ControlButton';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import type { ReadBack } from '@/features/panels/primitives/useReadBack';
import { audioReader } from '@/features/panels/radios/audio-reader';
import { aircraftName } from '@/features/panels/systems/availability';
import { UnitLines } from '@/features/panels/systems/SwitchGroup';
import { BodyText } from '@/theme/primitives';
import { useTheme, useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';
import { avionicsText } from '@/theme/typography';

const MIC_READ_BACK = 'mic';

const makeStyles = (theme: Theme) => ({
  row: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: theme.touch.spacing },
  mic: { flexGrow: 1, flexBasis: '40%' as const },
  // Four to a row on a phone (COM1 COM2 NAV1 NAV2 / ADF DME MKR).
  monitor: { flexGrow: 1, flexBasis: '22%' as const },
  lamps: { flexDirection: 'row' as const, gap: 4, marginLeft: 'auto' as const },
  lamp: {
    ...avionicsText(theme, true),
    fontSize: theme.typography.captionSize,
    width: 18,
    textAlign: 'center' as const,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: theme.avionics.lightOff,
    color: theme.avionics.legendDim,
    overflow: 'hidden' as const,
  },
});

const SPOKEN = { on: 'on', off: 'off', auto: 'heard while transmitting', unknown: 'unknown' };

/** The COM monitor keys X-Plane's MIC side effect rewrites (it re-selects the transmit listener). */
const COM_MONITOR_KEYS = MONITORS.filter((spec) => spec.com !== undefined).map((spec) => spec.key);

const micState = (mic: MicKey, selectionKnown: boolean) =>
  mic.selected ? ', selected' : selectionKnown ? '' : ', unknown';

/**
 * F-23: the GA audio panel at the top of the radio stack (spec §4). MIC keys are exclusive and lit
 * green; monitor keys are independent and lit white, so talking and listening never look alike.
 * Every press sends an explicit command and is read back on the state X-Plane reports.
 */
export function AudioUnit({ readBack }: { readBack: ReadBack }) {
  const { snapshot, link, activate } = usePanel();
  const styles = useThemedStyles(makeStyles);
  const theme = useTheme();
  const aircraft = aircraftName(snapshot);
  const noFlight = snapshot.state === 'connected' && snapshot.health.activity === 'noFlight';
  const model = audioModel(audioReader(snapshot));

  if (model.status === 'unavailable') {
    return (
      <AvionicsUnit label="AUDIO" testID="audio-unit">
        <BodyText muted>{audioUnavailable(aircraft)}</BodyText>
      </AvionicsUnit>
    );
  }
  if (model.status === 'waiting' || noFlight) {
    return (
      <AvionicsUnit label="AUDIO" testID="audio-unit">
        {null}
      </AvionicsUnit>
    );
  }

  const lit = model.lamps === null ? [] : MARKER_LAMPS.filter((lamp) => model.lamps![lamp.marker]);
  const lamps =
    model.lamps === null || !link.valuesCurrent ? null : (
      <View
        style={styles.lamps}
        accessible
        accessibilityLabel={
          lit.length === 0
            ? 'Marker beacon: none'
            : `Marker beacon: ${lit.map((lamp) => lamp.marker).join(', ')}`
        }
      >
        {MARKER_LAMPS.map((lamp) => {
          const on = model.lamps![lamp.marker];
          const colour = markerColour(lamp.marker, theme);
          return (
            <Text
              key={lamp.marker}
              style={[
                styles.lamp,
                on
                  ? { backgroundColor: colour, borderColor: colour, color: theme.avionics.bezel }
                  : null,
              ]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {MARKER_LETTER[lamp.marker]}
            </Text>
          );
        })}
      </View>
    );

  const micKey = (mic: MicKey) => (
    <ControlButton
      key={mic.spec.key}
      label={mic.spec.legend}
      accessibilityLabel={`Transmit on COM${mic.spec.com}${micState(mic, model.selectionKnown)}`}
      annunciation={mic.selected ? 'engaged' : 'off'}
      featureId={FEATURE_AUDIO_TRANSMIT}
      target={mic.spec.command}
      compact
      style={styles.mic}
      // The selected MIC is inert: X-Plane would re-select its listener and mute the other COM.
      // Both are inert (not enabled) until the selection's value arrives, for the same reason.
      invalid={!mic.enabled || mic.selected || readBack.pendingExpected(MIC_READ_BACK) !== null}
      onPress={() => {
        // The MIC's side effect rewrites the COM listen flags: a pending COM watch would blame
        // the wrong cause ("didn't start listening to COM2").
        COM_MONITOR_KEYS.forEach((key) => readBack.clear(key));
        void activate(FEATURE_AUDIO_TRANSMIT, mic.spec.command);
        readBack.watch({
          key: MIC_READ_BACK,
          name: TRANSMIT.selection,
          operation: mic.spec.command,
          expected: mic.spec.value,
          failure: () => micNotTaken(aircraft, mic.spec.com),
        });
      }}
    />
  );

  const monitorKey = (key: MonitorKey) => {
    const on = key.listening === 'on';
    const target = on ? key.spec.off : key.spec.on;
    return (
      <ControlButton
        key={key.spec.key}
        label={key.spec.legend}
        accessibilityLabel={`Listen to ${key.spec.name}, ${SPOKEN[key.listening]}`}
        annunciation={key.listening === 'on' || key.listening === 'auto' ? 'lit' : 'off'}
        featureId={key.spec.featureId}
        target={target}
        compact
        style={styles.monitor}
        invalid={
          !key.enabled ||
          key.listening === 'auto' ||
          key.listening === 'unknown' ||
          readBack.pendingExpected(key.spec.key) !== null
        }
        onPress={() => {
          void activate(key.spec.featureId, target);
          readBack.watch({
            key: key.spec.key,
            name: key.spec.state,
            operation: target,
            expected: on ? 0 : 1,
            failure: () => listenNotTaken(aircraft, key.spec.name, !on),
          });
        }}
      />
    );
  };

  return (
    <AvionicsUnit label="AUDIO" labelAccessory={lamps} testID="audio-unit">
      {model.mics.length === 0 ? null : <View style={styles.row}>{model.mics.map(micKey)}</View>}
      {model.monitors.length === 0 ? null : (
        <View style={styles.row}>{model.monitors.map(monitorKey)}</View>
      )}
      <UnitLines
        missing={model.missing}
        readBack={readBack}
        keys={[MIC_READ_BACK, ...model.monitors.map((key) => key.spec.key)]}
        notes={[model.notHeard === null ? null : notHeard(model.notHeard)]}
      />
    </AvionicsUnit>
  );
}
