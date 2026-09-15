import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';

import { createMemorySettingsStorage, saveConnectionSettings } from '@/application/settings-store';
import { type AppServices, ServicesProvider } from '@/app/services-context';
import { useConnectionSettings } from '@/hooks/useConnectionSettings';
import { MVP_DATAREF_NAMES } from '@/application/mvp-bindings';
import { initialSnapshot } from '@/application/session-snapshot';
import { Store } from '@/application/store';

function wrapperFor(services: AppServices) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <ServicesProvider services={services}>{children}</ServicesProvider>;
  };
}

function services(storage = createMemorySettingsStorage()): AppServices {
  return {
    settingsStorage: storage,
    session: {
      store: new Store(initialSnapshot(MVP_DATAREF_NAMES)),
      connect: async () => undefined,
      disconnect: () => undefined,
      writeHeading: async () => undefined,
      activateHeadingUp: async () => undefined,
    },
  };
}

describe('useConnectionSettings', () => {
  it('loads persisted values and persists edits', async () => {
    const storage = createMemorySettingsStorage();
    await saveConnectionSettings(storage, { host: '10.0.0.5', port: 8090 });
    const { result } = await renderHook(() => useConnectionSettings(), {
      wrapper: wrapperFor(services(storage)),
    });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.host).toBe('10.0.0.5');
    expect(result.current.port).toBe('8090');
    await act(() => result.current.setHost('10.0.0.9'));
    await act(async () => {
      await result.current.persist();
    });
    expect(await storage.getItem('avionix.connection')).toBe(
      JSON.stringify({ host: '10.0.0.9', port: 8090 }),
    );
  });

  it('does not persist an unparseable port', async () => {
    const storage = createMemorySettingsStorage();
    const { result } = await renderHook(() => useConnectionSettings(), {
      wrapper: wrapperFor(services(storage)),
    });
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(() => result.current.setPort('abc'));
    await act(async () => {
      await result.current.persist();
    });
    expect(await storage.getItem('avionix.connection')).toBeNull();
  });

  it('does not persist an out-of-range port', async () => {
    const storage = createMemorySettingsStorage();
    const { result } = await renderHook(() => useConnectionSettings(), {
      wrapper: wrapperFor(services(storage)),
    });
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(() => result.current.setPort('99999'));
    await act(async () => {
      await result.current.persist();
    });
    expect(await storage.getItem('avionix.connection')).toBeNull();
  });

  it('keeps the empty default host on native when nothing is stored', async () => {
    const { result } = await renderHook(() => useConnectionSettings(), {
      wrapper: wrapperFor(services()),
    });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.host).toBe('');
    expect(result.current.port).toBe('8086');
  });
});
