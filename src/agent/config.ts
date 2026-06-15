import { parseArgs } from "node:util";
import { splitHostPort } from "../shared/index.js";

export interface AgentConfig {
  relayHost: string;
  relayPort: number;
  localHost: string;
  localPort: number;
  reconnectDelayMs: number;
}

/**
 * Parse `burrow` CLI flags.
 *
 *   --relay <host:port>      relay control address        (required)
 *   --local <[host:]port>    local service to forward to  (default localhost:3000)
 */
export function parseAgentConfig(args: string[]): AgentConfig {
  const { values } = parseArgs({
    args,
    options: {
      relay: { type: "string" },
      local: { type: "string", default: "localhost:3000" },
    },
  });

  if (!values.relay) {
    throw new Error("missing required flag --relay <host:port>");
  }

  const relay = splitHostPort(values.relay, "localhost");
  const local = splitHostPort(values.local!, "localhost");

  return {
    relayHost: relay.host,
    relayPort: relay.port,
    localHost: local.host,
    localPort: local.port,
    reconnectDelayMs: 1000,
  };
}
