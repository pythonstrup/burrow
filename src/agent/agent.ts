import net, { type Socket } from "node:net";
import { pipeSockets } from "../shared/index.js";
import type { AgentConfig } from "./config.js";

export interface Agent {
  stop(): void;
}

/**
 * v0.1 single forwarding: keep one outbound connection to the relay paired with
 * one connection to the local service. When the pair closes, open a fresh
 * tunnel so the next request is served. The connection is outbound-only, so the
 * agent works behind NAT/firewalls — the machine never opens an inbound port.
 */
export function startAgent(config: AgentConfig): Agent {
  let stopped = false;

  const scheduleReconnect = (): void => {
    if (stopped) return;
    setTimeout(openTunnel, config.reconnectDelayMs);
  };

  const openTunnel = (): void => {
    if (stopped) return;

    const relayConn = net.connect(config.relayPort, config.relayHost);
    const localConn = net.connect(config.localPort, config.localHost);

    let connected = 0;
    let retried = false;

    const retry = (): void => {
      if (retried) return;
      retried = true;
      relayConn.destroy();
      localConn.destroy();
      scheduleReconnect();
    };

    const onConnect = (): void => {
      connected += 1;
      if (connected === 2) {
        pipeSockets(relayConn, localConn);
        console.log(
          `burrow: tunnel ready — relay → ${config.localHost}:${config.localPort}`,
        );
      }
    };

    relayConn.once("connect", onConnect);
    localConn.once("connect", onConnect);

    relayConn.once("error", (err) => {
      console.error(
        `burrow: relay ${config.relayHost}:${config.relayPort} — ${err.message}`,
      );
      retry();
    });
    localConn.once("error", (err) => {
      console.error(
        `burrow: local ${config.localHost}:${config.localPort} — ${err.message}`,
      );
      retry();
    });

    relayConn.once("close", retry);
    localConn.once("close", retry);
  };

  openTunnel();

  return {
    stop(): void {
      stopped = true;
    },
  };
}
