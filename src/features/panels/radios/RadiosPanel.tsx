import React from 'react';

import { usePanel } from '@/features/panels/primitives/PanelContext';
import { useReadBack } from '@/features/panels/primitives/useReadBack';
import { RadioRow } from '@/features/panels/radios/RadioRow';
import { RADIOS } from '@/features/panels/radios/radios';

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
  return (
    <>
      {RADIOS.map((radio) => (
        <RadioRow
          key={radio.key}
          radio={radio}
          readBack={readBack}
          onEnterStandby={() => undefined}
        />
      ))}
    </>
  );
}
