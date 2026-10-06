import { useCallback, useEffect, useRef, useState } from 'react';

import { cduKeysFeatureId } from '@/domain/aircraft/profiles/generic';
import { CduKeyQueue, SLOW_KEY_MS } from '@/domain/cdu/key-queue';
import { type CduUnit, cduCommand, cduKey } from '@/domain/cdu/keys';
import { QUEUE_FULL_MESSAGE, keyFailedMessage } from '@/domain/cdu/messages';
import { usePanel } from '@/features/panels/primitives/PanelContext';

/** How long a queue message stays on screen before it clears itself. */
export const MESSAGE_MS = 8000;
/** How long the SLOW lamp stays lit after the last slow answer. */
export const SLOW_SHOWN_MS = 5000;

export interface CduKeys {
  press: (keyId: string) => void;
  message: string | null;
  slow: boolean;
}

/**
 * Queues CDU key presses for one unit and turns the queue's events into the one message a screen
 * shows (never a per-key toast) and the SLOW lamp. One queue exists per `(unit, controlsEnabled)`
 * pair: a unit switch or the link going inert tears the old queue down — dropping whatever waited
 * and silencing whatever was in flight (C1, C5) — and a fresh one takes over, which also covers
 * unmount. `send` reads `activate` through a ref kept current by its own effect, so an in-flight
 * press still resolves correctly even though `usePanel()` hands back a new function every render.
 */
export function useCduKeys(unit: CduUnit): CduKeys {
  const { activate, link } = usePanel();
  const [message, setMessage] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);

  const activateRef = useRef(activate);
  const queueRef = useRef<CduKeyQueue | null>(null);
  const slowTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    activateRef.current = activate;
  }, [activate]);

  useEffect(() => {
    const queue = new CduKeyQueue(
      (keyId) => activateRef.current(cduKeysFeatureId(unit), cduCommand(unit, keyId)),
      () => Date.now(),
      (event) => {
        switch (event.kind) {
          case 'sent':
            setMessage(null);
            if (event.elapsedMs > SLOW_KEY_MS) {
              setSlow(true);
              if (slowTimeoutRef.current !== null) {
                clearTimeout(slowTimeoutRef.current);
              }
              slowTimeoutRef.current = setTimeout(() => {
                slowTimeoutRef.current = null;
                setSlow(false);
              }, SLOW_SHOWN_MS);
            }
            return;
          case 'failed':
            setMessage(
              keyFailedMessage(cduKey(event.key)?.name ?? event.key, event.result, event.dropped),
            );
            return;
          case 'full':
            setMessage(QUEUE_FULL_MESSAGE);
            return;
        }
      },
    );
    queueRef.current = queue;
    return () => {
      queue.clear();
      queueRef.current = null;
      if (slowTimeoutRef.current !== null) {
        clearTimeout(slowTimeoutRef.current);
        slowTimeoutRef.current = null;
      }
      setMessage(null);
      setSlow(false);
    };
  }, [unit, link.controlsEnabled]);

  // A message clears itself after MESSAGE_MS, or sooner when it changes (including to null).
  useEffect(() => {
    if (message === null) {
      return undefined;
    }
    const timeout = setTimeout(() => setMessage(null), MESSAGE_MS);
    return () => clearTimeout(timeout);
  }, [message]);

  const press = useCallback((keyId: string) => {
    queueRef.current?.press(keyId);
  }, []);

  return { press, message, slow };
}
