import { decodeBase64, encodeBase64 } from "./base64";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const utf8 = "Base 64 \u2014 Mozilla Developer Network";
const base64 = "QmFzZSA2NCDigJQgTW96aWxsYSBEZXZlbG9wZXIgTmV0d29yaw==";
const chars =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

test("encode", () => {
  const res = encodeBase64(encoder.encode(utf8));
  expect(res).toStrictEqual(base64);
});

test("decode", () => {
  const res = decoder.decode(decodeBase64(base64));
  expect(res).toStrictEqual(utf8);
});

test("isomorphic with all valid characters", () => {
  const res = encodeBase64(decodeBase64(chars));
  expect(res).toStrictEqual(chars);
});

test("padding", () => {
  const sing = encodeBase64(decodeBase64("ABC"));
  expect(sing).toStrictEqual("ABA=");

  const doub = encodeBase64(decodeBase64("AB"));
  expect(doub).toStrictEqual("AA==");
});

test("explicit block size", () => {
  const res = encodeBase64(decodeBase64("ABCD", 2));
  expect(res).toStrictEqual("ABCDAA==");
});
