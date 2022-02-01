import { ReadableStream } from "node:stream/web";
import { MhtmlHeaders, parseMhtml } from ".";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// from https://en.wikipedia.org/wiki/MIME#Multipart_messages
const example = `MIME-Version: 1.0
Subject: =?iso-8859-1?Q?=A1Hola,_se=F1or!?=
Content-Type: multipart/mixed; boundary=frontier

This is a message with multiple parts in MIME format.
--frontier
Content-Type: text/plain

This is the body of the message.
--frontier
Content-Type: application/octet-stream
Content-Transfer-Encoding: base64

PGh0bWw+CiAgPGhlYWQ+CiAgPC9oZWFkPgogIDxib2R5PgogICAgPHA+VGhpcyBpcyB0aGUg
Ym9keSBvZiB0aGUgbWVzc2FnZS48L3A+CiAgPC9ib2R5Pgo8L2h0bWw+Cg==
--frontier--
`;

function stringToStream(file: string): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(file.replaceAll("\n", "\r\n")));
      controller.close();
    },
  });
}

describe("parseMhtml()", () => {
  test("example", async () => {
    const files = [];
    for await (const file of parseMhtml(stringToStream(example))) {
      files.push(file);
    }
    const headers = files.map(({ headers }) => Object.fromEntries(headers));
    const expectedHeaders = [
      {
        "MIME-Version": "1.0",
        Subject: "¡Hola, señor!",
        "Content-Type": "multipart/mixed; boundary=frontier",
      },
      {
        "Content-Type": "text/plain",
      },
      {
        "Content-Type": "application/octet-stream",
        "Content-Transfer-Encoding": "base64",
      },
    ];
    expect(headers).toEqual(expectedHeaders);
    const text = files
      .slice(0, 2)
      .map(({ content }) => decoder.decode(content));
    const expectedText = [
      "This is a message with multiple parts in MIME format.",
      "This is the body of the message.",
    ];
    expect(text).toEqual(expectedText);
  });

  test("other headers", async () => {
    const content = `MIME-Version: 1.0
From: this is a wrapped: header
  with an extra delimiter in: both sections
Subject: =?utf-8?B?QmFzZSA2NCDigJQgTW96aWxsYSBEZXZlbG9wZXIgTmV0d29yaw==?=
Content-Type: multipart/mixed; boundary="quoted-frontier"

This is a message with multiple parts in MIME format.
--quoted-frontier--
`;
    const files = [];
    for await (const file of parseMhtml(stringToStream(content))) {
      files.push(file);
    }
    const headers = files.map(({ headers }) => Object.fromEntries(headers));
    const expectedHeaders = [
      {
        "MIME-Version": "1.0",
        From: "this is a wrapped: header with an extra delimiter in: both sections",
        Subject: "Base 64 \u2014 Mozilla Developer Network",
        "Content-Type": 'multipart/mixed; boundary="quoted-frontier"',
      },
    ];
    expect(headers).toEqual(expectedHeaders);
    const text = files.map(({ content }) => decoder.decode(content));
    const expectedText = [
      "This is a message with multiple parts in MIME format.",
    ];
    expect(text).toEqual(expectedText);
  });

  test("fails non-ascii in q-encoding", async () => {
    const content = `MIME-Version: 1.0
Subject: =?iso-8859-1?Q?=A1Hola,\xffse=F1or!?=
`;
    const parser = parseMhtml(stringToStream(content));
    await expect(async () => {
      for await (const _ of parser) {
        //
      }
    }).rejects.toThrow("got non-ascii character when decoding q-quoted word");
  });

  test("fails without empty header delimiter", async () => {
    const content = `MIME-Version: 1.0`;
    const parser = parseMhtml(stringToStream(content));
    await expect(async () => {
      for await (const _ of parser) {
        //
      }
    }).rejects.toThrow(
      "didn't find an empty line to signify the end of header parsing"
    );
  });

  test("fails with invalid header", async () => {
    const content = `MIME-Version: 1.0
invalid header

`;
    const parser = parseMhtml(stringToStream(content));
    await expect(async () => {
      for await (const _ of parser) {
        //
      }
    }).rejects.toThrow("header line didn't have key-value delimiter");
  });

  test("fails with missing Content-Type", async () => {
    const content = `MIME-Version: 1.0

`;
    const parser = parseMhtml(stringToStream(content));
    await expect(async () => {
      for await (const _ of parser) {
        //
      }
    }).rejects.toThrow("first headers didn't contain a content type");
  });

  test("fails with missing multipart", async () => {
    const content = `MIME-Version: 1.0
Content-Type: text/plain; boundary=frontier

`;
    const parser = parseMhtml(stringToStream(content));
    await expect(async () => {
      for await (const _ of parser) {
        //
      }
    }).rejects.toThrow("first content type header didn't contain");
  });

  test("fails with missing boundary", async () => {
    const content = `MIME-Version: 1.0
Content-Type: multipart/mixed

`;
    const parser = parseMhtml(stringToStream(content));
    await expect(async () => {
      for await (const _ of parser) {
        //
      }
    }).rejects.toThrow("first content type header didn't contain");
  });

  test("fails with missing decoder", async () => {
    const content = `MIME-Version: 1.0
Content-Transfer-Encoding: unknown
Content-Type: multipart/mixed; boundary=frontier

`;
    const parser = parseMhtml(stringToStream(content));
    await expect(async () => {
      for await (const _ of parser) {
        //
      }
    }).rejects.toThrow("unhandled encoding type: unknown");
  });

  test("fails without terminus", async () => {
    const content = `MIME-Version: 1.0
Content-Type: multipart/mixed; boundary=frontier

This is a message with multiple parts in MIME format.
`;
    const parser = parseMhtml(stringToStream(content));
    await expect(async () => {
      for await (const _ of parser) {
        //
      }
    }).rejects.toThrow(
      "stream didn't end with the appropriate termination boundary"
    );
  });
});

describe("MhtmlHeaders", () => {
  const headers = new MhtmlHeaders();
  headers.append("a", "b");
  headers.append("a", "c");
  headers.append("d", "e");

  test("entries()", () => {
    const entries = Object.fromEntries(headers.entries());
    expect(entries).toEqual({ a: "b, c", d: "e" });
  });

  test("entriesAll()", () => {
    const entriesAll = [...headers.entriesAll()].sort();
    expect(entriesAll).toEqual([
      ["a", "b"],
      ["a", "c"],
      ["d", "e"],
    ]);
  });

  test("get()", () => {
    expect(headers.get("a")).toStrictEqual("b, c");
    expect(headers.get("d")).toStrictEqual("e");
    expect(headers.get("f")).toStrictEqual(null);
  });

  test("getAll()", () => {
    expect(headers.getAll("a")).toEqual(["b", "c"]);
    expect(headers.getAll("d")).toEqual(["e"]);
    expect(headers.getAll("f")).toEqual([]);
  });

  test("has()", () => {
    expect(headers.has("a")).toBe(true);
    expect(headers.has("f")).toBe(false);
  });

  test("keys()", () => {
    const keys = [...headers.keys()].sort();
    expect(keys).toEqual(["a", "d"]);
  });

  test("values()", () => {
    const values = [...headers.values()].sort();
    expect(values).toEqual(["b, c", "e"]);
  });

  test("valuesAll()", () => {
    const valuesAll = [...headers.valuesAll()].sort();
    expect(valuesAll).toEqual(["b", "c", "e"]);
  });
});
