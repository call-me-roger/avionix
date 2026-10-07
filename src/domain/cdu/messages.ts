export const QUEUE_FULL_MESSAGE = 'Too many keys waiting. Let the screen catch up.';

/**
 * The one message for a failed key (R11). `name` is the catalogue's key name ("K", "LSK 1L"); null
 * for a key the catalogue does not know, which is then just "that key" — a raw key id is never shown
 * (R12).
 */
export function keyFailedMessage(
  name: string | null,
  result: 'failed' | 'refused',
  dropped: number,
): string {
  const key = name === null ? 'that key' : `the ${name} key`;
  const Key = name === null ? 'That key' : `The ${name} key`;
  const first = result === 'failed' ? `X-Plane didn't take ${key}.` : `${Key} wasn't sent.`;
  if (dropped === 0) {
    return first;
  }
  const either = result === 'refused' ? ' either' : '';
  const rest =
    dropped === 1
      ? `The key after it wasn't sent${either}.`
      : `The ${dropped} keys after it weren't sent${either}.`;
  return `${first} ${rest}`;
}

export function missingKeysMessage(count: number): string | null {
  if (count === 0) {
    return null;
  }
  return count === 1
    ? "1 key isn't available on this aircraft."
    : `${count} keys aren't available on this aircraft.`;
}
