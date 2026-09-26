import React from 'react';

import {
  FEATURE_HEADING_CONTROL,
  GENERIC_COMMANDS,
  GENERIC_DATAREFS,
} from '@/domain/aircraft/profiles/generic';
import { EVERYWHERE, type PanelDescriptor } from '@/domain/panels/panel';
import { ControlButton } from '@/features/panels/primitives/ControlButton';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { Readout } from '@/features/panels/primitives/Readout';
import { ValueEntry } from '@/features/panels/primitives/ValueEntry';

/** Interim: the MVP's test controls, until F-20's autopilot panel absorbs them. Id retired then. */
export const HEADING_PANEL: PanelDescriptor = {
  id: 'heading',
  title: 'Heading',
  features: [FEATURE_HEADING_CONTROL],
  supports: EVERYWHERE,
};

export function HeadingPanel() {
  const { write, activate } = usePanel();
  return (
    <>
      <Readout label="Heading bug" name={GENERIC_DATAREFS.headingBug} unit="°" />
      <ValueEntry
        label="New heading"
        unit="degrees"
        featureId={FEATURE_HEADING_CONTROL}
        target={GENERIC_DATAREFS.headingBug}
        min={0}
        max={360}
        onSubmit={(value) =>
          void write(FEATURE_HEADING_CONTROL, GENERIC_DATAREFS.headingBug, value)
        }
      />
      <ControlButton
        label="Heading up"
        featureId={FEATURE_HEADING_CONTROL}
        target={GENERIC_COMMANDS.headingUp}
        onPress={() => void activate(FEATURE_HEADING_CONTROL, GENERIC_COMMANDS.headingUp)}
      />
    </>
  );
}
