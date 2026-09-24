import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo } from 'react';

import { createAppServices } from '@/app/composition-root';
import { ServicesProvider } from '@/app/services-context';
import { MvpScreen } from '@/features/mvp/MvpScreen';
import { ThemeProvider, useTheme } from '@/theme/theme-context';

function ThemedStatusBar() {
  const theme = useTheme();
  return <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />;
}

export function AvionixApp() {
  const services = useMemo(() => createAppServices(), []);

  // The monitor's tick must not outlive the app: started here, on mount, and stopped on
  // unmount so no timer keeps running past the component's life (or past a test render).
  useEffect(() => {
    services.healthMonitor.start();
    return () => services.healthMonitor.stop();
  }, [services]);

  return (
    <ServicesProvider services={services}>
      <ThemeProvider storage={services.settingsStorage}>
        <ThemedStatusBar />
        <MvpScreen />
      </ThemeProvider>
    </ServicesProvider>
  );
}
