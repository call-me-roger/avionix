import React from 'react';

import { usePanel } from '@/features/panels/primitives/PanelContext';
import { useReadBack } from '@/features/panels/primitives/useReadBack';
import { EntryPad } from '@/features/panels/radios/EntryPad';
import { RadioRow } from '@/features/panels/radios/RadioRow';
import { RADIOS } from '@/features/panels/radios/radios';
import { TransponderSection } from '@/features/panels/radios/TransponderSection';
import { useRadioEntry } from '@/features/panels/radios/useRadioEntry';

export { RADIOS_PANEL } from '@/features/panels/radios/radios';

/**
 * F-21/F-22. Keyed by the aircraft, so a change of aircraft drops every draft and read-back
 * sentence instead of carrying them onto radios they were never meant for.
 */
export function RadiosPanel() {
  const { snapshot } = usePanel();
  const { icaoType, description, tailNumber } = snapshot.compatibility.identity;
  return <RadiosContent key={`${icaoType}|${description}|${tailNumber}`} />;
}

function RadiosContent() {
  const readBack = useReadBack();
  const entry = useRadioEntry();
  return (
    <>
      {RADIOS.map((radio) => (
        <RadioRow
          key={radio.key}
          radio={radio}
          readBack={readBack}
          onEnterStandby={() => entry.open(radio.key)}
        />
      ))}
      <TransponderSection readBack={readBack} onEnterCode={() => entry.open('squawk')} />
      <EntryPad entry={entry} readBack={readBack} />
    </>
  );
}
