import { StatusBar } from 'expo-status-bar';
import React, { useMemo } from 'react';

import { createAppServices } from '@/app/composition-root';
import { ServicesProvider } from '@/app/services-context';
import { MvpScreen } from '@/features/mvp/MvpScreen';

export function AvionixApp() {
  const services = useMemo(() => createAppServices(), []);
  return (
    <ServicesProvider services={services}>
      <StatusBar style="auto" />
      <MvpScreen />
    </ServicesProvider>
  );
}
