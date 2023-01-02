import {
  bytesEqual,
  collect,
  decodeBinary,
  decodeIdentity,
  decodeQuotedPrintable,
  indexOf,
  splitStream,
  toBytes,
} from "./utils";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// eslint-disable-next-line @typescript-eslint/require-await
async function* toAsyncIterable<T>(items: Iterable<T>): AsyncIterable<T> {
  for (const item of items) {
    yield item;
  }
}

describe("toBytes()", () => {
  const base = new Uint8Array([1, 2, 3, 4]);

  test("works on raw buffer", () => {
    const res = toBytes(base.buffer);
    expect(bytesEqual(res, base)).toBe(true);
  });

  test("works on raw buffer of view", () => {
    const res = toBytes(base.subarray(1, 3).buffer);
    expect(bytesEqual(res, base)).toBe(true);
  });

  test("works on sub array", () => {
    const res = toBytes(base.subarray(1, 3));
    expect(bytesEqual(res, new Uint8Array([2, 3]))).toBe(true);
  });
});

describe("bytesEqual()", () => {
  test("length failure", () => {
    const left = new Uint8Array([1, 2, 3]);
    const right = new Uint8Array([1, 2, 3, 4]);
    expect(bytesEqual(left, right)).toBe(false);
  });

  test("simple success", () => {
    const left = new Uint8Array([1, 2, 3]);
    const right = new Uint8Array([1, 2, 3]);
    expect(bytesEqual(left, right)).toBe(true);
  });

  test("simple failure", () => {
    const left = new Uint8Array([1, 2, 3]);
    const right = new Uint8Array([1, 2, 4]);
    expect(bytesEqual(left, right)).toBe(false);
  });

  test("fast path success", () => {
    const left = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]).subarray(1);
    const right = new Uint8Array([0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7]).subarray(
      5
    );
    expect(bytesEqual(left, right)).toBe(true);
  });

  test("fast path failure start", () => {
    const left = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]).subarray(1);
    const right = new Uint8Array([0, 0, 0, 0, 0, 2, 2, 3, 4, 5, 6, 7]).subarray(
      5
    );
    expect(bytesEqual(left, right)).toBe(false);
  });

  test("fast path failure middle", () => {
    const left = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]).subarray(1);
    const right = new Uint8Array([0, 0, 0, 0, 0, 1, 2, 4, 4, 5, 6, 7]).subarray(
      5
    );
    expect(bytesEqual(left, right)).toBe(false);
  });

  test("fast path failure end", () => {
    const left = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]).subarray(1);
    const right = new Uint8Array([0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 8]).subarray(
      5
    );
    expect(bytesEqual(left, right)).toBe(false);
  });

  test("slow path success", () => {
    const left = new Uint8Array([1, 2, 3, 4, 5]);
    const right = new Uint8Array([0, 1, 2, 3, 4, 5]).subarray(1);
    expect(bytesEqual(left, right)).toBe(true);
  });

  test("slow path failure", () => {
    const left = new Uint8Array([1, 2, 3, 4, 5]);
    const right = new Uint8Array([0, 1, 2, 3, 4, 6]).subarray(1);
    expect(bytesEqual(left, right)).toBe(false);
  });
});

describe("indexOf()", () => {
  test("simple success", () => {
    const haystack = new Uint8Array([0, 1, 2]);
    const needle = new Uint8Array([1]);
    expect(indexOf(haystack, needle)).toEqual(1);
  });

  test("simple failure", () => {
    const haystack = new Uint8Array([0, 1, 2]);
    const needle = new Uint8Array([3]);
    expect(indexOf(haystack, needle)).toEqual(-1);
  });

  test("complex success", () => {
    const haystack = new Uint8Array([0, 1, 3, 1, 2, 3]);
    const needle = new Uint8Array([1, 2]);
    expect(indexOf(haystack, needle)).toEqual(3);
  });

  test("complex failure", () => {
    const haystack = new Uint8Array([0, 1, 3, 1, 4, 3]);
    const needle = new Uint8Array([1, 2]);
    expect(indexOf(haystack, needle)).toEqual(-1);
  });
});

test("splitStream()", async () => {
  const split = new Uint8Array([1, 2]);
  const input = [
    new Uint8Array([255, 1, 2, 3, 4, 1, 2, 1]),
    new Uint8Array([2, 5, 6, 7, 8]),
    new Uint8Array([9, 10, 11, 2, 1, 12, 13]),
    new Uint8Array([14, 15, 1, 2, 16]),
  ];
  const parts = [];
  for await (const part of splitStream(toAsyncIterable(input), split)) {
    parts.push(part);
  }
  const expected = [
    new Uint8Array([255]),
    new Uint8Array([3, 4]),
    new Uint8Array(0),
    new Uint8Array([5, 6, 7, 8, 9, 10, 11, 2, 1, 12, 13, 14, 15]),
    new Uint8Array([16]),
  ];
  expect(parts.length).toEqual(expected.length);
  for (const [i, part] of parts.entries()) {
    expect(bytesEqual(part, expected[i]!)).toBe(true);
  }
});

test("collect()", async () => {
  const res = await collect(
    toAsyncIterable([
      new Uint8Array([0, 1]),
      new Uint8Array([2, 3, 4]),
      new Uint8Array([5, 6]),
    ])
  );
  const expected = new Uint8Array([0, 1, 2, 3, 4, 5, 6]);
  expect(bytesEqual(res, expected)).toBe(true);
});

describe("decodeQuotedPrintable()", () => {
  test("success", async () => {
    const input = ["key=3Dvalue", "this line continues =", "on the next line"];
    const res = decoder.decode(
      await collect(
        decodeQuotedPrintable(
          toAsyncIterable(input.map((l) => encoder.encode(l)))
        )
      )
    );
    expect(res).toStrictEqual(
      "key=value\nthis line continues on the next line\n"
    );
  });

  test("ascii failure", async () => {
    const input = ["\xff"];
    const decoded = decodeQuotedPrintable(
      toAsyncIterable(input.map((l) => encoder.encode(l)))
    );
    await expect(async () => {
      for await (const _ of decoded) {
        //
      }
    }).rejects.toThrow("non-ascii");
  });

  test("encoding failure", async () => {
    const input = ["a=0"];
    const decoded = decodeQuotedPrintable(
      toAsyncIterable(input.map((l) => encoder.encode(l)))
    );
    await expect(async () => {
      for await (const _ of decoded) {
        //
      }
    }).rejects.toThrow("quoted printable escape");
  });
});

test("decodeIdentity()", async () => {
  const input = ["line ", "not ascii \xff"];
  const res = decoder.decode(
    await collect(
      decodeIdentity(toAsyncIterable(input.map((l) => encoder.encode(l))))
    )
  );
  expect(res).toStrictEqual("line not ascii \xff");
});

test("decodeBinary()", () => {
  expect(decodeBinary).toThrow("explicitly");
});
