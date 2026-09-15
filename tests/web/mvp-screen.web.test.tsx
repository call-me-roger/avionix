import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { MVP_DATAREF_NAMES } from '@/application/mvp-bindings';
import { initialSnapshot } from '@/application/session-snapshot';
import { createMemorySettingsStorage } from '@/application/settings-store';
import { Store } from '@/application/store';
import { type AppServices, ServicesProvider } from '@/app/services-context';
import { MvpScreen } from '@/features/mvp/MvpScreen';
import { ThemeProvider } from '@/theme/theme-context';

declare global {
  // React reads this flag to enable act() in non-RTL environments.
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function services(): AppServices {
  return {
    settingsStorage: createMemorySettingsStorage(),
    session: {
      store: new Store(initialSnapshot(MVP_DATAREF_NAMES)),
      connect: async () => undefined,
      disconnect: () => undefined,
      writeHeading: async () => undefined,
      activateHeadingUp: async () => undefined,
    },
  };
}

describe('MvpScreen on react-native-web', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders the screen and the theme toggle as DOM', async () => {
    const s = services();
    await act(async () => {
      root.render(
        <ServicesProvider services={s}>
          <ThemeProvider storage={s.settingsStorage} systemSchemeOverride="light">
            <MvpScreen />
          </ThemeProvider>
        </ServicesProvider>,
      );
    });
    // let the async settings/theme loads settle
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const text = container.textContent ?? '';
    expect(text).toContain('Avionix');
    expect(text).toContain('Status: disconnected');
    expect(container.querySelector('[aria-label="Theme Dark"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="mvp-screen"]')).not.toBeNull();
  });
});
