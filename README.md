MHTML Stream
============
[![build](https://github.com/erikbrinkman/mhtml-stream/actions/workflows/node.js.yml/badge.svg)](https://github.com/erikbrinkman/mhtml-stream/actions/workflows/node.js.yml)

Zero-dependency Library for parsing MHTML data as streams using modern WHATWG
streams and async iterators. Because it relies on modern cross javascript
standards it works out-of-the-box in all javascript environments, with only a
little tweaking necessary for module definitions.

Usage
-----

```javascript
import { parseMhtml } from "mhtml-stream";

for await (const { headers, content } of parseMhtml(...)) {
  // headers : a key-value object with the header information

  // content : a Uint8Array of the raw data, if you want as a string, `new
  //   TextDecoder().decode(content)` should work if the contents were utf-8 /
  //   ascii encoded

  // NOTE in many MHTML files, the initial file is empty and contains headers
  // for how to parse each individual included file.
}
```
