import { render } from '@testing-library/react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import React from 'react';

import { useScreenKeepAwake } from '@/hooks/useScreenKeepAwake';
import { KEEP_AWAKE_TAG, holdScreenAwake, releaseScreenAwake } from '@/platform/keep-awake';

jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(async () => undefined),
  deactivateKeepAwake: jest.fn(async () => undefined),
}));

const activate = activateKeepAwakeAsync as jest.MockedFunction<typeof activateKeepAwakeAsync>;
const deactivate = deactivateKeepAwake as jest.MockedFunction<typeof deactivateKeepAwake>;

function Probe({ hold }: { hold: boolean }) {
  useScreenKeepAwake(hold);
  return null;
}

beforeEach(() => {
  activate.mockClear();
  deactivate.mockClear();
});

describe('keep-awake wrapper', () => {
  it('holds and releases under the Avionix tag', async () => {
    await holdScreenAwake();
    await releaseScreenAwake();
    expect(KEEP_AWAKE_TAG).toBe('avionix-panel');
    expect(activate).toHaveBeenCalledWith('avionix-panel');
    expect(deactivate).toHaveBeenCalledWith('avionix-panel');
  });

  it('never rejects when the platform refuses, as a browser without a wake lock does', async () => {
    const refusal = Object.assign(new Error('Wake lock refused'), { name: 'NotAllowedError' });
    activate.mockRejectedValueOnce(refusal);
    deactivate.mockRejectedValueOnce(refusal);
    await expect(holdScreenAwake()).resolves.toBeUndefined();
    await expect(releaseScreenAwake()).resolves.toBeUndefined();
  });

  it('releases only after a hold still in flight has settled, as a slow browser wake lock does', async () => {
    const events: string[] = [];
    let grant: () => void = () => undefined;
    activate.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          grant = () => {
            events.push('held');
            resolve();
          };
        }),
    );
    deactivate.mockImplementationOnce(async () => {
      events.push('released');
    });
    const holding = holdScreenAwake();
    const releasing = releaseScreenAwake();
    for (let i = 0; i < 10; i += 1) {
      await Promise.resolve();
    }
    // The release waits for the request it would otherwise race.
    expect(deactivate).not.toHaveBeenCalled();
    grant();
    await Promise.all([holding, releasing]);
    expect(events).toEqual(['held', 'released']);
  });

  it('never rejects when the platform throws synchronously', async () => {
    activate.mockImplementationOnce(() => {
      throw new Error('no native module');
    });
    await expect(holdScreenAwake()).resolves.toBeUndefined();
  });
});

describe('useScreenKeepAwake', () => {
  it('holds while asked, releases when no longer asked and on unmount', async () => {
    const { rerender, unmount } = await render(<Probe hold />);
    expect(activate).toHaveBeenCalledTimes(1);
    await rerender(<Probe hold={false} />);
    expect(deactivate).toHaveBeenCalledTimes(1);
    await rerender(<Probe hold />);
    expect(activate).toHaveBeenCalledTimes(2);
    await unmount();
    expect(deactivate).toHaveBeenCalledTimes(2);
  });

  it('does nothing while not asked', async () => {
    await render(<Probe hold={false} />);
    expect(activate).not.toHaveBeenCalled();
  });
});
