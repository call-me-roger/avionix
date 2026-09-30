import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import Svg, { Circle } from 'react-native-svg';

declare global {
  // React reads this flag to enable act() in non-RTL environments.
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('react-native-svg on the web', () => {
  it('renders an svg element', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <Svg width={100} height={100} viewBox="0 0 200 200">
          <Circle cx={100} cy={100} r={90} fill="#000000" />
        </Svg>,
      );
    });
    expect(host.querySelector('svg')).not.toBeNull();
    expect(host.querySelector('circle')).not.toBeNull();
    await act(async () => root.unmount());
    host.remove();
  });
});
