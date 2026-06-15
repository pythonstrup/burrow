#!/usr/bin/env node
import { parseRelayConfig } from "./config.js";
import { startRelay } from "./server.js";

try {
  startRelay(parseRelayConfig(process.argv.slice(2)));
} catch (err) {
  console.error(`burrowd: ${(err as Error).message}`);
  process.exit(1);
}
