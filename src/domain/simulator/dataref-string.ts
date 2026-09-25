import type { DataRefValue, DataRefValueType } from '@/domain/simulator/types';

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Decodes standard base64 without depending on `atob`, `Buffer` or `TextDecoder`: the app runs on
 * Hermes, on Node and in a browser, and only this file would have had to care which globals each
 * one provides.
 */
function decodeBase64(text: string): Uint8Array | null {
  const body = text.replace(/=+$/, '');
  if (!/^[A-Za-z0-9+/]*$/.test(body)) {
    return null;
  }
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of body) {
    buffer = (buffer << 6) | BASE64_ALPHABET.indexOf(character);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

/** Decodes UTF-8, substituting U+FFFD for a malformed sequence rather than throwing. */
function decodeUtf8(bytes: Uint8Array): string {
  let text = '';
  let index = 0;
  while (index < bytes.length) {
    const lead = bytes[index] ?? 0;
    let codePoint: number;
    let continuations: number;
    if (lead < 0x80) {
      codePoint = lead;
      continuations = 0;
    } else if ((lead & 0xe0) === 0xc0) {
      codePoint = lead & 0x1f;
      continuations = 1;
    } else if ((lead & 0xf0) === 0xe0) {
      codePoint = lead & 0x0f;
      continuations = 2;
    } else if ((lead & 0xf8) === 0xf0) {
      codePoint = lead & 0x07;
      continuations = 3;
    } else {
      text += '�';
      index += 1;
      continue;
    }
    if (index + continuations >= bytes.length) {
      return `${text}�`;
    }
    let valid = true;
    for (let offset = 1; offset <= continuations; offset += 1) {
      const next = bytes[index + offset] ?? 0;
      if ((next & 0xc0) !== 0x80) {
        valid = false;
        break;
      }
      codePoint = (codePoint << 6) | (next & 0x3f);
    }
    if (!valid || codePoint > 0x10ffff) {
      text += '�';
      index += 1;
      continue;
    }
    text += String.fromCodePoint(codePoint);
    index += continuations + 1;
  }
  return text;
}

/**
 * Reads a `data`-typed DataRef as text. X-Plane base64-encodes these and pads them with NUL to the
 * DataRef's declared length. Decoding is driven by the descriptor's `valueType`, never guessed
 * from the shape of the value: a float that happens to arrive as a string must not be read as
 * text. Returns null when there is nothing to show, so callers treat "absent" and "empty" alike.
 */
export function decodeDataRefString(
  value: DataRefValue,
  valueType: DataRefValueType,
): string | null {
  if (valueType !== 'data' || typeof value !== 'string') {
    return null;
  }
  const bytes = decodeBase64(value);
  if (bytes === null) {
    return null;
  }
  const end = bytes.indexOf(0);
  const text = decodeUtf8(end === -1 ? bytes : bytes.subarray(0, end)).trim();
  return text === '' ? null : text;
}
