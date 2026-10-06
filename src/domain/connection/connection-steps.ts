import type { ConnectionState } from '@/domain/connection/connection-state';

export type StepState = 'done' | 'current' | 'todo';

export interface ConnectionStep {
  key: 'find' | 'connect' | 'pair' | 'live';
  label: string;
  state: StepState;
}

const STEPS = [
  { key: 'find', label: 'Find' },
  { key: 'connect', label: 'Connect' },
  { key: 'pair', label: 'Pair' },
  { key: 'live', label: 'Live' },
] as const;

/** Where the pilot is on the way to live values (R-01 Setup); 4 means every step is done. */
function currentIndex(state: ConnectionState, live: boolean, hasHost: boolean): number {
  switch (state) {
    case 'disconnected':
    case 'error':
      return hasHost ? 1 : 0;
    case 'connecting':
    case 'reconnecting':
      return 1;
    case 'pairing':
      return 2;
    case 'connected':
      return live ? 4 : 3;
  }
}

export function connectionSteps(
  state: ConnectionState,
  live: boolean,
  hasHost: boolean,
): ConnectionStep[] {
  const current = currentIndex(state, live, hasHost);
  return STEPS.map((step, index) => ({
    ...step,
    state: index < current ? 'done' : index === current ? 'current' : 'todo',
  }));
}

export function stepsLabel(steps: readonly ConnectionStep[], detail: string): string {
  const index = steps.findIndex((step) => step.state === 'current');
  const current = steps.find((step) => step.state === 'current');
  if (index === -1 || current === undefined) {
    return `All steps done: ${detail}`;
  }
  return `Step ${index + 1} of ${steps.length}, ${current.label}: ${detail}`;
}
