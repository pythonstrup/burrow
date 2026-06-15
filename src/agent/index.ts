#!/usr/bin/env node
import { parseAgentConfig } from "./config.js";
import { startAgent } from "./agent.js";

try {
  startAgent(parseAgentConfig(process.argv.slice(2)));
} catch (err) {
  console.error(`burrow: ${(err as Error).message}`);
  process.exit(1);
}
