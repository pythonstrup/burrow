import net, { type Socket } from "node:net";
import { Session, logger } from "../shared/index.js";
import type { AgentConfig } from "./config.js";

const log = logger("agent");

export interface Agent {
  stop(): void;
}

/**
 * v0.2 multiplexing: keep one persistent control connection to the relay and
 * demultiplex its streams into per-stream connections to the local service.
 * OPEN -> dial local, DATA -> forward, CLOSE -> tear down. The connection is
 * outbound-only, so the agent works behind NAT/firewalls.
 */
export function startAgent(config: AgentConfig): Agent {
  let stopped = false;
  let session: Session | null = null;
  const streams = new Map<number, Socket>(); // streamId -> local socket
  const pending = new Map<number, Buffer[]>(); // DATA that arrived before local connected
  const pausedSources = new Set<Socket>();

  const scheduleReconnect = (): void => {
    if (!stopped) setTimeout(connect, config.reconnectDelayMs);
  };

  const openLocal = (id: number): void => {
    const local = net.connect(config.localPort, config.localHost);
    streams.set(id, local);

    local.once("connect", () => {
      const queued = pending.get(id);
      if (queued) {
        for (const chunk of queued) local.write(chunk);
        pending.delete(id);
      }
    });
    local.on("data", (chunk: Buffer) => {
      if (session && !session.sendData(id, chunk)) {
        local.pause();
        pausedSources.add(local);
      }
    });

    const end = (): void => {
      pausedSources.delete(local);
      pending.delete(id);
      if (streams.delete(id)) session?.closeStream(id);
    };
    local.once("close", end);
    local.once("error", end);
  };

  function connect(): void {
    if (stopped) return;
    const socket = net.connect(config.relayPort, config.relayHost);

    socket.once("connect", () => {
      log.info(
        {
          relayHost: config.relayHost,
          relayPort: config.relayPort,
          localHost: config.localHost,
          localPort: config.localPort,
        },
        "connected to relay",
      );
    });
    socket.once("error", (err) => {
      log.warn(
        { relayHost: config.relayHost, relayPort: config.relayPort, err: err.message },
        "control connection error, will retry",
      );
    });

    const current = new Session(socket, {
      onOpen: (id) => openLocal(id),
      onData: (id, payload) => {
        const local = streams.get(id);
        if (!local) return;
        if (local.connecting) {
          const queue = pending.get(id) ?? [];
          queue.push(payload);
          pending.set(id, queue);
        } else {
          local.write(payload);
        }
      },
      onClose: (id) => {
        const local = streams.get(id);
        if (local) {
          streams.delete(id);
          pending.delete(id);
          local.destroy();
        }
      },
      onSessionClose: () => {
        if (session !== current) return; // guard against error+close double-fire
        session = null;
        for (const local of streams.values()) local.destroy();
        streams.clear();
        pending.clear();
        pausedSources.clear();
        scheduleReconnect();
      },
    });
    current.onDrain(() => {
      for (const source of pausedSources) source.resume();
      pausedSources.clear();
    });

    session = current;
  }

  connect();

  return {
    stop(): void {
      stopped = true;
      session?.destroy();
    },
  };
}
