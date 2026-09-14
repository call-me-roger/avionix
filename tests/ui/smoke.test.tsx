import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

describe('expo test project', () => {
  it('renders a React Native component', async () => {
    await render(<Text>Avionix</Text>);
    expect(screen.getByText('Avionix')).toBeTruthy();
  });
});
