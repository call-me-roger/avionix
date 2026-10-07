import { featureOf } from '@/application/compatibility';
import type { SessionSnapshot } from '@/application/session-snapshot';
import { controlAvailability } from '@/domain/panels/control-availability';
import type { DataRefValue } from '@/domain/simulator/types';

/** The name resolved on this aircraft, writable when it is a DataRef the feature writes. */
export function bindingOk(snapshot: SessionSnapshot, name: string): boolean {
  return snapshot.compatibility.bindings[name]?.status === 'ok';
}

/** The profile feature acts now (R8): what ControlButton checks, for a hold key's own lease. */
export function featureUsable(snapshot: SessionSnapshot, featureId: string): boolean {
  return controlAvailability(featureOf(snapshot.compatibility, featureId)).usable;
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

/**
 * The systems features' one capitaliser: "EXTERIOR LIGHTS" → "Exterior lights" for
 * `unitUnavailable`, "pitch trim" → "Pitch trim" for spoken labels. Every name it is given is lower
 * case, or a legend in capitals.
 */
export function sentenceCase(label: string): string {
  const lower = label.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
