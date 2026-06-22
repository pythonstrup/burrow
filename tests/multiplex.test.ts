import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { startRelay, type Relay } from "../src/relay/server.js";
import { startAgent, type Agent } from "../src/agent/agent.js";

const HOST = "127.0.0.1";
const PUBLIC_PORT = 18180;
const CONTROL_PORT = 14543;
const LOCAL_PORT = 13100;

/** Open a public connection, send `payload`, resolve with the echoed reply. */
function request(payload: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const client = net.connect(PUBLIC_PORT, HOST, () => client.write(payload));
    const timer = setTimeout(() => reject(new Error(`timed out: ${payload}`)), 3000);
    client.on("data", (chunk) => {
      chunks.push(chunk);
      if (Buffer.concat(chunks).length >= payload.length) {
        clearTimeout(timer);
        client.destroy();
        resolve(Buffer.concat(chunks).toString());
      }
    });
    client.once("error", reject);
  });
}

test("multiplexes concurrent requests over one control connection", async () => {
  const echo = net.createServer((socket) => socket.pipe(socket));
  await new Promise<void>((resolve) => echo.listen(LOCAL_PORT, HOST, resolve));

  const relay: Relay = startRelay({
    publicHost: HOST,
    publicPort: PUBLIC_PORT,
    controlHost: HOST,
    controlPort: CONTROL_PORT,
  });
  const agent: Agent = startAgent({
    relayHost: HOST,
    relayPort: CONTROL_PORT,
    localHost: HOST,
    localPort: LOCAL_PORT,
    reconnectDelayMs: 50,
  });

  await new Promise((resolve) => setTimeout(resolve, 200)); // let the agent attach

  // distinct payloads so a demux mix-up would be caught
  const payloads = Array.from({ length: 8 }, (_, i) => `req-${i}-${"x".repeat(i + 1)}`);
  const results = await Promise.all(payloads.map(request));

  // each concurrent connection gets its own echo back, in order
  assert.deepEqual(results, payloads);

  agent.stop();
  relay.close();
  echo.close();
});
