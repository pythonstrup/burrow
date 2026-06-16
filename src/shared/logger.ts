import { pino, type Logger } from "pino";

const level = process.env.LOG_LEVEL ?? "info";

// In an interactive terminal, render human-readable logs via pino-pretty (a
// worker-thread transport). When the output is piped or redirected — CI,
// Docker, systemd — emit raw NDJSON instead, which is what log processors
// (Fluent Bit, the OTel Collector, jq, …) parse directly.
const usePretty = Boolean(process.stdout.isTTY) && level !== "silent";

const root = pino({
  level,
  transport: usePretty
    ? { target: "pino-pretty", options: { colorize: true } }
    : undefined,
});

/**
 * A child logger tagged with its component, e.g. `logger("relay")`. Every line
 * it emits carries `"component":"relay"`, so logs from the relay and the agent
 * stay distinguishable once they are aggregated.
 */
export function logger(component: string): Logger {
  return root.child({ component });
}
