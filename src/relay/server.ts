import net, { type Socket } from "node:net";
import { Session, logger } from "../shared/index.js";
import type { RelayConfig } from "./config.js";

const log = logger("relay");

export interface Relay {
  close(): void;
}

/**
 * v0.2 multiplexing: hold a single control connection to the agent and carry
 * every public connection over it as a stream. The relay allocates a stream id
 * per public connection, forwards its bytes as DATA frames, and demultiplexes
 * frames coming back from the agent into the matching public sockets.
 *
 * Backpressure is connection-level: if the shared control socket backs up, the
 * source public sockets pause and resume together on drain (no per-stream
 * windows yet — that is a later step).
 */
export function startRelay(config: RelayConfig): Relay {
  let agentSession: Session | null = null;
  const streams = new Map<number, Socket>(); // streamId -> public socket
  const pausedSources = new Set<Socket>();

  const teardownStreams = (): void => {
    for (const socket of streams.values()) socket.destroy();
    streams.clear();
    pausedSources.clear();
  };

  const controlServer = net.createServer((socket) => {
    if (agentSession) {
      agentSession.destroy(); // single-agent: newest connection wins
      teardownStreams();
    }

    const session = new Session(socket, {
      onData: (id, payload) => {
        streams.get(id)?.write(payload);
      },
      onClose: (id) => {
        const publicSocket = streams.get(id);
        if (publicSocket) {
          streams.delete(id);
          publicSocket.destroy();
        }
      },
      onSessionClose: () => {
        if (agentSession === session) {
          agentSession = null;
          teardownStreams();
          log.info("agent detached");
        }
      },
    });
    session.onDrain(() => {
      for (const source of pausedSources) source.resume();
      pausedSources.clear();
    });

    agentSession = session;
    log.info({ peer: socket.remoteAddress }, "agent attached");
  });

  const publicServer = net.createServer((publicSocket) => {
    const session = agentSession;
    if (!session) {
      log.warn("public connection with no agent attached — dropping");
      publicSocket.destroy();
      return;
    }

    const id = session.openStream();
    streams.set(id, publicSocket);
    log.debug({ streamId: id, peer: publicSocket.remoteAddress }, "stream opened");

    publicSocket.on("data", (chunk: Buffer) => {
      if (!session.sendData(id, chunk)) {
        publicSocket.pause();
        pausedSources.add(publicSocket);
      }
    });

    const end = (): void => {
      pausedSources.delete(publicSocket);
      if (streams.delete(id)) {
        session.closeStream(id);
        log.debug({ streamId: id }, "stream closed");
      }
    };
    publicSocket.once("close", end);
    publicSocket.once("error", end);
  });

  controlServer.listen(config.controlPort, config.controlHost);
  publicServer.listen(config.publicPort, config.publicHost);

  log.info(
    {
      publicHost: config.publicHost,
      publicPort: config.publicPort,
      controlHost: config.controlHost,
      controlPort: config.controlPort,
    },
    "relay up",
  );

  return {
    close(): void {
      controlServer.close();
      publicServer.close();
      agentSession?.destroy();
      teardownStreams();
      log.info("relay closed");
    },
  };
}
