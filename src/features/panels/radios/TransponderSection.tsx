import React from 'react';
import { Text, View } from 'react-native';

import { featureOf } from '@/application/compatibility';
import {
  FEATURE_TRANSPONDER_CODE,
  FEATURE_TRANSPONDER_IDENT,
  FEATURE_TRANSPONDER_MODE,
  GENERIC_COMMANDS as C,
  GENERIC_DATAREFS as D,
} from '@/domain/aircraft/profiles/generic';
import { controlAvailability } from '@/domain/panels/control-availability';
import { formatSquawk, isEmergencySquawk, isSquawk } from '@/domain/radios/squawk';
import { MODE_POSITIONS, modeLabel } from '@/domain/radios/transponder-mode';
import { firstNumber } from '@/features/panels/instruments/useInstrumentValues';
import { AvionicsUnit } from '@/features/panels/primitives/AvionicsUnit';
import { ControlButton, OperationNotice } from '@/features/panels/primitives/ControlButton';
import { DisplayWindow } from '@/features/panels/primitives/DisplayWindow';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import type { ReadBack } from '@/features/panels/primitives/useReadBack';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';
import { avionicsText } from '@/theme/typography';

/** How long "IDENT sent" stays: the panel's own claim, kept short of a real ident's ~18 s. */
export const IDENT_SENT_MS = 5000;

const makeStyles = (theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    gap: theme.spacing.sm,
  },
  summary: { flexGrow: 1 },
  identAnnunciation: {
    ...avionicsText(theme, true),
    fontSize: theme.typography.legendSize,
    color: theme.avionics.engaged,
  },
  // A last-known IDENT is not lit as if X-Plane had just reported it.
  stale: { color: theme.avionics.legendDim },
});

/**
 * F-22 as an avionics hardware unit: the squawk code in a large glass window with the mode in its
 * caption, the four mode keys as annunciated positions, and an IDENT annunciation inside the unit
 * while X-Plane reports identing (T5; the ATC-assigned comparison is simply absent when X-Plane has
 * no such value, T7).
 */
