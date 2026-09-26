import React, { createContext, useContext } from 'react';

import type { ConnectorDiscovery } from '@/application/connector-discovery';
import type { HealthMonitor } from '@/application/health-monitor';
import type { SettingsStorage } from '@/application/settings-store';
import type { SimulatorSession } from '@/application/simulator-session';

export type SessionApi = Pick<
  SimulatorSession,
  'store' | 'connect' | 'disconnect' | 'pair' | 'write' | 'activate' | 'recheckCompatibility'
>;

export type DiscoveryApi = Pick<ConnectorDiscovery, 'store' | 'start' | 'stop'>;

export type HealthMonitorApi = Pick<HealthMonitor, 'start' | 'stop' | 'refresh'>;

export interface AppServices {
  session: SessionApi;
  discovery: DiscoveryApi;
  settingsStorage: SettingsStorage;
  healthMonitor: HealthMonitorApi;
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
