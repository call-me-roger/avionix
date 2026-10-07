import React from 'react';

import type { SessionSnapshot } from '@/application/session-snapshot';
import { FEATURE_PARKING_BRAKE, PARKING_BRAKE } from '@/domain/systems/controls';
import { parkingBrakeNotTaken } from '@/domain/systems/messages';
import { switchOn } from '@/domain/systems/readouts';
import { ControlButton } from '@/features/panels/primitives/ControlButton';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import type { ReadBack } from '@/features/panels/primitives/useReadBack';
import { aircraftName, bindingOk, valueOf } from '@/features/panels/systems/availability';
import { BodyText } from '@/theme/primitives';

const KEY = 'parkingBrake';

/** Drawn when the ratio resolved at all: read-only still shows the brake, disabled (R7). */
export function parkingBrakeShown(snapshot: SessionSnapshot): boolean {
  const status = snapshot.compatibility.bindings[PARKING_BRAKE.ratio]?.status;
  return status === 'ok' || status === 'readOnly';
}

/**
 * The parking brake (spec §4.2): X-Plane has only a toggle command for it, so the key writes 1 or
 * 0 to the ratio, which is idempotent. Its light bar is X-Plane's ratio.
 */
export function ParkingBrakeKey({ readBack }: { readBack: ReadBack }) {
  const { snapshot, write } = usePanel();
  if (!parkingBrakeShown(snapshot)) {
    return null;
  }
  const set = switchOn(valueOf(snapshot, PARKING_BRAKE.ratio), 0);
  const aircraft = aircraftName(snapshot);
  const spoken = set === null ? 'unknown' : set ? 'set' : 'released';
  const message = readBack.messageFor(KEY);

  return (
    <>
      <ControlButton
        label="PARK BRAKE"
        accessibilityLabel={`Parking brake, ${spoken}`}
        annunciation={set === true ? 'engaged' : 'off'}
        featureId={FEATURE_PARKING_BRAKE}
        target={PARKING_BRAKE.ratio}
        invalid={
          !bindingOk(snapshot, PARKING_BRAKE.ratio) ||
          set === null ||
          readBack.pendingExpected(KEY) !== null
        }
        onPress={() => {
          if (set === null) {
            return;
          }
          const expected = set ? 0 : 1;
          void write(FEATURE_PARKING_BRAKE, PARKING_BRAKE.ratio, expected);
          readBack.watch({
            key: KEY,
            name: PARKING_BRAKE.ratio,
            operation: PARKING_BRAKE.ratio,
            expected,
            matches: (value) => switchOn(value, 0) === !set,
            failure: () => parkingBrakeNotTaken(aircraft, !set),
          });
        }}
      />
      {message === null ? null : <BodyText tone="danger">{message}</BodyText>}
    </>
  );
}
