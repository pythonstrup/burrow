/**
 * Wire format for multiplexing many streams over one connection:
 *
 *   +--------+------------------+------------------+-----------+
 *   | type:1 | streamId: u32 BE | length:  u32 BE | payload   |
 *   +--------+------------------+------------------+-----------+
 *        header = 9 bytes                          length bytes
 *
 * Length-prefixing is what lets us recover message boundaries from TCP's
 * boundary-less byte stream.
 */

export const FrameType = {
  OPEN: 0x01,
  DATA: 0x02,
  CLOSE: 0x03,
} as const;

export type FrameType = (typeof FrameType)[keyof typeof FrameType];

export const HEADER_SIZE = 9;

export interface Frame {
  type: FrameType;
  streamId: number;
  payload: Buffer;
}

/** Encode one frame. OPEN/CLOSE carry an empty payload. */
export function encodeFrame(
  type: FrameType,
  streamId: number,
  payload: Buffer = Buffer.alloc(0),
): Buffer {
  const header = Buffer.allocUnsafe(HEADER_SIZE);
  header.writeUInt8(type, 0);
  header.writeUInt32BE(streamId, 1);
  header.writeUInt32BE(payload.length, 5);
  return payload.length > 0 ? Buffer.concat([header, payload]) : header;
}

/**
 * Turns an arbitrary byte stream into whole frames.
 *
 * TCP delivers bytes in arbitrary chunks, so a single frame may be split
 * across several `push` calls, or several frames may arrive in one. `push`
 * buffers incoming bytes and returns every complete frame it can extract now,
 * holding any trailing partial frame for the next call.
 */
export class FrameParser {
  #buffer: Buffer = Buffer.alloc(0);

  push(chunk: Buffer): Frame[] {
    this.#buffer =
      this.#buffer.length === 0 ? chunk : Buffer.concat([this.#buffer, chunk]);

    const frames: Frame[] = [];
    while (this.#buffer.length >= HEADER_SIZE) {
      const length = this.#buffer.readUInt32BE(5);
      const total = HEADER_SIZE + length;
      if (this.#buffer.length < total) break; // full frame not arrived yet

      frames.push({
        type: this.#buffer.readUInt8(0) as FrameType,
        streamId: this.#buffer.readUInt32BE(1),
        payload: this.#buffer.subarray(HEADER_SIZE, total),
      });
      this.#buffer = this.#buffer.subarray(total);
    }
    return frames;
  }
}
