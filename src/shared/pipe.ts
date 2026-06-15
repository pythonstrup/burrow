import type { Socket } from "node:net";

/**
 * Wire two TCP sockets into a bidirectional, backpressure-aware pipe.
 *
 * `a.pipe(b)` automatically pauses reads from `a` whenever `b`'s write buffer
 * fills and resumes on drain — exactly what a byte-for-byte tunnel needs, and
 * the reason Node's stream model fits this job. `pipe` also forwards
 * end-of-stream, so a normal close on one side ends the other. We add error
 * handling to tear the whole pair down rather than leak a half-open socket.
 */
export function pipeSockets(a: Socket, b: Socket): void {
  a.pipe(b);
  b.pipe(a);

  const teardown = (): void => {
    a.destroy();
    b.destroy();
  };

  a.once("error", teardown);
  b.once("error", teardown);
}
