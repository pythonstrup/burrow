import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { Session } from "../src/shared/session.js";

/** Connect a loopback socket pair and resolve once both ends exist. */
function socketPair(): Promise<[net.Socket, net.Socket]> {
  return new Promise((resolve) => {
    const server = net.createServer((serverSide) => {
      server.close();
      resolve([client, serverSide]);
    });
    let client!: net.Socket;
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as net.AddressInfo;
      client = net.connect(addr.port, "127.0.0.1");
    });
  });
}

function waitFor(cond: () => boolean, timeoutMs = 1000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = (): void => {
      if (cond()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("timed out"));
      setTimeout(tick, 5);
    };
    tick();
  });
}

test("relays OPEN/DATA/CLOSE frames to the peer session", async () => {
  const [a, b] = await socketPair();
  let openedId = -1;
  let payload = "";
  let closedId = -1;

  const peer = new Session(b, {
    onOpen: (id) => {
      openedId = id;
    },
    onData: (_id, p) => {
      payload = p.toString();
    },
    onClose: (id) => {
      closedId = id;
    },
  });
  const local = new Session(a, {});

  const id = local.openStream();
  local.sendData(id, Buffer.from("payload"));
  local.closeStream(id);

  await waitFor(() => closedId !== -1);
  assert.equal(openedId, id);
  assert.equal(payload, "payload");
  assert.equal(closedId, id);

  local.destroy();
  peer.destroy();
});

test("keeps interleaved streams separate", async () => {
  const [a, b] = await socketPair();
  const got: Record<number, string> = {};

  const peer = new Session(b, {
    onData: (id, p) => {
      got[id] = (got[id] ?? "") + p.toString();
    },
  });
  const local = new Session(a, {});

  const id1 = local.openStream();
  const id2 = local.openStream();
  local.sendData(id1, Buffer.from("one-"));
  local.sendData(id2, Buffer.from("two-"));
  local.sendData(id1, Buffer.from("ONE"));
  local.sendData(id2, Buffer.from("TWO"));

  await waitFor(() => (got[id1]?.length ?? 0) >= 7 && (got[id2]?.length ?? 0) >= 7);
  assert.equal(got[id1], "one-ONE");
  assert.equal(got[id2], "two-TWO");

  local.destroy();
  peer.destroy();
});

test("signals session close when the socket closes", async () => {
  const [a, b] = await socketPair();
  let closed = false;
  new Session(b, {
    onSessionClose: () => {
      closed = true;
    },
  });
  const local = new Session(a, {});

  local.destroy();
  await waitFor(() => closed);
  assert.ok(closed);
});
