import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Pressable, Text } from 'react-native';

import { PANEL_LAYOUT_STORAGE_KEY } from '@/application/panel-layout';
import { type SettingsStorage, createMemorySettingsStorage } from '@/application/settings-store';
import { usePanelLayout } from '@/hooks/usePanelLayout';

const KNOWN = ['flight-data', 'heading'];

function Probe({ storage }: { storage: SettingsStorage }) {
  const { layout, ready, setLast, setHidden, setStrip } = usePanelLayout(storage, KNOWN);
  return (
    <>
      <Text testID="state">{`${ready ? 'ready' : 'loading'} ${layout.last} ${layout.hidden.join(',')} ${layout.strip ? 'strip' : 'nostrip'}`}</Text>
      <Pressable accessibilityRole="button" onPress={() => setLast('heading')}>
        <Text>go heading</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => setLast('setup')}>
        <Text>go setup</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => setHidden('flight-data', true)}>
        <Text>hide basic</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => setStrip(false)}>
        <Text>hide strip</Text>
      </Pressable>
    </>
  );
}

describe('usePanelLayout', () => {
  it('loads the stored layout', async () => {
    const storage = createMemorySettingsStorage();
    await storage.setItem(
      PANEL_LAYOUT_STORAGE_KEY,
      JSON.stringify({ hidden: ['heading'], last: 'flight-data', strip: true }),
    );
    await render(<Probe storage={storage} />);
    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('ready flight-data heading strip'),
    );
  });

  it('saves the last route and a hidden panel', async () => {
    const storage = createMemorySettingsStorage();
    await render(<Probe storage={storage} />);
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready setup strip'));
    await fireEvent.press(screen.getByText('go heading'));
    await fireEvent.press(screen.getByText('hide basic'));
    await waitFor(async () =>
      expect(JSON.parse((await storage.getItem(PANEL_LAYOUT_STORAGE_KEY)) ?? 'null')).toEqual({
        hidden: ['flight-data'],
        last: 'heading',
        strip: true,
      }),
    );
  });

  it('saves the strip setting', async () => {
    const storage = createMemorySettingsStorage();
    await render(<Probe storage={storage} />);
    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('ready setup strip'));
    await fireEvent.press(screen.getByText('hide strip'));
    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('ready setup nostrip'),
    );
    await waitFor(async () =>
      expect(JSON.parse((await storage.getItem(PANEL_LAYOUT_STORAGE_KEY)) ?? 'null')).toEqual({
        hidden: [],
        last: 'setup',
        strip: false,
      }),
    );
  });

  it('a choice made before the stored layout loads is not overwritten', async () => {
    let release: (value: string | null) => void = () => undefined;
    const storage: SettingsStorage = {
      getItem: () => new Promise<string | null>((resolve) => (release = resolve)),
      setItem: jest.fn(async () => undefined),
    };
    await render(<Probe storage={storage} />);
    await fireEvent.press(screen.getByText('go heading'));
    release(JSON.stringify({ hidden: [], last: 'flight-data', strip: true }));
    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('ready heading strip'),
    );
  });

  it('a change that changes nothing before the stored layout loads does not discard it', async () => {
    let release: (value: string | null) => void = () => undefined;
    const storage: SettingsStorage = {
      getItem: () => new Promise<string | null>((resolve) => (release = resolve)),
      setItem: jest.fn(async () => undefined),
    };
    await render(<Probe storage={storage} />);
    // The status bar is pressable before the layout loads; on Setup already, that is a no-op.
    await fireEvent.press(screen.getByText('go setup'));
    release(JSON.stringify({ hidden: ['heading'], last: 'flight-data', strip: true }));
    await waitFor(() =>
      expect(screen.getByTestId('state')).toHaveTextContent('ready flight-data heading strip'),
    );
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
