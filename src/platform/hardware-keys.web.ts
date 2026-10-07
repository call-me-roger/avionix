import type { HardwareKeyEvent } from '@/domain/cdu/hardware-keys';

/** Typing into one of these (or anything `contenteditable`) is never a CDU key press. */
const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isEditing(target: Element | null): boolean {
  if (target === null) {
    return false;
  }
  return EDITABLE_TAGS.has(target.tagName) || (target as HTMLElement).isContentEditable;
}

/**
 * A physical keyboard on the web build (spec §4.8): every `keydown` on `window`, skipped while
 * something editable has focus. `handler` (`hardwareKeyToCdu` plus the panel's own gating) decides
 * whether the key is a CDU key it can act on right now; when it returns true, `preventDefault`
 * stops the browser's own binding for it (PageDown scrolling the page, say) from also firing.
 */
export function subscribeHardwareKeys(handler: (event: HardwareKeyEvent) => boolean): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }
  const listener = (event: KeyboardEvent): void => {
    if (isEditing(document.activeElement)) {
      return;
    }
    const consumed = handler({
      key: event.key,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
    });
    if (consumed) {
      event.preventDefault();
    }
  };
  window.addEventListener('keydown', listener);
  return () => window.removeEventListener('keydown', listener);
}
