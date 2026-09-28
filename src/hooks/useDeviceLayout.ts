import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

import { type DeviceLayout, deviceLayout } from '@/domain/panels/device-layout';

/** The window, classified (F-04 R1). On the web this is the browser window. */
export function useDeviceLayout(): DeviceLayout {
  const { width, height } = useWindowDimensions();
  return useMemo(() => deviceLayout(width, height), [width, height]);
}
