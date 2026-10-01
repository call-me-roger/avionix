import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

describe('react-native-svg on native', () => {
  it('renders a drawing inside an accessible view', async () => {
    await render(
      <View accessible accessibilityLabel="drawing">
        <Svg width={100} height={100} viewBox="0 0 200 200">
          <Circle cx={100} cy={100} r={90} fill="#000000" />
        </Svg>
      </View>,
    );
    expect(screen.getByLabelText('drawing')).toBeTruthy();
  });
});
