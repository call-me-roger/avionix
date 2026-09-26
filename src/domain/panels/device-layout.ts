import type { DeviceClass, Orientation, PanelDescriptor } from '@/domain/panels/panel';

/**
 * Android's `sw600dp` convention. It also puts every iPad in the tablet class and every current
 * phone in the phone class, whichever way up it is held.
 */
export const TABLET_MIN_SHORT_SIDE_DP = 600;

export interface DeviceLayout {
  deviceClass: DeviceClass;
  orientation: Orientation;
}

/** On the web the same rule applies to the browser window, so a narrow window acts as a phone. */
export function deviceLayout(width: number, height: number): DeviceLayout {
  return {
    deviceClass: Math.min(width, height) >= TABLET_MIN_SHORT_SIDE_DP ? 'tablet' : 'phone',
    orientation: width > height ? 'landscape' : 'portrait',
  };
}

export type PanelFit = 'fits' | 'rotate' | 'unsupported';

/** R1: the shell never shows a panel on a combination the panel did not declare. */
export function panelFit(
  descriptor: Pick<PanelDescriptor, 'supports'>,
  layout: DeviceLayout,
): PanelFit {
  const orientations = descriptor.supports[layout.deviceClass];
  if (orientations.length === 0) {
    return 'unsupported';
  }
  return orientations.includes(layout.orientation) ? 'fits' : 'rotate';
}
