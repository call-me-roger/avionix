/** The aircraft's V-speeds in knots indicated, as X-Plane's `acf_V*` DataRefs publish them. */
export interface SpeedInputs {
  vso: number | null;
  vs: number | null;
  vfe: number | null;
  vno: number | null;
  vne: number | null;
}

export interface SpeedMarkings {
  vso: number;
  vs: number;
  vfe: number;
  vno: number;
  vne: number;
}

export type BandColor = 'white' | 'green' | 'yellow';

export interface SpeedBand {
  from: number;
  to: number;
  color: BandColor;
}

const finite = (value: number | null): value is number => value !== null && Number.isFinite(value);

/**
 * Markings only from a plausible set: an author who left these at 0, or published them out of
 * order, gets no arcs at all rather than false ones.
 */
export function speedMarkings(inputs: SpeedInputs): SpeedMarkings | null {
  const { vso, vs, vfe, vno, vne } = inputs;
  if (!finite(vso) || !finite(vs) || !finite(vfe) || !finite(vno) || !finite(vne)) {
    return null;
  }
  if (!(vso > 0 && vso <= vs && vs < vno && vno < vne)) {
    return null;
  }
  if (!(vso < vfe && vfe <= vne)) {
    return null;
  }
  return { vso, vs, vfe, vno, vne };
}

/** The red line at Vne is drawn by the instrument from `markings.vne`. */
export function speedBands(markings: SpeedMarkings): SpeedBand[] {
  return [
    { from: markings.vso, to: markings.vfe, color: 'white' },
    { from: markings.vs, to: markings.vno, color: 'green' },
    { from: markings.vno, to: markings.vne, color: 'yellow' },
  ];
}
