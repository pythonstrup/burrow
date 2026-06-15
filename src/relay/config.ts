import { parseArgs } from "node:util";
import { splitHostPort } from "../shared/index.js";

export interface RelayConfig {
  publicHost: string;
  publicPort: number;
  controlHost: string;
  controlPort: number;
}

/**
 * Parse `burrowd` CLI flags.
 *
 *   --public  <[host:]port>  port external traffic arrives on  (default :8080)
 *   --control <[host:]port>  port agents connect back to       (default :4443)
 */
export function parseRelayConfig(args: string[]): RelayConfig {
  const { values } = parseArgs({
    args,
    options: {
      public: { type: "string", default: ":8080" },
      control: { type: "string", default: ":4443" },
    },
  });

  const pub = splitHostPort(values.public!, "0.0.0.0");
  const control = splitHostPort(values.control!, "0.0.0.0");

  return {
    publicHost: pub.host,
    publicPort: pub.port,
    controlHost: control.host,
    controlPort: control.port,
  };
}
