import type { SessionSnapshot } from '@/application/session-snapshot';
import { type BindingResults, deriveAvailability } from '@/domain/aircraft/availability';
import { GENERIC_PROFILE } from '@/domain/aircraft/profiles/generic';
import { AUDIO_FEATURES, MARKER_LAMPS, MONITORS, TRANSMIT } from '@/domain/audio/catalogue';
import type { DataRefValue } from '@/domain/simulator/types';

type Status = 'ok' | 'missing' | 'readOnly' | 'unchecked';

/**
 * Every audio binding resolved ('ok') unless overridden ('unchecked' leaves no result at all),
 * merged into `base`: the other features keep their bindings and statuses.
 */
export function audioCompatibility(
  base: SessionSnapshot['compatibility'],
  overrides: Partial<Record<string, Status>> = {},
): SessionSnapshot['compatibility'] {
  const bindings: BindingResults = { ...base.bindings };
  for (const feature of GENERIC_PROFILE.features) {
    if (!AUDIO_FEATURES.includes(feature.id)) {
      continue;
    }
    for (const binding of feature.bindings) {
      const status = overrides[binding.name] ?? 'ok';
      if (status === 'unchecked') {
        delete bindings[binding.name];
      } else {
        bindings[binding.name] = { name: binding.name, kind: binding.kind, status };
      }
    }
  }
  const derived = deriveAvailability(GENERIC_PROFILE, bindings);
  return {
    ...base,
    bindings,
    features: base.features.map((feature) =>
      AUDIO_FEATURES.includes(feature.id)
        ? (derived.find((candidate) => candidate.id === feature.id) ?? feature)
        : feature,
    ),
  };
}

/** COM1 MIC, auto-listen off, listening to COM1 and the marker beacons, no lamp lit. */
export const AUDIO_VALUES: Record<string, DataRefValue> = {
  [TRANSMIT.selection]: 6,
  [TRANSMIT.autoListen]: 0,
  ...Object.fromEntries(MONITORS.map((spec) => [spec.state, 0])),
  [MONITORS[0]!.state]: 1,
  [MONITORS[6]!.state]: 1,
  ...Object.fromEntries(MARKER_LAMPS.map((lamp) => [lamp.state, 0])),
};

export function audioTelemetry(
  values: Record<string, DataRefValue>,
  receivedAt: number,
): SessionSnapshot['telemetry'] {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, { value, receivedAt }]),
  );
}
