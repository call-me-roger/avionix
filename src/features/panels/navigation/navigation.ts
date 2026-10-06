import { selectorNotTaken } from '@/domain/autopilot/selectors';
import { NAV_SOURCES } from '@/domain/navigation/hsi';

/** Read-back keys the NAV control unit watches under (spec §4). */
export const NAV_SOURCE_READBACK_KEY = 'nav-source';
export const NAV_COURSE_READBACK_KEY = 'nav-course';

/** The three selectable HSI sources, in key order; GPS2 (3) has no key of its own. */
export const NAV_SOURCE_KEYS = NAV_SOURCES;

/** The sentence when X-Plane did not switch the HSI to the pressed source. */
export function sourceNotTaken(label: string): string {
  return `X-Plane did not switch the HSI to ${label}.`;
}

/**
 * `selectorNotTaken`'s heading sentence, reworded for the course window: the course is a heading
 * selector (spec §4), but its sentence must read "course", not "heading" or "the selector".
 */
export function courseNotTaken(value: number, current: number | null): string {
  return selectorNotTaken('heading', value, current)
    .replace('heading', 'course')
    .replace('selector', 'course');
}
