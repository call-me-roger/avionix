import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { Text } from 'react-native';

import { MVP_DATAREF_NAMES } from '@/application/mvp-bindings';
import { initialSnapshot } from '@/application/session-snapshot';
import { createMemorySettingsStorage, saveConnectionSettings } from '@/application/settings-store';
import { Store } from '@/application/store';
import { type AppServices, ServicesProvider } from '@/app/services-context';
import { useConnectionSettings } from '@/hooks/useConnectionSettings';
import { platformDefaultConnection } from '@/platform/default-connection';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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

function Probe() {
  const settings = useConnectionSettings();
  return (
    <Text testID="probe">
      {settings.ready ? 'ready' : 'loading'}|{settings.host}|{settings.port}
    </Text>
  );
}

async function renderProbe(s: AppServices): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ServicesProvider services={s}>
        <Probe />
      </ServicesProvider>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { container, root };
}

async function cleanup(handle: { container: HTMLDivElement; root: Root }): Promise<void> {
  await act(async () => {
    handle.root.unmount();
  });
  handle.container.remove();
}

describe('connection defaults on web', () => {
  it('derives the default from the page origin', () => {
    // jsdom serves the test page from http://localhost/
    expect(platformDefaultConnection()).toEqual({ host: 'localhost', port: 80 });
  });

  it('prefills the form from the page origin when nothing is stored', async () => {
    const handle = await renderProbe(services());
    expect(handle.container.textContent).toBe('ready|localhost|80');
    await cleanup(handle);
  });

  it('prefers stored settings over the page origin', async () => {
    const storage = createMemorySettingsStorage();
    await saveConnectionSettings(storage, { host: '10.0.0.5', port: 8087 });
    const handle = await renderProbe(services(storage));
    expect(handle.container.textContent).toBe('ready|10.0.0.5|8087');
    await cleanup(handle);
  });
});
