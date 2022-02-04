import { toByteArray } from "base64-js";
import {
  asIterable,
  bytesEqual,
  collect,
  decodeBase64,
  decodeBinary,
  decodeIdentity,
  decodeQuotedPrintable,
  splitStream,
} from "./utils";

// NOTE we use this for ascii because it's faster than manual, but may cause
// unexpected errors if the assumption is violated
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * class for storing headers parse from MHTML
 *
 * Tries to somewhat mimic the behavior of the fetch-api Headers object, with
 * some differences, notably that it does no validation.
 */
export class MhtmlHeaders {
  #raw: Map<string, string[]> = new Map();

  [Symbol.iterator](): Iterator<[string, string]> {
    return this.entries();
  }

  /**
   * add a key-value pair
   *
   * If key is already present it will be appended.
   */
  append(key: string, value: string): void {
    const list = this.#raw.get(key);
    if (list === undefined) {
      this.#raw.set(key, [value]);
    } else {
      list.push(value);
    }
  }

  /**
   * iterate over all key-value pairs
   *
   * Multiple values for the same key will be joined in the order they were
   * added by `delim`.
   */
  *entries(delim: string = ", "): IterableIterator<[string, string]> {
    for (const [key, values] of this.#raw.entries()) {
      yield [key, values.join(delim)];
    }
  }

  /**
   * iterate over all key-value pairs
   *
   * Multiple values for the same key will get iterated in the order they were
   * added.
   */
  *entriesAll(): IterableIterator<[string, string]> {
    for (const [key, values] of this.#raw.entries()) {
      for (const val of values) {
        yield [key, val];
      }
    }
  }

  /**
   * get the value for a key
   *
   * If the key is missing, null will be returned, if multiple values for the
   * key are present, they will be joined be `delim`.
   */
  get(key: string, delim: string = ", "): string | null {
    const vals = this.#raw.get(key);
    if (vals === undefined) {
      return null;
    } else {
      return vals.join(delim);
    }
  }

  /**
   * get all values for a key
   */
  getAll(key: string): string[] {
    return this.#raw.get(key) ?? [];
  }

  /**
   * whether key has any values associated with it
   */
  has(key: string): boolean {
    return this.#raw.has(key);
  }

  /**
   * all keys with at least one value
   */
  keys(): Iterable<string> {
    return this.#raw.keys();
  }

  /**
   * iterate over all values
   *
   * If a key has multiple values they will be joined by `delim`.
   */
  *values(delim: string = ", "): IterableIterator<string> {
    for (const vals of this.#raw.values()) {
      yield vals.join(delim);
    }
  }

  /**
   * iterate over all values added
   */
  *valuesAll(): IterableIterator<string> {
    for (const vals of this.#raw.values()) {
      yield* vals;
    }
  }
}

/**
 * decode a q-encoded token
 */
function decodeQEncoding(text: string): Uint8Array {
  const res = new Uint8Array(text.length);
  let destInd = 0;
  for (let ind = 0; ind < text.length; ++ind) {
    const code = text.charCodeAt(ind);
    let val;
    if (code >= 128) {
      throw new Error(
        `got non-ascii character when decoding q-quoted word: "${text}"`
      );
    } else if (code === 95) {
      // Q encoding replaces underscore with space
      val = 32;
    } else if (code === 61) {
      // encoded character
      val = parseInt(text[++ind]!, 16);
      val *= 16;
      val += parseInt(text[++ind]!, 16);
    } else {
      // residual ascii
      val = code;
    }
    res[destInd++] = val;
  }
  return res.subarray(0, destInd);
}

const encodeFormat = /^=\?([^?\s]+)\?([BQ])\?([^?\s]+)\?=$/;

/**
 * decode a header line that may have an extra encoding in it
 */
function decodeLine(line: string): string {
  // TODO this might make more sense as a function as part of a regex replaceAll
  const match = encodeFormat.exec(line);
  if (match) {
    const [, charset, encoding, text] = match;
    let buff;
    /* istanbul ignore else */
    if (encoding === "Q") {
      buff = decodeQEncoding(text!);
    } else if (encoding === "B") {
      buff = toByteArray(text!);
    } else {
      // NOTE should be impossible
      throw new Error(
        `unknown encoding for header value encoding: ${encoding}`
      );
    }
    return new TextDecoder(charset).decode(buff);
  } else {
    return line;
  }
}

/**
 * parse headers from line delimited buffers
 *
 * @remarks
 * This is not fully compatible header parsing, since we overwrite identical
 * keys instead of storing multiple
 */
