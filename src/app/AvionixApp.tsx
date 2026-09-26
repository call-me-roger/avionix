import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createAppServices } from '@/app/composition-root';
import { ServicesProvider } from '@/app/services-context';
import { AppShell } from '@/features/shell/AppShell';
import { ThemeProvider, useTheme } from '@/theme/theme-context';

function ThemedStatusBar() {
  const theme = useTheme();
  return <StatusBar style={theme.mode === 'light' ? 'dark' : 'light'} />;
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
    <SafeAreaProvider>
      <ServicesProvider services={services}>
        <ThemeProvider storage={services.settingsStorage}>
          <ThemedStatusBar />
          <AppShell />
        </ThemeProvider>
      </ServicesProvider>
    </SafeAreaProvider>
  );
}
