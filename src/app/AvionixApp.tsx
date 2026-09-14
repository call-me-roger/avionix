import { StatusBar } from 'expo-status-bar';
import React, { useMemo } from 'react';

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
  return (
    <ServicesProvider services={services}>
      <ThemeProvider storage={services.settingsStorage}>
        <ThemedStatusBar />
        <MvpScreen />
      </ThemeProvider>
    </ServicesProvider>
  );
}
