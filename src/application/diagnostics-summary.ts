import type { ConnectorStep, SessionSnapshot, StepStatus } from '@/application/session-snapshot';
import { identityLabel } from '@/domain/aircraft/aircraft-identity';
import { BINDING_MISS_LABEL, FEATURE_STATUS_LABEL } from '@/domain/aircraft/availability';
import { GENERIC_COMMANDS } from '@/domain/aircraft/profiles/generic';
import { SELECTION_LABEL } from '@/domain/aircraft/profile-selection';
import { explainFailure } from '@/domain/health/failure-explanation';
import { ageMs, formatAge } from '@/domain/health/freshness';
import { ACTIVITY_LABEL } from '@/domain/health/simulator-activity';

/** Shared with `DiagnosticsScreen` so the screen and the shared text never drift apart. */
export function stepLabel(status: StepStatus): string {
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

/**
 * What the connector probe verdict means, in words distinct from `stepLabel`'s pass/fail
 * vocabulary. Shared with `DiagnosticsScreen` so the screen and the shared text never drift
 * apart, the same reason `stepLabel` lives here rather than in the component.
 */
export const CONNECTOR_STEP_LABEL: Record<ConnectorStep, string> = {
  idle: 'not checked yet',
  pending: 'checking',
  direct: 'not needed, talking to X-Plane directly',
  pairing: 'needs pairing',
  paired: 'paired',
};

/**
 * The support text the pilot can share. It is built only from codes, step outcomes and the
 * explanation table — never from `AvionixError.message`, which carries URLs, HTTP statuses and
 * exception text. Times are relative so the text says nothing about when or where the user flies.
 */
export function formatDiagnosticsSummary(snapshot: SessionSnapshot, now: number): string {
  const { health, diagnostics, config, capabilities, connector, error } = snapshot;
  const lines: string[] = ['Avionix diagnostics', ''];

  lines.push(`Link: ${snapshot.state}`);
  if (snapshot.state === 'reconnecting') {
    lines.push(`Reconnect attempt: ${snapshot.reconnectAttempt} of ${health.reconnectBudget}`);
  }
  lines.push(`Simulator: ${ACTIVITY_LABEL[health.activity]}`);
  lines.push(`Values: ${health.live ? 'live' : 'not live'}`);
  lines.push(`Last update: ${formatAge(ageMs(health.lastHeartbeatAt, now))}`);
  lines.push(
    health.roundTripMs === null
      ? 'Response time: not measured yet'
      : `Response time: ${health.roundTripMs} ms, measured ${formatAge(ageMs(health.roundTripAt, now))}`,
  );
  lines.push(`Last connected: ${formatAge(ageMs(health.lastConnectedAt, now))}`);
  if (health.lastEndedAt !== null) {
    lines.push(`Link ended: ${formatAge(ageMs(health.lastEndedAt, now))}`);
  }
  lines.push('');

  lines.push(`Target: ${config === null ? 'none' : `${config.host}:${config.port}`}`);
  lines.push(`Connector: ${connector === null ? 'none (direct to X-Plane)' : connector.name}`);
  lines.push(`X-Plane: ${capabilities?.simulatorVersion ?? 'unknown'}`);
  lines.push(
    `API: ${capabilities?.rawApiVersions.join(', ') ?? 'unknown'}${
      snapshot.apiVersion === null ? '' : ` (using ${snapshot.apiVersion})`
    }`,
  );
  lines.push('');

  const { compatibility } = snapshot;
  lines.push('Aircraft');
  lines.push(`  Aircraft: ${identityLabel(compatibility.identity) ?? 'not reported by X-Plane'}`);
  lines.push(
    `  Profile: ${compatibility.profileName} ${compatibility.profileVersion} (${SELECTION_LABEL[compatibility.selection]})`,
  );
  if (compatibility.identity.addOnVersion !== null) {
    lines.push(`  Add-on version: ${compatibility.identity.addOnVersion}`);
  }
  if (compatibility.versionWarning !== null) {
    lines.push(`  Warning: ${compatibility.versionWarning}`);
  }
  lines.push(
    `  Checked: ${
      compatibility.checkedAt === null ? 'not yet' : formatAge(ageMs(compatibility.checkedAt, now))
    }`,
  );
  for (const feature of compatibility.features) {
    lines.push(`  ${feature.label}: ${FEATURE_STATUS_LABEL[feature.status]}`);
    for (const miss of feature.missing) {
      lines.push(`    ${miss.purpose} — ${miss.name} — ${BINDING_MISS_LABEL[miss.status]}`);
    }
  }
  if (!compatibility.writabilityReported) {
    lines.push('  This X-Plane version does not report which values can be written.');
  }
  lines.push('');

  lines.push('Steps');
  lines.push(`  Connector: ${CONNECTOR_STEP_LABEL[diagnostics.connector]}`);
  lines.push(`  Reachable: ${stepLabel(diagnostics.http)}`);
  lines.push(`  Capabilities: ${stepLabel(diagnostics.capabilities)}`);
  lines.push(`  Live data channel: ${stepLabel(diagnostics.websocket)}`);
  for (const [name, status] of Object.entries(diagnostics.dataRefs)) {
    const feature = snapshot.compatibility.bindingLabels[name] ?? 'unknown feature';
    lines.push(`  Value ${name} (${feature}): ${stepLabel(status)}`);
  }
  const commandName = GENERIC_COMMANDS.headingUp;
  const commandFeature = snapshot.compatibility.bindingLabels[commandName] ?? 'unknown feature';
  lines.push(`  Control: ${commandName} (${commandFeature}): ${stepLabel(diagnostics.command)}`);
  lines.push(`  Subscription: ${stepLabel(diagnostics.subscription)}`);

  if (error !== null) {
    const step = health.lastEndReason?.step ?? null;
    const { cause, action } = explainFailure(error.code, step);
    lines.push('', `Problem: ${error.code}`, `  ${cause}`, `  ${action}`);
  }

  return lines.join('\n');
}
