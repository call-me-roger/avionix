import type { XPlaneConnectionConfig } from '@/domain/connection/connection-config';
import type { ConnectionState } from '@/domain/connection/connection-state';
import type { ConnectorInfo } from '@/domain/connector/connector-info';
import type { AvionixError } from '@/domain/errors/avionix-error';
import type { ApiVersion } from '@/domain/simulator/api-version';
import type { DataRefValue, SimulatorCapabilities } from '@/domain/simulator/types';

export type StepStatus = 'idle' | 'pending' | 'ok' | 'failed';

/**
 * What the connector probe found. It is not a StepStatus because the outcomes are verdicts
 * ("this is plain X-Plane", "this connector trusts us") rather than pass/fail.
 */
export type ConnectorStep = 'idle' | 'pending' | 'direct' | 'pairing' | 'paired';

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

export interface LastOperation {
  kind: 'write' | 'command';
  ok: boolean;
  message: string;
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
  lastOperation: LastOperation | null;
  error: AvionixError | null;
  reconnectAttempt: number;
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

export function initialSnapshot(dataRefNames: readonly string[]): SessionSnapshot {
  return {
    state: 'disconnected',
    config: null,
    connector: null,
    capabilities: null,
    apiVersion: null,
    diagnostics: initialDiagnostics(dataRefNames),
    telemetry: {},
    lastOperation: null,
    error: null,
    reconnectAttempt: 0,
  };
}
