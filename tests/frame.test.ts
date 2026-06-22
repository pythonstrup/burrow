import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FrameType,
  HEADER_SIZE,
  encodeFrame,
  FrameParser,
} from "../src/shared/frame.js";

test("encodes and parses a single DATA frame", () => {
  const parser = new FrameParser();
  const frames = parser.push(encodeFrame(FrameType.DATA, 7, Buffer.from("hello")));

  assert.equal(frames.length, 1);
  const frame = frames[0]!;
  assert.equal(frame.type, FrameType.DATA);
  assert.equal(frame.streamId, 7);
  assert.equal(frame.payload.toString(), "hello");
});

test("OPEN and CLOSE carry an empty payload", () => {
  const parser = new FrameParser();
  const frames = parser.push(
    Buffer.concat([encodeFrame(FrameType.OPEN, 1), encodeFrame(FrameType.CLOSE, 1)]),
  );

  assert.deepEqual(
    frames.map((f) => f.type),
    [FrameType.OPEN, FrameType.CLOSE],
  );
  assert.equal(frames[0]!.payload.length, 0);
});

test("reassembles a frame split across chunks", () => {
  const encoded = encodeFrame(FrameType.DATA, 42, Buffer.from("split me"));
  const parser = new FrameParser();

  assert.equal(parser.push(encoded.subarray(0, 4)).length, 0); // partial header
  assert.equal(parser.push(encoded.subarray(4, HEADER_SIZE)).length, 0); // header done, no payload
  const frames = parser.push(encoded.subarray(HEADER_SIZE));

  assert.equal(frames.length, 1);
  assert.equal(frames[0]!.payload.toString(), "split me");
});

test("extracts multiple frames from one chunk and keeps a partial remainder", () => {
  const a = encodeFrame(FrameType.DATA, 1, Buffer.from("aaa"));
  const b = encodeFrame(FrameType.DATA, 2, Buffer.from("bbb"));
  const third = encodeFrame(FrameType.DATA, 3, Buffer.from("ccc"));
  const parser = new FrameParser();

  let frames = parser.push(Buffer.concat([a, b, third.subarray(0, 3)]));
  assert.deepEqual(
    frames.map((f) => f.streamId),
    [1, 2],
  );

  frames = parser.push(third.subarray(3)); // remainder completes the third frame
  assert.equal(frames.length, 1);
  assert.equal(frames[0]!.streamId, 3);
  assert.equal(frames[0]!.payload.toString(), "ccc");
});
