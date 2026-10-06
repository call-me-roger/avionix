import { connectionSteps, stepsLabel } from '@/domain/connection/connection-steps';

const states = (s: ReturnType<typeof connectionSteps>) => s.map((step) => step.state);

describe('connectionSteps', () => {
  it('starts at Find with no saved address', () => {
    expect(states(connectionSteps('disconnected', false, false))).toEqual([
      'current',
      'todo',
      'todo',
      'todo',
    ]);
  });
  it('starts at Connect when an address is known', () => {
    expect(states(connectionSteps('disconnected', false, true))).toEqual([
      'done',
      'current',
      'todo',
      'todo',
    ]);
  });
  it('treats a failed attempt like a stop at Connect', () => {
    expect(states(connectionSteps('error', false, true))).toEqual([
      'done',
      'current',
      'todo',
      'todo',
    ]);
  });
  it('is at Connect while connecting or reconnecting', () => {
    for (const state of ['connecting', 'reconnecting'] as const) {
      expect(states(connectionSteps(state, false, true))).toEqual([
        'done',
        'current',
        'todo',
        'todo',
      ]);
    }
  });
  it('is at Pair while pairing', () => {
    expect(states(connectionSteps('pairing', false, true))).toEqual([
      'done',
      'done',
      'current',
      'todo',
    ]);
  });
  it('is at Live while connected but not live', () => {
    expect(states(connectionSteps('connected', false, true))).toEqual([
      'done',
      'done',
      'done',
      'current',
    ]);
  });
  it('is all done when connected and live', () => {
    expect(states(connectionSteps('connected', true, true))).toEqual([
      'done',
      'done',
      'done',
      'done',
    ]);
  });
  it('names the labels in order', () => {
    expect(connectionSteps('disconnected', false, false).map((s) => s.label)).toEqual([
      'Find',
      'Connect',
      'Pair',
      'Live',
    ]);
  });
  it('speaks the current step', () => {
    expect(
      stepsLabel(connectionSteps('pairing', false, true), 'Waiting for the pairing code'),
    ).toBe('Step 3 of 4, Pair: Waiting for the pairing code');
    expect(stepsLabel(connectionSteps('connected', true, true), 'Connected')).toBe(
      'All steps done: Connected',
    );
  });
});
