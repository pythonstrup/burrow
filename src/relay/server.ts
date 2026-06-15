import net, { type Socket } from "node:net";
import { pipeSockets } from "../shared/index.js";
import type { RelayConfig } from "./config.js";

export interface Relay {
  close(): void;
}

/**
 * v0.1 single forwarding: park each agent (control) connection and each public
 * connection in a queue, pair them one-to-one, and pipe bytes as-is.
 *
 * A public socket with no data listener stays paused, so bytes that arrive
 * before an agent is available are buffered by Node rather than lost — they
 * flush the moment the pair is piped together. No multiplexing yet: one public
 * request rides one agent connection.
 */
export function startRelay(config: RelayConfig): Relay {
  const idleAgents: Socket[] = [];
  const waitingPublic: Socket[] = [];

  const pairWaiting = (): void => {
    while (idleAgents.length > 0 && waitingPublic.length > 0) {
      const agent = idleAgents.shift()!;
      const publicConn = waitingPublic.shift()!;
      pipeSockets(agent, publicConn);
    }
  };

  const enqueue = (queue: Socket[], socket: Socket): void => {
    queue.push(socket);

    const remove = (): void => {
      const index = queue.indexOf(socket);
      if (index !== -1) queue.splice(index, 1);
    };
    socket.once("close", remove);
    socket.once("error", remove);

    pairWaiting();
  };

  const controlServer = net.createServer((socket) =>
    enqueue(idleAgents, socket),
  );
  const publicServer = net.createServer((socket) =>
    enqueue(waitingPublic, socket),
  );

  controlServer.listen(config.controlPort, config.controlHost);
  publicServer.listen(config.publicPort, config.publicHost);

  console.log(
    `burrowd: relay up — public ${config.publicHost}:${config.publicPort}, ` +
      `control ${config.controlHost}:${config.controlPort}`,
  );

  return {
    close(): void {
      controlServer.close();
      publicServer.close();
      for (const socket of [...idleAgents, ...waitingPublic]) socket.destroy();
    },
  };
}
