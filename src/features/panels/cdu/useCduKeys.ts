import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

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

/** A shown message, wrapped so a repeat of the same text is still a new object: the clearing
 * effect below keys off identity, so an identical message restarts its own MESSAGE_MS.
 * `clearsAfter` is the queue's last press number when it appeared: only the answer to a key pressed
 * after it clears it early, so the keys still draining from before "Too many keys waiting" (or
 * dropped behind a failure) can never wipe it before the pilot has read it. */
interface Shown {
  text: string;
  clearsAfter: number;
}

/** Which `(unit, controlsEnabled)` pair a built queue serves. */
export interface QueueTag {
  unit: CduUnit;
  controlsEnabled: boolean;
}

/**
 * Whether a queue built for `builtFor` may still serve a press made while the hook renders
 * `current`. The queue is (re)built in an effect, which can run one render behind the props it
 * depends on; comparing tags here means a press made in that gap is dropped rather than misrouted
 * to a queue built for a different unit, or sent while the link is actually inert (C2, C5).
 */
export function queueTagMatches(builtFor: QueueTag | null, current: QueueTag): boolean {
  return (
    builtFor !== null &&
    builtFor.unit === current.unit &&
    builtFor.controlsEnabled === current.controlsEnabled
  );
}

/**
 * Queues CDU key presses for one unit and turns the queue's events into the one message a screen
 * shows (never a per-key toast) and the SLOW lamp. A queue exists only while `link.controlsEnabled`
 * is true (C5: every key is disabled, not just visibly, while values are not current), and a fresh
 * one replaces it whenever `unit` or `controlsEnabled` changes — dropping whatever waited and
 * silencing whatever was in flight (C2, C5) — which also covers unmount.
 *
 * Two defences close the gap between a render committing a new `unit`/`controlsEnabled` and the
 * queue effect catching up: the effect runs in `useLayoutEffect`, inside the commit, before anything
 * else can run; and `press` itself refuses to use a queue whose tag (`queueTagMatches`) disagrees
 * with the render it was called from, dropping the key rather than risking a misroute if a queue
 * ever is built on a later, non-synchronous pass.
 *
 * `send` reads `activate` through a ref kept current by its own effect, so an in-flight press still
 * resolves correctly even though `usePanel()` hands back a new function every render.
 */
export function useCduKeys(unit: CduUnit): CduKeys {
  const { activate, link } = usePanel();
  const [shown, setShown] = useState<Shown | null>(null);
  const [slow, setSlow] = useState(false);

  const activateRef = useRef(activate);
  const queueRef = useRef<{ tag: QueueTag; queue: CduKeyQueue } | null>(null);
  const slowTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    activateRef.current = activate;
  }, [activate]);

  useLayoutEffect(() => {
    if (!link.controlsEnabled) {
      return undefined;
    }
    const applySlow = (elapsedMs: number) => {
      if (elapsedMs <= SLOW_KEY_MS) {
        return;
      }
      setSlow(true);
      if (slowTimeoutRef.current !== null) {
        clearTimeout(slowTimeoutRef.current);
      }
      slowTimeoutRef.current = setTimeout(() => {
        slowTimeoutRef.current = null;
        setSlow(false);
      }, SLOW_SHOWN_MS);
    };
    const queue = new CduKeyQueue(
      (keyId) => activateRef.current(cduKeysFeatureId(unit), cduCommand(unit, keyId)),
      () => Date.now(),
      (event) => {
        switch (event.kind) {
          case 'sent':
            setShown((current) =>
              current !== null && event.seq > current.clearsAfter ? null : current,
            );
            applySlow(event.elapsedMs);
            return;
          case 'failed':
            setShown({
              // Never the raw id (R12): a key outside the catalogue is just "that key".
              text: keyFailedMessage(cduKey(event.key)?.name ?? null, event.result, event.dropped),
              clearsAfter: event.seq + event.dropped,
            });
            applySlow(event.elapsedMs);
            return;
          case 'full':
            setShown({ text: QUEUE_FULL_MESSAGE, clearsAfter: event.lastSeq });
            return;
        }
      },
    );
    queueRef.current = { tag: { unit, controlsEnabled: link.controlsEnabled }, queue };
    return () => {
      queue.clear();
      queueRef.current = null;
      if (slowTimeoutRef.current !== null) {
        clearTimeout(slowTimeoutRef.current);
        slowTimeoutRef.current = null;
      }
      setShown(null);
      setSlow(false);
    };
  }, [unit, link.controlsEnabled]);

  // A message clears itself after MESSAGE_MS, or sooner when it changes (including to null). Keyed
  // on `shown`'s identity, so showing the very same text again still gets its own full MESSAGE_MS.
  useEffect(() => {
    if (shown === null) {
      return undefined;
    }
    const timeout = setTimeout(() => {
      setShown((current) => (current === shown ? null : current));
    }, MESSAGE_MS);
    return () => clearTimeout(timeout);
  }, [shown]);

  const press = useCallback(
    (keyId: string) => {
      const built = queueRef.current;
      if (
        built === null ||
        !queueTagMatches(built.tag, { unit, controlsEnabled: link.controlsEnabled })
      ) {
        return;
      }
      built.queue.press(keyId);
    },
    [unit, link.controlsEnabled],
  );

  return { press, message: shown?.text ?? null, slow };
}
