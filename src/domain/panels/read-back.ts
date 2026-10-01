import type { DataRefValue } from '@/domain/simulator/types';

/** How long X-Plane has to show a written value: 30 samples at the documented 10 Hz. */
export const READ_BACK_MS = 3000;

export type ReadBackVerdict = 'waiting' | 'adopted' | 'notAdopted' | 'abandoned';

export interface ReadBackInput {
  current: DataRefValue | undefined;
  expected: number;
  /** The session's outcome for the binding that should cause the change (structurally typed). */
  operation: { status: 'pending' | 'ok' | 'failed'; at: number } | undefined;
  /** When the pilot pressed; an outcome recorded before this belongs to an earlier press. */
  startedAt: number;
  valuesCurrent: boolean;
  now: number;
}

/** Whole-number values (channels, codes, modes): within half a unit reads as the same value. */
export function readsAs(value: DataRefValue | undefined, expected: number): boolean {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === 'number' && Math.abs(candidate - expected) < 0.5;
}

/**
 * Did X-Plane adopt what the panel sent (F-21 R4, F-22 R4)? Some add-ons accept a write and ignore
 * it. A failed or refused operation already shows its own failure, and a dropped link already has
 * the panel notice, so both give no verdict. The window counts from the moment X-Plane accepted
 * the write, not from the press, so a slow request never eats into it.
 */
export function readBackVerdict(input: ReadBackInput): ReadBackVerdict {
  const operation = input.operation;
  if (operation === undefined || operation.at < input.startedAt || operation.status === 'pending') {
    return input.valuesCurrent ? 'waiting' : 'abandoned';
  }
  if (operation.status === 'failed') {
    return 'abandoned';
  }
  if (readsAs(input.current, input.expected)) {
    return 'adopted';
  }
  if (!input.valuesCurrent) {
    return 'abandoned';
  }
  return input.now - operation.at >= READ_BACK_MS ? 'notAdopted' : 'waiting';
}
