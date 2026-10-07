import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { type HoldEnd, HoldLease, RESPONSE_CHECK_MS } from '@/domain/panels/hold-lease';
import { holdBackgrounded, holdLinkLost } from '@/domain/systems/messages';
import { usePanel } from '@/features/panels/primitives/PanelContext';
import { useAppForeground } from '@/hooks/useAppForeground';

export interface HoldControlOptions {
  featureId: string;
  command: string;
  capMs: number;
  /** Lower case, for sentences: "pitch trim", "starter 1". */
  name: string;
  /** The value that should move while held (trim position, starter lamp); null when unknown. */
  value: number | null;
  /** Shown when the cap ends a hold. */
  cappedMessage: string;
  /** Shown when a hold of RESPONSE_CHECK_MS or more moved nothing. */
  noResponseMessage: string;
  /** Not moving is no failure here (trim already at the end it was driven toward). */
  atLimit?: (value: number | null) => boolean;
  /**
   * The key's own availability (its command resolved, its feature usable); default true. A hold
   * ends, release sent, when it turns false, without a sentence: the unit already names the key.
   */
  enabled?: boolean;
}

export interface HoldControl {
  start: () => void;
  end: () => void;
  held: boolean;
  message: string | null;
}

/**
 * One hold key's lease (F-24 §4.3, R4, R5). A lease exists only while controls are enabled, the
 * app is in the foreground and the key itself is enabled; a fresh one replaces it when the command
 * or any condition changes, and the old one is cancelled (release sent), which also covers
 * unmount. The message for a hold the panel ended (link lost, backgrounded) is set while
 * rendering, from the same props that end it, so it can never be missed; the lease's own end
 * (cap, no response) sets it from `onEnd`. A touch inside a tap's minimum-hold tail joins that
 * hold (HoldLease's merge). Refs are read and written only in effects and handlers.
 */
export function useHoldControl(options: HoldControlOptions): HoldControl {
  const { hold, link } = usePanel();
  const foreground = useAppForeground();
  const [held, setHeld] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const holdRef = useRef(hold);
  const optionsRef = useRef(options);
  const leaseRef = useRef<{ tag: string; lease: HoldLease } | null>(null);
  const valueRef = useRef(options.value);
  const startValueRef = useRef<number | null>(null);
  const movedRef = useRef(false);

  useEffect(() => {
    holdRef.current = hold;
  }, [hold]);
  useEffect(() => {
    optionsRef.current = options;
  });
  useEffect(() => {
    if (leaseRef.current?.lease.held === true && options.value !== startValueRef.current) {
      movedRef.current = true;
    }
    valueRef.current = options.value;
  }, [options.value]);

  const linked = link.controlsEnabled && foreground;
  const active = linked && options.enabled !== false;
  if (held && !active) {
    setHeld(false);
    if (!linked) {
      setMessage(
        link.controlsEnabled ? holdBackgrounded(options.name) : holdLinkLost(options.name),
      );
    }
  }

  const { featureId, command, capMs } = options;
  const tag = `${featureId}|${command}`;
  useLayoutEffect(() => {
    if (!active) {
      return undefined;
    }
    const lease = new HoldLease({
      send: (phase) => holdRef.current(featureId, command, phase),
      capMs,
      onEnd: (end: HoldEnd, heldMs: number) => {
        setHeld(false);
        const current = optionsRef.current;
        if (end === 'capped') {
          setMessage(current.cappedMessage);
          return;
        }
        if (end === 'released' && heldMs >= RESPONSE_CHECK_MS && startValueRef.current !== null) {
          const moved = movedRef.current || (current.atLimit?.(valueRef.current) ?? false);
          if (!moved) {
            setMessage(current.noResponseMessage);
          }
        }
      },
    });
    leaseRef.current = { tag: `${featureId}|${command}`, lease };
    return () => {
      lease.cancel();
      if (leaseRef.current?.lease === lease) {
        leaseRef.current = null;
      }
    };
  }, [featureId, command, capMs, active]);

  const start = useCallback(() => {
    const built = leaseRef.current;
    if (built === null || built.tag !== tag || !active) {
      return;
    }
    if (built.lease.held) {
      // A touch inside a tap's minimum-hold tail continues that hold (HoldLease merges it): its
      // start value, moved flag and message stay those of the hold it joins.
      if (built.lease.releasing) {
        built.lease.press();
      }
      return;
    }
    startValueRef.current = valueRef.current;
    movedRef.current = false;
    setMessage(null);
    setHeld(true);
    built.lease.press();
  }, [tag, active]);

  const end = useCallback(() => {
    leaseRef.current?.lease.release();
  }, []);

  return { start, end, held, message };
}
