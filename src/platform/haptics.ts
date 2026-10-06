type HapticsModule = typeof import('expo-haptics');

let loaded: HapticsModule | null | undefined;

/** Required lazily and once: a development build without the native module just has no haptics. */
function haptic(): HapticsModule | null {
  if (loaded === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      loaded = require('expo-haptics') as HapticsModule;
    } catch {
      loaded = null;
    }
  }
  return loaded;
}

function fire(run: (module: HapticsModule) => Promise<void>): void {
  const module = haptic();
  if (module === null) {
    return;
  }
  try {
    run(module).catch(() => undefined);
  } catch {
    // A missing native method throws synchronously on some builds; haptics are never load-bearing.
  }
}

/** R-01: a light tick on every key, an error buzz when X-Plane refuses. Never throws, never logs. */
export const haptics = {
  press(): void {
    fire((module) => module.impactAsync(module.ImpactFeedbackStyle.Light));
  },
  failure(): void {
    fire((module) => module.notificationAsync(module.NotificationFeedbackType.Error));
  },
};
