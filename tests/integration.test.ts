import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { startRelay, type Relay } from "../src/relay/server.js";
import { startAgent, type Agent } from "../src/agent/agent.js";

const HOST = "127.0.0.1";
const PUBLIC_PORT = 18080;
const CONTROL_PORT = 14443;
const LOCAL_PORT = 13000;

test("forwards a public request through the agent to the local service", async () => {
  // stand in for the user's local service: echo whatever it receives
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

  // give the agent a moment to attach its outbound connection to the relay
  await new Promise((resolve) => setTimeout(resolve, 150));

  const received = await new Promise<string>((resolve, reject) => {
    const client = net.connect(PUBLIC_PORT, HOST, () => {
      client.write("hello burrow");
    });
    const timer = setTimeout(() => reject(new Error("timed out")), 2000);
    client.once("data", (chunk) => {
      clearTimeout(timer);
      client.destroy();
      resolve(chunk.toString());
    });
    client.once("error", reject);
  });

  assert.equal(received, "hello burrow");

  agent.stop();
  relay.close();
  echo.close();
});
