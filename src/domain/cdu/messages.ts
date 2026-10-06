export const QUEUE_FULL_MESSAGE = 'Too many keys waiting. Let the screen catch up.';

export function keyFailedMessage(
  name: string,
  result: 'failed' | 'refused',
  dropped: number,
): string {
  const first =
    result === 'failed' ? `X-Plane didn't take the ${name} key.` : `The ${name} key wasn't sent.`;
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
