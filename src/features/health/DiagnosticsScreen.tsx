import React, { useCallback } from 'react';
import { Button, View } from 'react-native';

import { formatDiagnosticsSummary } from '@/application/diagnostics-summary';
import { BINDING_FEATURE } from '@/application/mvp-bindings';
import type { SessionSnapshot, StepStatus } from '@/application/session-snapshot';
import { ageMs, formatAge } from '@/domain/health/freshness';
import { ACTIVITY_LABEL } from '@/domain/health/simulator-activity';
import { FailureNotice } from '@/features/health/FailureNotice';
import { shareText } from '@/platform/share';
import { BodyText, Section, SectionTitle } from '@/theme/primitives';
import { useTheme, useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

function stepLabel(status: StepStatus): string {
  switch (status) {
    case 'ok':
      return 'ok';
    case 'failed':
      return 'failed';
    case 'pending':
      return 'in progress';
    case 'idle':
      return 'not reached';
  }
}

function stepTone(status: StepStatus): 'danger' | 'success' | undefined {
  if (status === 'ok') {
    return 'success';
  }
  return status === 'failed' ? 'danger' : undefined;
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

  const onShare = useCallback(() => {
    void shareText(formatDiagnosticsSummary(snapshot, now), 'Avionix diagnostics');
  }, [snapshot, now]);

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
      <BodyText>{`Connector: ${diagnostics.connector}`}</BodyText>
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
          {`${name} (${BINDING_FEATURE[name] ?? 'unknown feature'}): ${stepLabel(status)}`}
        </BodyText>
      ))}
      <BodyText
        tone={stepTone(diagnostics.command)}
      >{`Control: ${stepLabel(diagnostics.command)}`}</BodyText>
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
    </Section>
  );
}
