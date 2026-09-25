import React, { useCallback, useState } from 'react';
import { Button, View } from 'react-native';

import {
  CONNECTOR_STEP_LABEL,
  formatDiagnosticsSummary,
  stepLabel,
} from '@/application/diagnostics-summary';
import type { ConnectorStep, SessionSnapshot, StepStatus } from '@/application/session-snapshot';
import { GENERIC_COMMANDS } from '@/domain/aircraft/profiles/generic';
import { ageMs, formatAge } from '@/domain/health/freshness';
import { ACTIVITY_LABEL } from '@/domain/health/simulator-activity';
import { FailureNotice } from '@/features/health/FailureNotice';
import { shareText } from '@/platform/share';
import { BodyText, Section, SectionTitle } from '@/theme/primitives';
import { useTheme, useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

function stepTone(status: StepStatus): 'danger' | 'success' | undefined {
  if (status === 'ok') {
    return 'success';
  }
  return status === 'failed' ? 'danger' : undefined;
}

function connectorStepTone(step: ConnectorStep): 'danger' | 'success' | undefined {
  return step === 'direct' || step === 'paired' ? 'success' : undefined;
}

const makeStyles = (theme: Theme) => ({
  row: { flexDirection: 'row' as const, gap: theme.spacing.md, marginTop: theme.spacing.sm },
});

/**
 * The one place a pilot can see every connect step, why the current one failed and what to do
 * about it, and share that as text. Failure copy is never composed here: it comes from
 * `FailureNotice`, which never sees `AvionixError.message`.
 */
export function DiagnosticsScreen({
  snapshot,
  now,
  onRetry,
  onDisconnect,
}: {
  snapshot: SessionSnapshot;
  now: number;
  onRetry: () => void;
  onDisconnect: () => void;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { health, diagnostics, config, capabilities, connector, error } = snapshot;
  const summary = formatDiagnosticsSummary(snapshot, now);
  const [showText, setShowText] = useState(false);

  const onShare = useCallback(() => {
    void shareText(summary, 'Avionix diagnostics');
  }, [summary]);
  const onToggleText = useCallback(() => setShowText((open) => !open), []);

  const apiVersions = capabilities?.rawApiVersions.join(', ') ?? 'unknown';
  const apiUsing = snapshot.apiVersion === null ? '' : ` (using ${snapshot.apiVersion})`;

  return (
    <Section>
      <SectionTitle>Diagnostics</SectionTitle>

      <BodyText>{`Target: ${config === null ? 'none' : `${config.host}:${config.port}`}`}</BodyText>
      <BodyText>{`Connector: ${connector === null ? 'none (direct to X-Plane)' : connector.name}`}</BodyText>
      <BodyText>{`X-Plane: ${capabilities?.simulatorVersion ?? 'unknown'}`}</BodyText>
      <BodyText>{`API: ${apiVersions}${apiUsing}`}</BodyText>

      <BodyText>{`Simulator: ${ACTIVITY_LABEL[health.activity]}`}</BodyText>
      <BodyText>{`Last update: ${formatAge(ageMs(health.lastHeartbeatAt, now))}`}</BodyText>
      <BodyText>
        {health.roundTripMs === null
          ? 'Response time: not measured yet'
          : `Response time: ${health.roundTripMs} ms, measured ${formatAge(ageMs(health.roundTripAt, now))}`}
      </BodyText>
      <BodyText>{`Last connected: ${formatAge(ageMs(health.lastConnectedAt, now))}`}</BodyText>
      {health.readinessRetryAt === null ? null : (
        <BodyText muted>Waiting for a flight to be loaded, retrying every 5 s.</BodyText>
      )}

      <SectionTitle>Steps</SectionTitle>
      <BodyText tone={connectorStepTone(diagnostics.connector)}>
        {`Connector check: ${CONNECTOR_STEP_LABEL[diagnostics.connector]}`}
      </BodyText>
      <BodyText
        tone={stepTone(diagnostics.http)}
      >{`Reachable: ${stepLabel(diagnostics.http)}`}</BodyText>
      <BodyText tone={stepTone(diagnostics.capabilities)}>
        {`Capabilities: ${stepLabel(diagnostics.capabilities)}`}
      </BodyText>
      <BodyText tone={stepTone(diagnostics.websocket)}>
        {`Live data channel: ${stepLabel(diagnostics.websocket)}`}
      </BodyText>
      {Object.entries(diagnostics.dataRefs).map(([name, status]) => (
        <BodyText key={name} tone={stepTone(status)}>
          {`${name} (${snapshot.compatibility.bindingLabels[name] ?? 'unknown feature'}): ${stepLabel(status)}`}
        </BodyText>
      ))}
      <BodyText tone={stepTone(diagnostics.command)}>
        {`Control: ${GENERIC_COMMANDS.headingUp} (${snapshot.compatibility.bindingLabels[GENERIC_COMMANDS.headingUp] ?? 'unknown feature'}): ${stepLabel(diagnostics.command)}`}
      </BodyText>
      <BodyText tone={stepTone(diagnostics.subscription)}>
        {`Subscription: ${stepLabel(diagnostics.subscription)}`}
      </BodyText>

      {error === null ? null : (
        <>
          <SectionTitle>Problem</SectionTitle>
          <BodyText muted>{error.code}</BodyText>
          <FailureNotice code={error.code} step={health.lastEndReason?.step ?? null} />
        </>
      )}
      {error === null && health.lastEndReason !== null ? (
        <>
          <SectionTitle>Last problem</SectionTitle>
          <FailureNotice code={health.lastEndReason.code} step={health.lastEndReason.step} />
        </>
      ) : null}

      <View style={styles.row}>
        <Button title="Retry" onPress={onRetry} color={theme.colors.primary} />
        <Button title="Disconnect" onPress={onDisconnect} color={theme.colors.primary} />
        <Button title="Share diagnostics" onPress={onShare} color={theme.colors.primary} />
      </View>

      {/*
       * The web share fallback can silently fail (no Clipboard API on a plain-http LAN
       * origin), and this is also what makes the redaction directly inspectable: selectable
       * text the pilot can read and copy by hand, independent of the OS share sheet.
       */}
      <Button
        title={showText ? 'Hide diagnostics text' : 'Show diagnostics text'}
        onPress={onToggleText}
        color={theme.colors.primary}
      />
      {showText ? <BodyText selectable>{summary}</BodyText> : null}
    </Section>
  );
}
