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
      fourLen,
    );
    const right32 = new Uint32Array(
      right.buffer,
      right.byteOffset + begin,
      fourLen,
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
  iter: AsyncIterable<Uint8Array>,
  split: Uint8Array,
): AsyncIterableIterator<Uint8Array> {
  let current = new Uint8Array(0);
  for await (const chunk of iter) {
    current = current.length
      ? concat([current, chunk])
      : (chunk as Uint8Array<ArrayBuffer>);
    let nextInd: number;
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
function concat(chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
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
  stream: AsyncIterable<Uint8Array>,
): Promise<Uint8Array> {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return concat(chunks);
}

// CRLF, the canonical MIME line separator the stream is split on
const crlf = new Uint8Array([13, 10]);

/** whether a character code is a hex digit (0-9, A-F, a-f) */
export function isHexDigit(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 70) ||
    (code >= 97 && code <= 102)
  );
}

/**
 * decoder for quoted printable
 *
 * If quoted printable "lines" aren't escaped with an "=" then a new line needs
 * to be inserted. We use `newLine`, which defaults to CRLF to match the
 * canonical MIME form; pass a custom separator (e.g. a single "\n") to
 * normalize instead. The separator is emitted between lines, never after the
 * last one, since the CRLF preceding the MIME boundary belongs to the
 * delimiter, not the body.
 */
export async function* decodeQuotedPrintable(
  lines: AsyncIterable<Uint8Array>,
  newLine: Uint8Array = crlf,
): AsyncIterableIterator<Uint8Array> {
  let pendingNewLine = false; // a hard line break from the previous line
  for await (const bytes of lines) {
    const res = new Uint8Array(bytes.length + newLine.length);
    let destInd = 0;
    if (pendingNewLine) {
      res.set(newLine, destInd);
      destInd += newLine.length;
      pendingNewLine = false;
    }
    let softLine = false; // if newline was escaped, so we shouldn't add one
    for (let ind = 0; ind < bytes.length; ++ind) {
      const code = bytes[ind]!;
      if (code >= 128) {
        throw new Error(
          `got non-ascii character when decoding quoted printable: ${code}`,
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
              "quoted printable escape (=) was not followed by two bytes",
            );
          } else if (!isHexDigit(first) || !isHexDigit(second)) {
            throw new Error(
              `quoted printable escape (=) was not followed by two hex digits: "=${String.fromCharCode(first, second)}"`,
            );
          }
          res[destInd++] = parseInt(String.fromCharCode(first, second), 16);
        }
      }
    }
    if (!softLine) {
      pendingNewLine = true;
    }
    yield res.subarray(0, destInd);
  }
}

const decoder = new TextDecoder();

/**
 * decoder for base64
 *
 * RFC 2045 requires decoders to ignore line breaks and decode the concatenated
 * stream, so producers may wrap at any column. We strip whitespace and buffer
 * characters that don't yet form a complete four-character quantum, flushing
 * the remainder at the end of the part.
 */
export async function* decodeBase64(
  lines: AsyncIterable<Uint8Array>,
): AsyncIterableIterator<Uint8Array> {
  let residual = "";
  for await (const bytes of lines) {
    residual += decoder.decode(bytes).replace(/\s/g, "");
    const usable = residual.length - (residual.length % 4);
    if (usable > 0) {
      yield toByteArray(residual.slice(0, usable));
      residual = residual.slice(usable);
    }
  }
  if (residual.length > 0) {
    yield toByteArray(residual);
  }
}

/**
 * decoder for 7bit and 8bit
 *
 * 7bit/8bit apply no transfer transformation, so the content bytes are the
 * payload as-is. parseMhtml splits the stream on CRLF to find part boundaries,
 * so we re-insert `newLine` (defaulting to CRLF) between lines to restore the
 * original bytes exactly. Pass `newLine` (e.g. a single "\n") to normalize line
 * endings instead. The separator is emitted between lines, never after the last
 * one, since the CRLF preceding the boundary belongs to the delimiter.
 */
export async function* decodeIdentity(
  lines: AsyncIterable<Uint8Array>,
  newLine: Uint8Array = crlf,
): AsyncIterableIterator<Uint8Array> {
  let first = true;
  for await (const bytes of lines) {
    if (first) {
      first = false;
    } else {
      yield newLine;
    }
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
    "binary transfer-encoding is explicitly not supported and trying to add an implementation will likely result in unexpected results, but if you want to handle it anyway, override `binary` in `decoderOverrides`",
  );
}
