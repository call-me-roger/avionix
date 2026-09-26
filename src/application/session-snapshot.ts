import {
  type CompatibilitySnapshot,
  initialCompatibility,
  snapshotDataRefNames,
} from '@/application/compatibility';
import type { AircraftProfile } from '@/domain/aircraft/profile';
import type { XPlaneConnectionConfig } from '@/domain/connection/connection-config';
import type { ConnectionState } from '@/domain/connection/connection-state';
import type { ConnectorInfo } from '@/domain/connector/connector-info';
import type { AvionixError, AvionixErrorCode } from '@/domain/errors/avionix-error';
import type { ConnectStep } from '@/domain/health/failure-explanation';
import type { SimulatorActivity } from '@/domain/health/simulator-activity';
import type { ApiVersion } from '@/domain/simulator/api-version';
import type { DataRefValue, SimulatorCapabilities } from '@/domain/simulator/types';

export type StepStatus = 'idle' | 'pending' | 'ok' | 'failed';

/**
 * What the connector probe found. It is not a StepStatus because the outcomes are verdicts
 * ("this is plain X-Plane", "this connector trusts us") rather than pass/fail.
 */
export type ConnectorStep = 'idle' | 'pending' | 'direct' | 'pairing' | 'paired';

export interface FailureRef {
  code: AvionixErrorCode;
  step: ConnectStep | null;
}

/**
 * The session writes only the facts here; `activity` and `live` are derived from them by
 * HealthMonitor. The paused reading is deliberately not a field: it is read from
 * `telemetry['sim/time/paused']`, which is absent exactly when that DataRef did not resolve.
 */
export interface SessionHealth {
  activity: SimulatorActivity;
  live: boolean;
  lastHeartbeatValue: number | null;
  /** Wall clock of the last heartbeat *advance*, not of the last frame received. */
  lastHeartbeatAt: number | null;
  flightLoaded: boolean;
  /** Median of the last ROUND_TRIP_WINDOW samples, in milliseconds. */
  roundTripMs: number | null;
  roundTripAt: number | null;
  lastConnectedAt: number | null;
  lastEndedAt: number | null;
  lastEndReason: FailureRef | null;
  reconnectBudget: number;
  nextRetryAt: number | null;
  readinessRetryAt: number | null;
}

export function initialHealth(reconnectBudget: number): SessionHealth {
  return {
    activity: 'unknown',
    live: false,
    lastHeartbeatValue: null,
    lastHeartbeatAt: null,
    flightLoaded: false,
    roundTripMs: null,
    roundTripAt: null,
    lastConnectedAt: null,
    lastEndedAt: null,
    lastEndReason: null,
    reconnectBudget,
    nextRetryAt: null,
    readinessRetryAt: null,
  };
}

export interface SessionDiagnostics {
  connector: ConnectorStep;
  http: StepStatus;
  capabilities: StepStatus;
  websocket: StepStatus;
  dataRefs: Record<string, StepStatus>;
  command: StepStatus;
  subscription: StepStatus;
}

export interface TelemetrySample {
  value: DataRefValue;
  receivedAt: number;
}

/** Why an operation was not sent at all. Rendered from a fixed table of plain-language copy. */
export type OperationRefusal = 'notConnected' | 'unavailable';

/**
 * The last operation a control caused, keyed in `SessionSnapshot.operations` by the binding name
 * it targeted, so a failure is shown against that control and nowhere else (F-04 R9).
 */
export interface OperationOutcome {
  status: 'pending' | 'ok' | 'failed';
  /** An AvionixError-derived failure; rendered only through FailureNotice. */
  failure: FailureRef | null;
  /** A refusal before anything was sent. */
  refusal: OperationRefusal | null;
  at: number;
}

export interface SessionSnapshot {
  state: ConnectionState;
  config: XPlaneConnectionConfig | null;
  connector: ConnectorInfo | null;
  capabilities: SimulatorCapabilities | null;
  apiVersion: ApiVersion | null;
  diagnostics: SessionDiagnostics;
  telemetry: Record<string, TelemetrySample | undefined>;
  operations: Readonly<Record<string, OperationOutcome | undefined>>;
  error: AvionixError | null;
  reconnectAttempt: number;
  health: SessionHealth;
  compatibility: CompatibilitySnapshot;
}

export function initialDiagnostics(dataRefNames: readonly string[]): SessionDiagnostics {
  const dataRefs: Record<string, StepStatus> = {};
  for (const name of dataRefNames) {
    dataRefs[name] = 'idle';
  }
  return {
    connector: 'idle',
    http: 'idle',
    capabilities: 'idle',
    websocket: 'idle',
    dataRefs,
    command: 'idle',
    subscription: 'idle',
  };
}

/**
 * A fresh snapshot for a session about to connect with `profile` selected. The profile decides
 * which DataRef names the diagnostics track, so the steps the screen shows always match the
 * names the session is about to resolve.
 */
export function initialSnapshot(profile: AircraftProfile, reconnectBudget = 5): SessionSnapshot {
  return {
    state: 'disconnected',
    config: null,
    connector: null,
    capabilities: null,
    apiVersion: null,
    diagnostics: initialDiagnostics(snapshotDataRefNames(profile)),
    telemetry: {},
    operations: {},
    error: null,
    reconnectAttempt: 0,
    health: initialHealth(reconnectBudget),
    compatibility: initialCompatibility(profile),
  };
}
