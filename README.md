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

burrow is built on Node's `net` module and stream pipes. Forwarding is just two
sockets wired together:

```js
agentSocket.pipe(publicSocket);
publicSocket.pipe(agentSocket);
```

Node streams handle **backpressure** for free: if one side is slower, reads on
the other pause automatically until it drains — so a large response never piles
up unbounded in memory.

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
pnpm test            # node:test integration suite
pnpm typecheck   # tsc --noEmit
pnpm build       # emit dist/
```

## Layout

```
src/relay/    relay server (burrowd) — public + control listeners, pairing
src/agent/    local agent (burrow)   — outbound connection, local forwarding, reconnect
src/shared/   byte-pipe primitive & address parsing shared by both
tests/        cross-process integration test
```

## Roadmap

- [x] **v0.1 — Single forwarding**: pair one public connection with one agent connection and pipe bytes as-is. One request per connection.
- [ ] **v0.2 — Multiplexing**: carry multiple concurrent requests over a single control connection. Length-prefixed framing + stream IDs. Prerequisite for concurrent webhooks.
- [ ] **v0.3 — Resilience**: agent reconnect with exponential backoff, 502 when no agent is attached, timeouts, graceful shutdown.
- [ ] **v0.4 — Authentication**: agent token auth. Mandatory the moment the public port faces the internet.
- [ ] **v0.5 — TLS**: encrypt the control connection.
- [ ] **v0.6 — Operations**: Dockerfile, structured logging, health check endpoint.

## License

MIT © Jonghyeok Park
