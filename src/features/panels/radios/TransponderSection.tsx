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
import { ControlButton, OperationNotice } from '@/features/panels/primitives/ControlButton';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import type { ReadBack } from '@/features/panels/primitives/useReadBack';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

/** How long "IDENT sent" stays: the panel's own claim, kept short of a real ident's ~18 s. */
export const IDENT_SENT_MS = 5000;

const makeStyles = (theme: Theme) => ({
  wrap: { gap: theme.spacing.xs, paddingVertical: theme.spacing.sm },
  row: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    gap: theme.spacing.sm,
  },
  summary: {
    flexDirection: 'row' as const,
    alignItems: 'baseline' as const,
    gap: theme.spacing.sm,
    flexGrow: 1,
  },
  name: {
    color: theme.colors.text,
    fontSize: theme.typography.titleSize,
    fontWeight: 'bold' as const,
  },
  mode: {
    color: theme.colors.text,
    fontSize: theme.typography.titleSize,
    fontVariant: ['tabular-nums' as const],
  },
  stale: { color: theme.colors.textMuted },
});

/**
 * F-22. The code button opens the 0–7 keypad; the four mode positions write `transponder_mode`;
 * IDENT is a command. "Identing" is shown only while X-Plane reports it (T5), and the ATC-assigned
 * comparison is simply absent when X-Plane has no such value (T7).
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
    <View style={styles.wrap} testID="transponder-section">
      <View style={styles.row}>
        <View
          style={styles.summary}
          accessible
          accessibilityLabel={`Transponder: squawk ${codeText}, mode ${modeText}${identing ? ', identing' : ''}${notLive ? ', not live' : ''}`}
        >
          <Text style={styles.name}>Transponder</Text>
          <Text style={[styles.mode, link.valuesCurrent ? null : styles.stale]}>{modeText}</Text>
          {identing ? <BodyText tone="success">Identing</BodyText> : null}
          {notLive ? <BodyText muted>not live</BodyText> : null}
        </View>
        <ControlButton
          label={codeText}
          accessibilityLabel="Enter squawk code"
          featureId={FEATURE_TRANSPONDER_CODE}
          target={D.transponderCode}
          quiet
          onPress={onEnterCode}
        />
      </View>
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
    </View>
  );
}
