export interface HardwareKeyEvent {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  /** The platform's auto-repeat for a held key: never a press of its own (C2). */
  repeat: boolean;
}

const NAMED: Record<string, string> = {
  '.': 'key_period',
  '-': 'key_minus',
  '/': 'key_slash',
  ' ': 'key_space',
  Delete: 'key_delete',
  Backspace: 'key_back',
  Escape: 'key_clear',
  PageUp: 'prev',
  PageDown: 'next',
};

/**
 * A physical keyboard key as a CDU key id (web build, spec §4.8). Enter is deliberately unmapped:
 * EXEC commits a route change and stays a tap. Shortcuts (Ctrl, Alt, Meta) belong to the browser.
 */
export function hardwareKeyToCdu(event: HardwareKeyEvent): string | null {
  if (event.ctrlKey || event.altKey || event.metaKey) {
    return null;
  }
  if (/^[a-zA-Z0-9]$/.test(event.key)) {
    return `key_${event.key.toUpperCase()}`;
  }
  return NAMED[event.key] ?? null;
}
