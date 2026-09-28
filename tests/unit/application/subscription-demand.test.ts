import { wantedDataRefIds } from '@/application/subscription-demand';
import { IDENTITY_DATAREFS } from '@/domain/aircraft/identity-datarefs';
import {
  FEATURE_FLIGHT_TELEMETRY,
  FEATURE_HEADING_CONTROL,
  GENERIC_DATAREFS,
  GENERIC_PROFILE,
} from '@/domain/aircraft/profiles/generic';
import type { DataRefDescriptor } from '@/domain/simulator/types';

const NAMES: Array<[number, string]> = [
  [1, GENERIC_DATAREFS.heartbeat],
  [2, GENERIC_DATAREFS.airspeed],
  [3, GENERIC_DATAREFS.headingBug],
  [4, GENERIC_DATAREFS.paused],
  [5, IDENTITY_DATAREFS.icaoType],
  [6, IDENTITY_DATAREFS.description],
  [7, IDENTITY_DATAREFS.tailNumber],
  [8, 'addon/version/string'],
];

function resolved(ids: number[] = NAMES.map(([id]) => id)): Map<number, DataRefDescriptor> {
  const map = new Map<number, DataRefDescriptor>();
  for (const [id, name] of NAMES) {
    if (ids.includes(id)) {
      map.set(id, { id, name, valueType: 'float' });
    }
  }
  return map;
}

const sorted = (ids: Set<number>) => [...ids].sort((a, b) => a - b);

describe('wantedDataRefIds', () => {
  it('wants every resolved DataRef until a demand is set', () => {
    expect(sorted(wantedDataRefIds(GENERIC_PROFILE, resolved(), null))).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });

  it('always keeps identification and connection health, even with nothing demanded', () => {
    expect(sorted(wantedDataRefIds(GENERIC_PROFILE, resolved(), []))).toEqual([1, 4, 5, 6, 7]);
  });

  it('adds the DataRefs of each demanded feature', () => {
    expect(
      sorted(wantedDataRefIds(GENERIC_PROFILE, resolved(), [FEATURE_FLIGHT_TELEMETRY])),
    ).toEqual([1, 2, 4, 5, 6, 7]);
    expect(
      sorted(
        wantedDataRefIds(GENERIC_PROFILE, resolved(), [
          FEATURE_FLIGHT_TELEMETRY,
          FEATURE_HEADING_CONTROL,
        ]),
      ),
    ).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('wants only names that resolved', () => {
    expect(
      sorted(wantedDataRefIds(GENERIC_PROFILE, resolved([1, 3, 5]), [FEATURE_HEADING_CONTROL])),
    ).toEqual([1, 3, 5]);
  });

  it('ignores a demanded feature the profile does not declare', () => {
    expect(sorted(wantedDataRefIds(GENERIC_PROFILE, resolved(), ['no-such-feature']))).toEqual([
      1, 4, 5, 6, 7,
    ]);
  });
});
