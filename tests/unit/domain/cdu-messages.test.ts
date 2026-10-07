import { hardwareKeyToCdu } from '@/domain/cdu/hardware-keys';
import { keyFailedMessage, missingKeysMessage } from '@/domain/cdu/messages';

function hw(
  key: string,
  modifiers: Partial<{ ctrlKey: boolean; altKey: boolean; metaKey: boolean }> = {},
) {
  return {
    key,
    ctrlKey: modifiers.ctrlKey ?? false,
    altKey: modifiers.altKey ?? false,
    metaKey: modifiers.metaKey ?? false,
    repeat: false,
  };
}

describe('keyFailedMessage', () => {
  it('names the failed key and the keys dropped behind it', () => {
    expect(keyFailedMessage('K', 'failed', 3)).toBe(
      "X-Plane didn't take the K key. The 3 keys after it weren't sent.",
    );
  });

  it('says nothing more when nothing was dropped', () => {
    expect(keyFailedMessage('EXEC', 'failed', 0)).toBe("X-Plane didn't take the EXEC key.");
  });

  it('phrases a refusal, and the dropped key, differently from a failure', () => {
    expect(keyFailedMessage('LSK 1L', 'refused', 1)).toBe(
      "The LSK 1L key wasn't sent. The key after it wasn't sent either.",
    );
  });

  it('calls a key outside the catalogue "that key", never by its id (R12)', () => {
    expect(keyFailedMessage(null, 'failed', 0)).toBe("X-Plane didn't take that key.");
    expect(keyFailedMessage(null, 'refused', 2)).toBe(
      "That key wasn't sent. The 2 keys after it weren't sent either.",
    );
  });

  it('uses the singular for exactly one key dropped behind a failure', () => {
    expect(keyFailedMessage('A', 'failed', 1)).toBe(
      "X-Plane didn't take the A key. The key after it wasn't sent.",
    );
  });
});

describe('missingKeysMessage', () => {
  it('says nothing when every key is available', () => {
    expect(missingKeysMessage(0)).toBeNull();
  });

  it('uses the singular for one missing key', () => {
    expect(missingKeysMessage(1)).toBe("1 key isn't available on this aircraft.");
  });

  it('uses the plural for several missing keys', () => {
    expect(missingKeysMessage(4)).toBe("4 keys aren't available on this aircraft.");
  });
});

describe('hardwareKeyToCdu', () => {
  it('maps a lower-case letter to its uppercase key id', () => {
    expect(hardwareKeyToCdu(hw('a'))).toBe('key_A');
  });

  it('maps an upper-case letter the same way', () => {
    expect(hardwareKeyToCdu(hw('A'))).toBe('key_A');
  });

  it('maps a digit', () => {
    expect(hardwareKeyToCdu(hw('7'))).toBe('key_7');
  });

  it('maps the named punctuation and whitespace keys', () => {
    expect(hardwareKeyToCdu(hw('.'))).toBe('key_period');
    expect(hardwareKeyToCdu(hw('-'))).toBe('key_minus');
    expect(hardwareKeyToCdu(hw('/'))).toBe('key_slash');
    expect(hardwareKeyToCdu(hw(' '))).toBe('key_space');
  });

  it('maps the named control keys', () => {
    expect(hardwareKeyToCdu(hw('Delete'))).toBe('key_delete');
    expect(hardwareKeyToCdu(hw('Backspace'))).toBe('key_back');
    expect(hardwareKeyToCdu(hw('Escape'))).toBe('key_clear');
    expect(hardwareKeyToCdu(hw('PageUp'))).toBe('prev');
    expect(hardwareKeyToCdu(hw('PageDown'))).toBe('next');
  });

  it('leaves Enter and Tab unmapped', () => {
    expect(hardwareKeyToCdu(hw('Enter'))).toBeNull();
    expect(hardwareKeyToCdu(hw('Tab'))).toBeNull();
  });

  it('refuses a letter chorded with a browser modifier', () => {
    expect(hardwareKeyToCdu(hw('a', { ctrlKey: true }))).toBeNull();
    expect(hardwareKeyToCdu(hw('a', { altKey: true }))).toBeNull();
    expect(hardwareKeyToCdu(hw('a', { metaKey: true }))).toBeNull();
  });
});
