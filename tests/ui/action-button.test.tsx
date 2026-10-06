import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { createMemorySettingsStorage } from '@/application/settings-store';
import { ActionButton } from '@/theme/ActionButton';
import { ThemeProvider } from '@/theme/theme-context';
import { lightTheme } from '@/theme/tokens';

async function renderButton(props: Partial<React.ComponentProps<typeof ActionButton>> = {}) {
  const onPress = jest.fn();
  await render(
    <ThemeProvider storage={createMemorySettingsStorage()}>
      <ActionButton title="Connect" onPress={onPress} {...props} />
    </ThemeProvider>,
  );
  return onPress;
}

describe('ActionButton', () => {
  it('renders the title, with the role button named after it', async () => {
    await renderButton();
    expect(screen.getByText('Connect')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeTruthy();
  });

  it('marks itself disabled and refuses to press', async () => {
    const onPress = await renderButton({ disabled: true });
    const button = screen.getByRole('button', { name: 'Connect' });
    expect(button.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('marks itself busy, shows a spinner and refuses to press', async () => {
    const onPress = await renderButton({ busy: true });
    const button = screen.getByRole('button', { name: 'Connect' });
    expect(button.props.accessibilityState.busy).toBe(true);
    expect(screen.getByTestId('action-button-busy')).toBeTruthy();
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('draws the destructive variant in colors.danger', async () => {
    await renderButton({ title: 'Disconnect', variant: 'destructive' });
    const text = screen.getByText('Disconnect');
    const flat = Array.isArray(text.props.style)
      ? Object.assign({}, ...text.props.style)
      : text.props.style;
    expect(flat.color).toBe(lightTheme.colors.danger);
  });
});
