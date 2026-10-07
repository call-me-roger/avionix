import React from 'react';
import { View } from 'react-native';

import {
  ANTI_ICE,
  AVIONICS_MASTER,
  BATTERY,
  DIMMERS,
  ENGINES,
  EXTERIOR_LIGHTS,
  FUEL_SELECTOR,
  PARKING_BRAKE,
  TRIMS,
} from '@/domain/systems/controls';
import { ENGINES_NOT_SHOWN, unitUnavailable } from '@/domain/systems/messages';
import { engineColumns, numberAt } from '@/domain/systems/readouts';
import { AvionicsUnit } from '@/features/panels/primitives/AvionicsUnit';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import type { ReadBack } from '@/features/panels/primitives/useReadBack';
import {
  aircraftName,
  bindingMissing,
  bindingOk,
  valueOf,
} from '@/features/panels/systems/availability';
import { DimmerRow } from '@/features/panels/systems/DimmerRow';
import { EngineColumn } from '@/features/panels/systems/EngineColumn';
import { FlapsUnit } from '@/features/panels/systems/FlapsUnit';
import { GearUnit } from '@/features/panels/systems/GearUnit';
import { ParkingBrakeKey, parkingBrakeShown } from '@/features/panels/systems/ParkingBrakeKey';
import { SelectorKeys, selectorMissing } from '@/features/panels/systems/SelectorKeys';
import { SwitchGroup, UnitLines } from '@/features/panels/systems/SwitchGroup';
import { TrimUnit } from '@/features/panels/systems/TrimUnit';
import { BodyText } from '@/theme/primitives';
import { useThemedStyles } from '@/theme/theme-context';
import type { Theme } from '@/theme/tokens';

/** An engine column's narrowest comfortable width: four magneto keys and the bezel. */
const ENGINE_COLUMN_MIN_WIDTH = 300;

const makeStyles = (theme: Theme) => ({
  section: { gap: theme.touch.spacing },
  // Two engine columns side by side when both fit their minimum width, else stacked.
  engines: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: theme.touch.spacing },
  engine: { flexGrow: 1, flexBasis: ENGINE_COLUMN_MIN_WIDTH },
});

type SectionProps = { readBack: ReadBack };

/** FUEL: the selector's segment keys; hidden when the aircraft has no selector. */
function FuelUnit({ readBack }: SectionProps) {
  const { snapshot } = usePanel();
  const flag = (name: string) =>
    bindingOk(snapshot, name) ? numberAt(valueOf(snapshot, name), 0) : null;
  if (flag(FUEL_SELECTOR.hasSelector) === 0) {
    return null;
  }
  const positions = FUEL_SELECTOR.positions.filter(
    (position) => position.key !== 'both' || flag(FUEL_SELECTOR.hasBoth) !== 0,
  );
  if (!bindingOk(snapshot, FUEL_SELECTOR.state)) {
    return bindingMissing(snapshot, FUEL_SELECTOR.state) ? (
      <AvionicsUnit label="FUEL">
        <BodyText muted>{unitUnavailable('Fuel selector', aircraftName(snapshot))}</BodyText>
      </AvionicsUnit>
    ) : null;
  }
  return (
    <AvionicsUnit label="FUEL">
      <SelectorKeys
        label="SELECTOR"
        what="fuel selector"
        featureId={FUEL_SELECTOR.featureId}
        state={FUEL_SELECTOR.state}
        index={0}
        positions={positions}
        keyPrefix="fuelSelector"
        readBack={readBack}
      />
      <UnitLines
        missing={selectorMissing(snapshot, FUEL_SELECTOR.state, positions).map((p) => p.legend)}
        readBack={readBack}
        keys={['fuelSelector']}
      />
    </AvionicsUnit>
  );
}

