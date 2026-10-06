import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createAppServices } from '@/app/composition-root';
import { ServicesProvider } from '@/app/services-context';
import { AppShell } from '@/features/shell/AppShell';
import { loadAvionicsFonts } from '@/platform/fonts';
import { ThemeProvider, useTheme } from '@/theme/theme-context';

function ThemedStatusBar() {
  const theme = useTheme();
  return <StatusBar style={theme.mode === 'light' ? 'dark' : 'light'} />;
}

export function AvionixApp() {
  const services = useMemo(() => createAppServices(), []);
  const [fontsLoaded, setFontsLoaded] = useState(false);

  // The monitor's tick must not outlive the app: started here, on mount, and stopped on
  // unmount so no timer keeps running past the component's life (or past a test render).
  useEffect(() => {
    services.healthMonitor.start();
    return () => services.healthMonitor.stop();
  }, [services]);

  // Loads the B612 avionics fonts in the background (R-01). Never blocks rendering: the theme
  // falls back to the system font until this resolves, and silently stays there if it fails.
  useEffect(() => {
    let cancelled = false;
    loadAvionicsFonts().then((ok) => {
      if (!cancelled) {
        setFontsLoaded(ok);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaProvider>
      <ServicesProvider services={services}>
        <ThemeProvider storage={services.settingsStorage} fontsLoaded={fontsLoaded}>
          <ThemedStatusBar />
          <AppShell />
        </ThemeProvider>
      </ServicesProvider>
    </SafeAreaProvider>
  );
}
