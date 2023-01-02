/**
 * Utilities
 *
 * Most of these use Uint8Array explicitely because we don't care about a raw
 * buffer, but about views of bytes, and this makes sure that we handle the
 * types appropriately.
 *
 * @packageDocumentation
 */
import { toByteArray } from "base64-js";

/**
 * create a Uint8Array from a buffer
 *
 * This method is necessary since creating a Uint8Array from a view will copy
 * the elements instead of creating a view of the underling buffer.
 */
export function toBytes(buff: ArrayBuffer): Uint8Array {
  if (ArrayBuffer.isView(buff)) {
    return new Uint8Array(buff.buffer, buff.byteOffset, buff.byteLength);
  } else {
    return new Uint8Array(buff);
  }
}

/**
 * Compare two byte arrays for equality
 */
export function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  } else if (left.byteOffset % 4 === right.byteOffset % 4) {
    // words align, can use fast path
    const begin = (4 - (left.byteOffset % 4)) % 4;
    const fourLen = Math.floor((left.byteLength - begin) / 4);
    const end = begin + fourLen * 4;
    const left32 = new Uint32Array(
      left.buffer,
      left.byteOffset + begin,
      fourLen
    );
    const right32 = new Uint32Array(
      right.buffer,
      right.byteOffset + begin,
      fourLen
    );
    for (let i = 0; i < begin; ++i) {
      if (left[i] !== right[i]) {
        return false;
      }
    }
    for (let i = 0; i < fourLen; ++i) {
      if (left32[i] !== right32[i]) {
        return false;
      }
    }
    for (let i = end; i < left.length; ++i) {
      if (left[i] !== right[i]) {
        return false;
      }
    }
    return true;
  } else {
    // slower byte path
    for (const ind of left.keys()) {
      if (left[ind] !== right[ind]) {
        return false;
      }
    }
    return true;
  }
}

/**
 * Find index of one byte array in another
 */
export function indexOf(haystack: Uint8Array, needle: Uint8Array): number {
  return haystack.findIndex((val, ind) => {
    if (val !== needle[0] || ind + needle.length > haystack.length) {
      return false;
    } else {
      for (let i = 1; i < needle.length; ++i) {
        if (haystack[ind + i] !== needle[i]) {
          return false;
        }
      }
      return true;
    }
  });
}

/**
 * Split a stream of bytes
 *
 * Takes a stream of data modeled as an async iterator of ArrayBuffer for
 * compatibility between node and web, and splits it into an async iterator
 * where each value is delimited by the split sequence.
 */
export async function* splitStream(
  iter: AsyncIterable<ArrayBuffer>,
  split: Uint8Array
): AsyncIterableIterator<Uint8Array> {
  let current = new Uint8Array(0);
  for await (const chunk of iter) {
    const next = toBytes(chunk);
    current = current.length ? concat([current, next]) : next;
    let nextInd;
    while ((nextInd = indexOf(current, split)) !== -1) {
      yield current.subarray(0, nextInd);
      current = current.subarray(nextInd + split.length);
    }
  }
  yield current;
}

/**
 * concatenate multiple buffers
 */
function concat(chunks: Uint8Array[]): Uint8Array {
  const totalBytes = chunks.reduce((t, c) => t + c.length, 0);
  const res = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    res.set(chunk, offset);
    offset += chunk.length;
  }
  return res;
}

/**
 * collect an async iterable of buffers into one
 */
export async function collect(
  stream: AsyncIterable<Uint8Array>
): Promise<Uint8Array> {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return concat(chunks);
}

// default new line character for quoted printable decoding
const defaultNewLine = new Uint8Array([10]);

/**
 * decoder for quoted printable
 *
 * If quoted printable "lines" aren't escaped with an "=" then a new line needs
 * to be inserted. We use `newLine` which defaults to a single "\n".
 */
export async function* decodeQuotedPrintable(
  lines: AsyncIterable<Uint8Array>,
  newLine: Uint8Array = defaultNewLine
): AsyncIterableIterator<Uint8Array> {
  for await (const bytes of lines) {
    const res = new Uint8Array(bytes.length + newLine.length);
    let softLine = false; // if newline wasn't escaped so we need to add
    let destInd = 0;
    for (let ind = 0; ind < bytes.length; ++ind) {
      const code = bytes[ind]!;
      if (code >= 128) {
        throw new Error(
          `got non-ascii character when decoding quoted printable: ${code}`
        );
      }
      if (code !== 61) {
        res[destInd++] = code;
      } else {
        // escaped char
        const first = bytes[++ind];
        if (first === undefined) {
          // soft newline
          softLine = true;
        } else {
          const second = bytes[++ind];
          if (second === undefined) {
            throw new Error(
              "quoted printable escape (=) was not followed by two bytes"
            );
          }
          let val = parseInt(String.fromCharCode(first), 16);
          val *= 16;
          val += parseInt(String.fromCharCode(second), 16);
          res[destInd++] = val;
        }
      }
    }
    if (!softLine) {
      res.set(newLine, destInd);
      destInd += newLine.length;
    }
    yield res.subarray(0, destInd);
  }
}

const decoder = new TextDecoder();

/**
 * decoder for base64
 */
export async function* decodeBase64(
  lines: AsyncIterable<Uint8Array>
): AsyncIterableIterator<Uint8Array> {
  for await (const bytes of lines) {
    yield toByteArray(decoder.decode(bytes));
  }
}

/**
 * decoder for 7bit and 8bit
 */
export async function* decodeIdentity(
  lines: AsyncIterable<Uint8Array>
): AsyncIterableIterator<Uint8Array> {
  for await (const bytes of lines) {
    yield bytes;
  }
}

/**
 * decoder for binary
 *
 * For implementation reasons, binary can't be supported, so we throw a special
 * error.
 */
export function decodeBinary(): never {
  throw new Error(
    "binary transfer-encoding is explicitly not supported and trying to add an implementation will likely result in unexpected results, but if you want to ignore anyway, set binary to `decode8bit`"
  );
}
