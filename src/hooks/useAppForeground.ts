import { useSyncExternalStore } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

function subscribe(onChange: () => void): () => void {
  const subscription = AppState.addEventListener('change', onChange);
  return () => subscription.remove();
}

/**
 * Only `background` counts as not in the foreground. iOS reports `inactive` during app
 * switching and the control centre, and Android reports `unknown` briefly at launch; both keep
 * discovery running rather than clearing and restarting the list.
 */
export function isForeground(status: AppStateStatus): boolean {
  return status !== 'background';
}

export function useAppForeground(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isForeground(AppState.currentState),
    () => true,
  );
}
