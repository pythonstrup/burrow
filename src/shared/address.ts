/**
 * Parse a `host:port` or `:port` address string.
 *
 * A bare `:port` uses `fallbackHost` ("0.0.0.0" for listeners, "localhost" for
 * dials). This is the only place CLI addresses enter the program, so we
 * validate here and fail fast with a clear message.
 */
export function splitHostPort(
  addr: string,
  fallbackHost: string,
): { host: string; port: number } {
  const idx = addr.lastIndexOf(":");
  if (idx === -1) {
    throw new Error(`invalid address "${addr}" — expected host:port or :port`);
  }

  const host = addr.slice(0, idx) || fallbackHost;
  const port = Number(addr.slice(idx + 1));

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`invalid port in "${addr}" — expected 1-65535`);
  }

  return { host, port };
}
