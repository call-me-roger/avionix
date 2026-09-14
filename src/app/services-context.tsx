import React, { createContext, useContext } from 'react';

import type { SettingsStorage } from '@/application/settings-store';
import type { SimulatorSession } from '@/application/simulator-session';

export type SessionApi = Pick<
  SimulatorSession,
  'store' | 'connect' | 'disconnect' | 'writeHeading' | 'activateHeadingUp'
>;

export interface AppServices {
  session: SessionApi;
  settingsStorage: SettingsStorage;
}

const ServicesContext = createContext<AppServices | null>(null);

export function ServicesProvider({
  services,
  children,
}: {
  services: AppServices;
  children: React.ReactNode;
}) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): AppServices {
  const services = useContext(ServicesContext);
  if (services === null) {
    throw new Error('useServices must be used inside ServicesProvider');
  }
  return services;
}