export function TransponderSection({
  readBack,
  onEnterCode,
  entry = null,
  squawkEntryOpen = false,
}: {
  readBack: ReadBack;
  onEnterCode: () => void;
  /** The narrow layout's keypad, rendered right under this section's first line (I1). */
  entry?: React.ReactNode;
  /**
   * The squawk entry is open: its own Set button already shows the code's failure (M2), so this
   * section does not print it a second time.
   */
  squawkEntryOpen?: boolean;
}) {
  const { snapshot, link, now, write, activate } = usePanel();
  const styles = useThemedStyles(makeStyles);
  const noFlight = snapshot.state === 'connected' && snapshot.health.activity === 'noFlight';
  const read = (name: string) => (noFlight ? null : firstNumber(snapshot.telemetry[name]?.value));
  const rawCode = read(D.transponderCode);
  const code = rawCode !== null && isSquawk(rawCode) ? rawCode : null;
  const mode = read(D.transponderMode);
  const identing = read(D.transponderIdenting) === 1;
  const rawAssigned = read(D.atcAssignedCode);
  const assigned =
    rawAssigned !== null && rawAssigned > 0 && isSquawk(rawAssigned) ? rawAssigned : null;
  const codeText = code === null ? '—' : formatSquawk(code);
  const modeText = modeLabel(mode) ?? '—';
  const notLive = !link.valuesCurrent && (code !== null || mode !== null);
  const emergency = code !== null && isEmergencySquawk(code);
  const codeCaption = emergency ? `${modeText} · EMERG` : modeText;

  const identOutcome = snapshot.operations[C.transponderIdent];
  const identSent = identOutcome?.status === 'ok' && now - identOutcome.at < IDENT_SENT_MS;

  const codeAvailability = controlAvailability(
    featureOf(snapshot.compatibility, FEATURE_TRANSPONDER_CODE),
  );
  const modeAvailability = controlAvailability(
    featureOf(snapshot.compatibility, FEATURE_TRANSPONDER_MODE),
  );

  const squawk = (value: number) => {
    void write(FEATURE_TRANSPONDER_CODE, D.transponderCode, value);
    readBack.watch({
      key: 'squawk',
      name: D.transponderCode,
      operation: D.transponderCode,
      expected: value,
      failure: () => `X-Plane did not take squawk ${formatSquawk(value)}.`,
    });
  };
  const select = (value: number, label: string) => {
    void write(FEATURE_TRANSPONDER_MODE, D.transponderMode, value);
    readBack.watch({
      key: 'mode',
      name: D.transponderMode,
      operation: D.transponderMode,
      expected: value,
      failure: () => `X-Plane did not change the transponder to ${label}.`,
    });
  };
  const squawkMessage = readBack.messageFor('squawk');
  const modeMessage = readBack.messageFor('mode');

  return (
    <AvionicsUnit label="XPDR" testID="transponder-section">
      <View style={styles.row}>
        <View
          style={styles.summary}
          accessible
          accessibilityLabel={`Transponder: squawk ${codeText}, mode ${modeText}${identing ? ', identing' : ''}${notLive ? ', not live' : ''}`}
        >
          {identing ? (
            <Text
              style={[styles.identAnnunciation, link.valuesCurrent ? null : styles.stale]}
              testID="xpdr-ident"
            >
              IDENT
            </Text>
          ) : null}
        </View>
        <ControlButton
          label={codeText}
          accessibilityLabel="Enter squawk code"
          featureId={FEATURE_TRANSPONDER_CODE}
          target={D.transponderCode}
          quiet
          onPress={onEnterCode}
        >
          <DisplayWindow
            text={codeText}
            role="plain"
            size="large"
            caption={codeCaption}
            tone={emergency ? 'warning' : undefined}
            stale={!link.valuesCurrent}
            testID="xpdr-code"
          />
        </ControlButton>
      </View>
      {notLive ? <BodyText muted>not live</BodyText> : null}
      {entry}
      {codeAvailability.reason === null ? null : (
        <BodyText muted>{codeAvailability.reason}</BodyText>
      )}
      {squawkEntryOpen ? null : <OperationNotice target={D.transponderCode} />}
      {squawkMessage === null ? null : <BodyText tone="danger">{squawkMessage}</BodyText>}
      {assigned === null ? null : assigned === code ? (
        <BodyText>{`ATC assigned ${formatSquawk(assigned)} ✓`}</BodyText>
      ) : (
        <View style={styles.row}>
          <BodyText tone="danger">{`ATC assigned ${formatSquawk(assigned)} — not set`}</BodyText>
          <ControlButton
            label={`Squawk ${formatSquawk(assigned)}`}
            featureId={FEATURE_TRANSPONDER_CODE}
            target={D.transponderCode}
            quiet
            confirm={isEmergencySquawk(assigned)}
            onPress={() => squawk(assigned)}
          />
        </View>
      )}
      <View style={styles.row}>
        {MODE_POSITIONS.map((position) => (
          <ControlButton
            key={position.value}
            label={position.label}
            accessibilityLabel={`Transponder ${position.spoken}`}
            featureId={FEATURE_TRANSPONDER_MODE}
            target={D.transponderMode}
            quiet
            selected={mode === position.value}
            onPress={() => select(position.value, position.label)}
          />
        ))}
      </View>
      {modeAvailability.reason === null ? null : (
        <BodyText muted>{modeAvailability.reason}</BodyText>
      )}
      <OperationNotice target={D.transponderMode} />
      {modeMessage === null ? null : <BodyText tone="danger">{modeMessage}</BodyText>}
      <View style={styles.row}>
        <ControlButton
          label="IDENT"
          featureId={FEATURE_TRANSPONDER_IDENT}
          target={C.transponderIdent}
          onPress={() => void activate(FEATURE_TRANSPONDER_IDENT, C.transponderIdent)}
        />
        {identSent ? <BodyText>IDENT sent</BodyText> : null}
      </View>
    </AvionicsUnit>
  );
}
