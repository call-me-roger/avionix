import { usePanel } from '@/features/panels/primitives/PanelContext';

/** Adapts a single-value formatter to `useFlightValue`'s `values: readonly number[]` signature. */
export const one =
  (format: (value: number) => string) =>
  (values: readonly number[]): string =>
    format(values[0] ?? 0);

export interface FlightValueState {
  text: string;
  /** A DataRef this value needs did not resolve on this aircraft (F-11 R7). */
  missing: boolean;
  /** The link's freshness, never the value's own receipt time (spec: "Freshness"). */
  current: boolean;
}

export function useFlightValue(
  names: readonly string[],
  format: (values: readonly number[]) => string,
): FlightValueState {
  const { snapshot, link } = usePanel();
  const missing = names.some((name) => snapshot.compatibility.bindings[name]?.status === 'missing');
  const noFlight = snapshot.state === 'connected' && snapshot.health.activity === 'noFlight';
  const values = names.map((name) => snapshot.telemetry[name]?.value);
  const numbers = values.filter((value): value is number => typeof value === 'number');
  const text = noFlight || numbers.length !== names.length ? '—' : format(numbers);
  return { text, missing, current: link.valuesCurrent };
}
