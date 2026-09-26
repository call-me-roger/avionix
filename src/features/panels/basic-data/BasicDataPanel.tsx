import React from 'react';

import {
  FEATURE_FLIGHT_TELEMETRY,
  FEATURE_HEADING_CONTROL,
  GENERIC_DATAREFS,
} from '@/domain/aircraft/profiles/generic';
import { EVERYWHERE, type PanelDescriptor } from '@/domain/panels/panel';
import { Readout } from '@/features/panels/primitives/Readout';

/** Interim: the MVP's telemetry, until F-11's flight data strip replaces it. Id retired then. */
export const BASIC_DATA_PANEL: PanelDescriptor = {
  id: 'basic-data',
  title: 'Basic data',
  features: [FEATURE_FLIGHT_TELEMETRY, FEATURE_HEADING_CONTROL],
  supports: EVERYWHERE,
};

export function BasicDataPanel() {
  return (
    <>
      <Readout label="Indicated airspeed" name={GENERIC_DATAREFS.airspeed} unit=" kt" />
      <Readout label="Heading bug" name={GENERIC_DATAREFS.headingBug} unit="°" />
      <Readout label="Sim running time" name={GENERIC_DATAREFS.heartbeat} unit=" s" />
    </>
  );
}
