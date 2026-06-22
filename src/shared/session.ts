import type { Socket } from "node:net";
import { type Frame, FrameType, FrameParser, encodeFrame } from "./frame.js";

export interface SessionHandlers {
  onOpen?: (streamId: number) => void;
  onData?: (streamId: number, payload: Buffer) => void;
  onClose?: (streamId: number) => void;
  onSessionClose?: () => void;
}

/**
 * Multiplexes logical streams over a single control socket using the frame
 * protocol. Used symmetrically by relay and agent: each side wires the stream
 * callbacks to its own `streamId -> socket` map.
 *
 * Stream IDs are allocated by whichever side calls `openStream()` — in burrow
 * that is always the relay.
 */
export class Session {
  #socket: Socket;
  #parser = new FrameParser();
  #handlers: SessionHandlers;
  #nextStreamId = 1;

  constructor(socket: Socket, handlers: SessionHandlers) {
    this.#socket = socket;
    this.#handlers = handlers;

    socket.on("data", (chunk: Buffer) => {
      for (const frame of this.#parser.push(chunk)) this.#dispatch(frame);
    });
    socket.once("close", () => this.#handlers.onSessionClose?.());
    socket.once("error", () => this.#handlers.onSessionClose?.());
  }

  #dispatch(frame: Frame): void {
    switch (frame.type) {
      case FrameType.OPEN:
        this.#handlers.onOpen?.(frame.streamId);
        break;
      case FrameType.DATA:
        this.#handlers.onData?.(frame.streamId, frame.payload);
        break;
      case FrameType.CLOSE:
        this.#handlers.onClose?.(frame.streamId);
        break;
    }
  }

  /** Allocate a new stream id and announce it with an OPEN frame. */
  openStream(): number {
    const streamId = this.#nextStreamId++;
    this.#socket.write(encodeFrame(FrameType.OPEN, streamId));
    return streamId;
  }

  /**
   * Send stream payload. Returns `false` when the control socket is backed up;
   * the caller should pause its source socket until {@link onDrain} fires.
   */
  sendData(streamId: number, payload: Buffer): boolean {
    return this.#socket.write(encodeFrame(FrameType.DATA, streamId, payload));
  }

  closeStream(streamId: number): void {
    this.#socket.write(encodeFrame(FrameType.CLOSE, streamId));
  }

  /** Resume hook: fires when the control socket has drained its write buffer. */
  onDrain(listener: () => void): void {
    this.#socket.on("drain", listener);
  }

  destroy(): void {
    this.#socket.destroy();
  }
}
