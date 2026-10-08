/** Spec §4.2's table, by index into MAP_RANGES so it reads the same in nm and km. */
export interface Density {
  /** An airport's runways are drawn when its longest runway is at least this long. */
  minAirportFt: number;
  /** Its identifier too when at least this long; null draws no identifiers. */
  minLabelFt: number | null;
}

export function densityFor(rangeIndex: number): Density {
  if (rangeIndex <= 3) {
    return { minAirportFt: 0, minLabelFt: 0 };
  }
  if (rangeIndex <= 5) {
    return { minAirportFt: 3000, minLabelFt: 5000 };
  }
  return { minAirportFt: 6000, minLabelFt: null };
}
