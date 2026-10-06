/**
 * Test builders for CDU screen data.
 * Used by tests/unit/domain/cdu-screen.test.ts and other CDU tests.
 */

/**
 * Encodes a string into base64, padded to a specified size in bytes.
 * Interior NULs are preserved; trailing NULs are trimmed from the string.
 */
export const text = (s: string, size = 96) => {
  const bytes = Buffer.alloc(size);
  Buffer.from(s, 'utf8').copy(bytes);
  return bytes.toString('base64');
};

/**
 * Encodes an array of style bytes into base64.
 */
export const style = (bytes: number[]) => Buffer.from(bytes).toString('base64');
