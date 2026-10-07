import {
  CDU_LINE_COUNT,
  type CduUnit,
  cduExecLight,
  cduStyleLine,
  cduTextLine,
} from '@/domain/cdu/keys';

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

const LARGE = 0x80;
const WHITE = 7;
const CYAN = 1;
const AMBER = 6;

/**
 * The mock's toy FMS screen as telemetry, for panel-level tests that need a live CDU without a
 * server: the title, the ORIGIN label over four amber box prompts, and the scratchpad (line 13).
 * Every one of the 16 text lines has a value, so the screen is never "waiting".
 */
export function toyScreenTelemetry(
  unit: CduUnit,
  receivedAt: number,
  options: { scratchpad?: string; execLight?: number } = {},
): Record<string, { value: string | number; receivedAt: number }> {
  const lines: Record<number, [string, number]> = {
    0: [unit === 1 ? '        TOY FMS' : '       TOY FMS 2', LARGE | WHITE],
    1: [' ORIGIN', WHITE],
    2: ['☐☐☐☐', LARGE | AMBER],
    13: [options.scratchpad ?? '', LARGE | CYAN],
  };
  const telemetry: Record<string, { value: string | number; receivedAt: number }> = {};
  for (let line = 0; line < CDU_LINE_COUNT; line += 1) {
    const [content, styleByte] = lines[line] ?? ['', 0];
    telemetry[cduTextLine(unit, line)] = { value: text(content), receivedAt };
    telemetry[cduStyleLine(unit, line)] = {
      value: style(new Array(24).fill(styleByte)),
      receivedAt,
    };
  }
  telemetry[cduExecLight(unit)] = { value: options.execLight ?? 0, receivedAt };
  return telemetry;
}
