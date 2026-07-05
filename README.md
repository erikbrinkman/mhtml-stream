MHTML Stream
============
[![build](https://github.com/erikbrinkman/mhtml-stream/actions/workflows/build.yml/badge.svg)](https://github.com/erikbrinkman/mhtml-stream/actions/workflows/build.yml)
[![docs](https://img.shields.io/badge/docs-docs-blue)](https://erikbrinkman.github.io/mhtml-stream/)
[![npm](https://img.shields.io/npm/v/mhtml-stream)](https://www.npmjs.com/package/mhtml-stream)
[![license](https://img.shields.io/github/license/erikbrinkman/mhtml-stream)](LICENSE)

Library for parsing MHTML data as streams using modern WHATWG streams and async
iterators. Because it relies on modern cross javascript standards it works
out-of-the-box in all javascript environments, with only a little tweaking
necessary for module definitions.

Usage
-----

```javascript
import { parseMhtml } from "mhtml-stream";

for await (const { headers, content } of parseMhtml(...)) {
  // ... : an async iterable of ArrayBuffers. This is very similar to the
  //   interface of a ReadableStream, but is a little more platform agnostic
  //   given that node handles streams significantly differently.

  // headers : a key-value object with the header information

  // content : a Uint8Array of the raw data, if you want as a string, `new
  //   TextDecoder().decode(content)` should work if the contents were utf-8 /
  //   ascii encoded

  // NOTE in many MHTML files, the initial file is empty and contains headers
  // for how to parse each individual included file.
}
```

Notes
-----

- As far as I can tell, header folding behavior is not well defined when it
  comes to whether whitespace should be added when unfolding. This currently
  uses the first whitespace character to indicate folding, and preservers any
  others.
- Decoded part content preserves the original MIME line endings. The parser
  splits the stream on `\r\n`, and the quoted-printable and 7bit/8bit decoders
  re-insert that `\r\n` between lines, so extraction is lossless. Both decoders
  accept a `newLine` argument if you'd rather normalize to `\n`.
