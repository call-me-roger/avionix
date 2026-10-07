import type { SessionSnapshot } from '@/application/session-snapshot';
import type { DataRefValue } from '@/domain/simulator/types';

/** The name resolved on this aircraft, writable when it is a DataRef the feature writes. */
export function bindingOk(snapshot: SessionSnapshot, name: string): boolean {
  return snapshot.compatibility.bindings[name]?.status === 'ok';
}

export interface Presence {
  shown: boolean;
  enabled: boolean;
}

/** S3: drawn when the state resolved; enabled when every command (or the write) resolved too. */
export function presence(
  snapshot: SessionSnapshot,
  state: string,
  actions: readonly string[],
): Presence {
  const shown = bindingOk(snapshot, state);
  return { shown, enabled: shown && actions.every((name) => bindingOk(snapshot, name)) };
}

/** X-Plane's description of the loaded aircraft for sentences, else its ICAO type, else null. */
export function aircraftName(snapshot: SessionSnapshot): string | null {
  const { identity } = snapshot.compatibility;
  return identity.description ?? identity.icaoType ?? null;
}

export function valueOf(snapshot: SessionSnapshot, name: string): DataRefValue | undefined {
  return snapshot.telemetry[name]?.value;
}

/** "EXTERIOR LIGHTS" → "Exterior lights", for `unitUnavailable`. */
export function sentenceCase(label: string): string {
  const lower = label.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