/** ENGINE page (spec §4.7): electrical, fuel, and one column per engine. */
export function EngineSection({ readBack }: SectionProps) {
  const { snapshot } = usePanel();
  const styles = useThemedStyles(makeStyles);
  const count = bindingOk(snapshot, ENGINES.count)
    ? numberAt(valueOf(snapshot, ENGINES.count), 0)
    : null;
  const types = bindingOk(snapshot, ENGINES.type) ? valueOf(snapshot, ENGINES.type) : undefined;
  const { columns, hidden } = engineColumns(count, types);
  return (
    <View style={styles.section}>
      <SwitchGroup label="ELECTRICAL" specs={[BATTERY, AVIONICS_MASTER]} readBack={readBack} />
      <FuelUnit readBack={readBack} />
      <View style={styles.engines}>
        {columns.map((column) => (
          <View key={column.engine} style={styles.engine}>
            <EngineColumn column={column} single={columns.length === 1} readBack={readBack} />
          </View>
        ))}
      </View>
      {hidden > 0 ? <BodyText muted>{ENGINES_NOT_SHOWN}</BodyText> : null}
    </View>
  );
}

/** LIGHTS page: the exterior switches and the interior dimmers. */
export function LightsSection({ readBack }: SectionProps) {
  const { snapshot } = usePanel();
  const styles = useThemedStyles(makeStyles);
  const drawn = DIMMERS.filter((spec) => bindingOk(snapshot, spec.state));
  const missing = DIMMERS.filter((spec) =>
    [spec.state, spec.down, spec.up].some((name) => bindingMissing(snapshot, name)),
  ).map((spec) => spec.legend);
  return (
    <View style={styles.section}>
      <SwitchGroup label="EXTERIOR LIGHTS" specs={EXTERIOR_LIGHTS} readBack={readBack} />
      {drawn.length === 0 ? (
        DIMMERS.every((spec) => bindingMissing(snapshot, spec.state)) ? (
          <AvionicsUnit label="INTERIOR LIGHTS">
            <BodyText muted>{unitUnavailable('Interior lights', aircraftName(snapshot))}</BodyText>
          </AvionicsUnit>
        ) : null
      ) : (
        <AvionicsUnit label="INTERIOR LIGHTS">
          {drawn.map((spec) => (
            <DimmerRow key={spec.key} spec={spec} readBack={readBack} />
          ))}
          <UnitLines missing={missing} readBack={readBack} keys={drawn.map((spec) => spec.key)} />
        </AvionicsUnit>
      )}
    </View>
  );
}

/** FLIGHT page: flaps, trim, gear and the parking brake. */
export function FlightSection({ readBack }: SectionProps) {
  const { snapshot } = usePanel();
  const styles = useThemedStyles(makeStyles);
  const aircraft = aircraftName(snapshot);
  const trims = TRIMS.filter((spec) => bindingOk(snapshot, spec.position));
  const trimMissing = TRIMS.filter(
    (spec) =>
      bindingMissing(snapshot, spec.position) ||
      [spec.decrease, spec.increase, spec.set].some((action) =>
        bindingMissing(snapshot, action.command),
      ),
  ).map((spec) => spec.label);
  return (
    <View style={styles.section}>
      <FlapsUnit readBack={readBack} />
      {trims.length === 0 ? (
        TRIMS.every((spec) => bindingMissing(snapshot, spec.position)) ? (
          <AvionicsUnit label="TRIM">
            <BodyText muted>{unitUnavailable('Trim', aircraft)}</BodyText>
          </AvionicsUnit>
        ) : null
      ) : (
        <AvionicsUnit label="TRIM">
          {trims.map((spec) => (
            <TrimUnit key={spec.axis} spec={spec} readBack={readBack} />
          ))}
          <UnitLines missing={trimMissing} readBack={readBack} keys={[]} />
        </AvionicsUnit>
      )}
      <GearUnit readBack={readBack} />
      {parkingBrakeShown(snapshot) ? (
        <AvionicsUnit label="BRAKES">
          <ParkingBrakeKey readBack={readBack} />
        </AvionicsUnit>
      ) : bindingMissing(snapshot, PARKING_BRAKE.ratio) ? (
        <AvionicsUnit label="BRAKES">
          <BodyText muted>{unitUnavailable('Parking brake', aircraft)}</BodyText>
        </AvionicsUnit>
      ) : null}
    </View>
  );
}

/** ICE page: the anti-ice switches. */
export function IceSection({ readBack }: SectionProps) {
  return <SwitchGroup label="ANTI-ICE" specs={ANTI_ICE} readBack={readBack} />;
}
