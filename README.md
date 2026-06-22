# burrow

A self-hosted localhost tunnel. Run the relay (`burrowd`) on a public server, then a single command on your machine (`burrow`) pulls external traffic into your local port.

It does what ngrok does, but on your own infrastructure — no session limits, a fixed URL, and traffic never passes through a third-party service.

## Why

The chronic problem of webhook development: webhooks are calls **from their server to yours**, so you can't receive them locally without a public URL. Deploying to a dev server and tailing logs on every code change makes for a painfully slow feedback loop.

With burrow, webhooks from services like Airtable or Solapi land directly in your local debugger:

```
[webhook sender]            [public server]                  [your machine]
  Airtable ───HTTP──▶  burrowd (relay)  ◀──outbound conn──  burrow (agent)
                       :8080 public                            │
                       :4443 control                           ▼
                                                        localhost:3000
```

Your machine never opens an inbound port. The agent establishes an outbound connection to the relay first, so it works behind NAT and firewalls.

## How it works

A single persistent **control connection** runs from the agent to the relay. Every
public connection becomes a logical **stream** multiplexed over it:

- the relay assigns a stream id per public connection and frames its bytes onto
  the shared control connection
- the agent demultiplexes frames back into one connection per stream to the local
  service

Frames are length-prefixed — `type(1) | streamId(4) | length(4) | payload` — which
is how stream boundaries are recovered from TCP's boundary-less byte stream.
Multiple requests share one connection concurrently (HTTP/2-style), so the agent
no longer reconnects per request.

Backpressure is handled at the **connection level**: if the shared control socket
fills, the source sockets pause and resume together on drain. (Per-stream flow
control — to avoid head-of-line blocking — is a later milestone.)

## Requirements

- [Node.js](https://nodejs.org) 20+ (enable pnpm with `corepack enable`)

```bash
pnpm install
pnpm build
```

## Usage

```bash
# on the public server — relay
burrowd --public :8080 --control :4443

# on your machine — agent
burrow --relay <server-address>:4443 --local localhost:3000
```

Every request arriving at `http://<server-address>:8080` is then forwarded to `localhost:3000`.

During development you can run straight from TypeScript without building:

```bash
pnpm dev:relay --public :8080 --control :4443
pnpm dev:agent --relay localhost:4443 --local localhost:3000
```

## Development

```bash
pnpm test         # frame, session & integration/concurrency suites
pnpm typecheck    # tsc --noEmit
pnpm build        # emit dist/
```

## Layout

```
src/relay/    relay server (burrowd) — public + control listeners, stream demux
src/agent/    local agent (burrow)   — persistent control connection, per-stream local forwarding
src/shared/   frame codec, multiplexing session, address parsing, logger
tests/        frame & session unit tests + integration / concurrency tests
```

## Logging

burrow logs operational events to stdout as NDJSON using [pino](https://getpino.io). Set the level with `LOG_LEVEL` (`debug` | `info` | `warn` | `error` | `silent`, default `info`):

```bash
LOG_LEVEL=debug pnpm dev:relay --public :8080 --control :4443
```

In an interactive terminal logs render human-readable via `pino-pretty`; when piped or redirected (CI, Docker, systemd) raw NDJSON is emitted for log processors. CLI usage errors (bad flags) are written to stderr as plain text.

## Roadmap

- [x] **v0.1 — Single forwarding**: pair one public connection with one agent connection and pipe bytes as-is. One request per connection.
- [x] **v0.2 — Multiplexing**: many concurrent streams over a single control connection. Length-prefixed framing + stream IDs. Concurrent requests no longer block each other.
- [ ] **v0.3 — Resilience**: agent reconnect with exponential backoff, 502 when no agent is attached, timeouts, graceful shutdown.
- [ ] **v0.4 — Authentication**: agent token auth. Mandatory the moment the public port faces the internet.
- [ ] **v0.5 — TLS**: encrypt the control connection.
- [ ] **v0.6 — Operations**: Dockerfile, structured logging, health check endpoint.
```
