import type { HardwareKeyEvent } from '@/domain/cdu/hardware-keys';

/**
 * iOS and Android expose no hardware-key API without a native module (spec §4.8): the CDU's
 * on-screen keys are the only input there. `handler` is never called; the unsubscribe is a no-op.
 */
export function subscribeHardwareKeys(_handler: (event: HardwareKeyEvent) => boolean): () => void {
  return () => undefined;
}