async function parseHeaders(
  iter: AsyncIterator<Uint8Array>
): Promise<MhtmlHeaders> {
  const headers = new MhtmlHeaders();
  let key = "";
  let val = "";
  for (;;) {
    const { done, value } = await iter.next();
    if (done) {
      throw new Error(
        "didn't find an empty line to signify the end of header parsing"
      );
    }
    const line = decoder.decode(value);
    if (/^\s/.test(line)) {
      // header folded
      val += " ";
      val += decodeLine(line.trimStart());
    } else {
      if (key) {
        headers.append(key, val);
      }
      if (line) {
        const delim = line.indexOf(": ");
        if (delim === -1) {
          throw new Error(
            `header line didn't have key-value delimiter: "${line}"`
          );
        }
        key = line.slice(0, delim);
        val = decodeLine(line.slice(delim + 2));
      } else {
        return headers;
      }
    }
  }
}

/**
 * a file that was encoded in MHTML format
 */
export interface MhtmlFile {
  headers: MhtmlHeaders;
  content: Uint8Array;
}

/**
 * The decoder of any Content-Transfer-Encoding
 */
export interface Decoder {
  (lines: AsyncIterable<Uint8Array>): AsyncIterable<Uint8Array>;
}

// Default decoders
const defaultDecoders = new Map<string, Decoder>([
  ["7bit", decodeIdentity],
  ["base64", decodeBase64],
  ["quoted-printable", decodeQuotedPrintable],
  ["8bit", decodeIdentity],
  ["binary", decodeBinary],
]);

/**
 * extract the boundary condition from a multipart header
 *
 * returns the boundary and terminating condition as Uint8Arrays
 */
function getBoundary(headers: MhtmlHeaders): [Uint8Array, Uint8Array] {
  const contentType = headers.get("Content-Type");
  if (contentType === null) {
    throw new Error(
      `first headers didn't contain a content type: ${JSON.stringify(
        Object.fromEntries(headers)
      )}`
    );
  }
  let bound = undefined;
  let multipart = false;
  for (const field of contentType.split("; ")) {
    if (field.startsWith("multipart/")) {
      multipart = true;
    } else if (field.startsWith("boundary=")) {
      bound = field.slice(9);
      // TODO handling of quoted fields is not great
      if (bound.startsWith('"') && bound.endsWith('"')) {
        bound = bound.slice(1, -1);
      }
    }
  }
  if (!multipart || bound === undefined) {
    throw new Error(
      `first content type header didn't contain 'multipart/...' and a boundary string`
    );
  }

  const boundary = encoder.encode(`--${bound}`);
  const terminus = encoder.encode(`--${bound}--`);
  return [boundary, terminus];
}

/**
 * parse a readable stream into an async iterator of MHTML files
 *
 * decoderOverrides can be used to overwrite default encoders or specify your
 * own if a Content-Transfer-Encoding isn't handled properly
 */
export async function* parseMhtml(
  stream: ReadableStream<ArrayBuffer>,
  {
    decoderOverrides = new Map(),
  }: { decoderOverrides?: Map<string, Decoder> } = {}
): AsyncIterableIterator<MhtmlFile> {
  // initial setup
  const decoders = new Map([
    ...defaultDecoders.entries(),
    ...decoderOverrides.entries(),
  ]);
  const crlf = new Uint8Array([13, 10]);
  const lines = splitStream(asIterable(stream), crlf);

  let bound = null;
  let cont = true;

  while (cont) {
    // parse out headers and get encoding for content
    const headers = await parseHeaders(lines);
    const [boundary, terminus] = bound ?? (bound = getBoundary(headers));

    const encoding = headers.get("Content-Transfer-Encoding") ?? "7bit";
    const decode = decoders.get(encoding);
    if (decode === undefined) {
      throw new Error(`unhandled encoding type: ${encoding}`);
    }

    // create line iterator that only iterates over content lines (checking for
    // the boundaries), then pass into decoder
    const content = await collect(
      decode({
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<Uint8Array>> {
              const { done, value } = await lines.next();
              if (done) {
                throw new Error(
                  `stream didn't end with the appropriate termination boundary: ${decoder.decode(
                    terminus
                  )}`
                );
              } else if (bytesEqual(value, boundary)) {
                return { done: true, value: undefined };
              } else if (bytesEqual(value, terminus)) {
                cont = false;
                return { done: true, value: undefined };
              } else {
                return { value };
              }
            },
          };
        },
      })
    );

    yield { headers, content };
  }
}
