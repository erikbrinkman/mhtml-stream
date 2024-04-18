import { describe, expect, test } from "bun:test";
import { parseMhtml } from ".";
import { Headers } from "./headers";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// from https://en.wikipedia.org/wiki/MIME#Multipart_messages
// eslint-disable-next-line spellcheck/spell-checker
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

const newYorker = `From: <Saved by Blink>
Snapshot-Content-Location: https://www.newyorker.com/culture/cultural-comment/what-the-twilight-zone-reveals-about-todays-prestige-tv
Subject: =?utf-8?Q?What=20=E2=80=9CThe=20Twilight=20Zone=E2=80=9D=20Reveals=20Abou?=
 =?utf-8?Q?t=20Today=E2=80=99s=20Prestige=20TV=20|=20The=20New=20Yorker?=
Date: Sat, 16 Apr 2022 17:48:31 -0000
MIME-Version: 1.0
Content-Type: multipart/related;
	type="text/html";
	boundary="----MultipartBoundary--NYswbLinUCqE8KaJecg8DEV6giqFeyGLtHeT0qLB4h----"


------MultipartBoundary--NYswbLinUCqE8KaJecg8DEV6giqFeyGLtHeT0qLB4h------
`;

// eslint-disable-next-line @typescript-eslint/require-await
async function* stringToStream(
  file: string,
): AsyncIterableIterator<Uint8Array> {
  yield encoder.encode(file.replaceAll("\n", "\r\n"));
}

async function consume(iter: AsyncIterable<unknown>): Promise<void> {
  for await (const _ of iter) {
    //
  }
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
        // eslint-disable-next-line spellcheck/spell-checker
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
    // eslint-disable-next-line spellcheck/spell-checker
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

  test("escaped multi-line headers", async () => {
    const files = [];
    for await (const file of parseMhtml(stringToStream(newYorker))) {
      files.push(file);
    }
    const headers = files.map(({ headers }) => Object.fromEntries(headers));
    const expectedHeaders = [
      {
        // eslint-disable-next-line spellcheck/spell-checker
        "Content-Type": `multipart/related;type="text/html";boundary="----MultipartBoundary--NYswbLinUCqE8KaJecg8DEV6giqFeyGLtHeT0qLB4h----"`,
        Date: "Sat, 16 Apr 2022 17:48:31 -0000",
        From: "<Saved by Blink>",
        "MIME-Version": "1.0",
        "Snapshot-Content-Location":
          "https://www.newyorker.com/culture/cultural-comment/what-the-twilight-zone-reveals-about-todays-prestige-tv",
        Subject:
          // eslint-disable-next-line spellcheck/spell-checker
          "What “The Twilight Zone” Reveals About Today’s Prestige TV | The New Yorker",
      },
    ];
    expect(headers).toEqual(expectedHeaders);
    const text = files.map(({ content }) => decoder.decode(content));
    const expectedText = [""];
    expect(text).toEqual(expectedText);
  });

  test("fails non-ascii in q-encoding", async () => {
    // eslint-disable-next-line spellcheck/spell-checker
    const content = `MIME-Version: 1.0
Subject: =?iso-8859-1?Q?=A1Hola,\xffse=F1or!?=
`;
    const parser = parseMhtml(stringToStream(content));
    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression,@typescript-eslint/await-thenable
    await expect(consume(parser)).rejects.toThrow(
      "got non-ascii character when decoding q-quoted word",
    );
  });

  test("fails without empty header delimiter", async () => {
    const content = `MIME-Version: 1.0`;
    const parser = parseMhtml(stringToStream(content));
    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression,@typescript-eslint/await-thenable
    await expect(consume(parser)).rejects.toThrow(
      "didn't find an empty line to signify the end of header parsing",
    );
  });

  test("fails with invalid header", async () => {
    const content = `MIME-Version: 1.0
invalid header

`;
    const parser = parseMhtml(stringToStream(content));
    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression,@typescript-eslint/await-thenable
    await expect(consume(parser)).rejects.toThrow(
      "header line didn't have key-value delimiter",
    );
  });

  test("fails with missing Content-Type", async () => {
    const content = `MIME-Version: 1.0

`;
    const parser = parseMhtml(stringToStream(content));
    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression,@typescript-eslint/await-thenable
    await expect(consume(parser)).rejects.toThrow(
      "first headers didn't contain a content type",
    );
  });

  test("fails with missing multipart", async () => {
    const content = `MIME-Version: 1.0
Content-Type: text/plain; boundary=frontier

`;
    const parser = parseMhtml(stringToStream(content));
    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression,@typescript-eslint/await-thenable
    await expect(consume(parser)).rejects.toThrow(
      "first content type header didn't contain",
    );
  });

  test("fails with missing boundary", async () => {
    const content = `MIME-Version: 1.0
Content-Type: multipart/mixed

`;
    const parser = parseMhtml(stringToStream(content));
    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression,@typescript-eslint/await-thenable
    await expect(consume(parser)).rejects.toThrow(
      "first content type header didn't contain",
    );
  });

  test("fails with missing decoder", async () => {
    const content = `MIME-Version: 1.0
Content-Transfer-Encoding: unknown
Content-Type: multipart/mixed; boundary=frontier

`;
    const parser = parseMhtml(stringToStream(content));
    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression,@typescript-eslint/await-thenable
    await expect(consume(parser)).rejects.toThrow(
      "unhandled encoding type: unknown",
    );
  });

  test("fails without terminus", async () => {
    const content = `MIME-Version: 1.0
Content-Type: multipart/mixed; boundary=frontier

This is a message with multiple parts in MIME format.
`;
    const parser = parseMhtml(stringToStream(content));
    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression,@typescript-eslint/await-thenable
    await expect(consume(parser)).rejects.toThrow(
      "stream didn't end with the appropriate termination boundary",
    );
  });
});

describe("MhtmlHeaders", () => {
  const headers = new Headers();
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
