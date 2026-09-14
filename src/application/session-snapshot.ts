import type { XPlaneConnectionConfig } from '@/domain/connection/connection-config';
import type { ConnectionState } from '@/domain/connection/connection-state';
import type { AvionixError } from '@/domain/errors/avionix-error';
import type { ApiVersion } from '@/domain/simulator/api-version';
import type { DataRefValue, SimulatorCapabilities } from '@/domain/simulator/types';

export type StepStatus = 'idle' | 'pending' | 'ok' | 'failed';

export interface SessionDiagnostics {
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
    capabilities: null,
    apiVersion: null,
    diagnostics: initialDiagnostics(dataRefNames),
    telemetry: {},
    lastOperation: null,
    error: null,
    reconnectAttempt: 0,
  };
}
