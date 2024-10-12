/* eslint-disable no-console */
import { argv } from "bun";
import { mkdir } from "node:fs/promises";
import yargs from "yargs";
import { parseMhtml } from ".";

async function* readFile(name: string): AsyncIterableIterator<Uint8Array> {
  const file = Bun.file(name);
  yield await file.bytes();
}

async function saveOutput(
  mkdir: Promise<unknown>,
  path: string,
  content: Uint8Array,
) {
  await mkdir;
  await Bun.write(path, content);
}

void (async () => {
  const args = await yargs(argv.slice(2))
    .scriptName("mhtml_stream")
    .usage("$0 <mhtml>", "parse mhtml and extract component files")
    .positional("mhtml", {
      describe: "the mhtml file to parse",
      type: "string",
    })
    .option("output", {
      alias: "o",
      describe: "output directory",
      type: "string",
    })
    .help()
    .alias("h", "help")
    .demandOption("mhtml")
    .strict().argv;
  const makeOut = args.output ? mkdir(args.output, { recursive: true }) : null;

  const proms = [];
  for await (const file of parseMhtml(readFile(args.mhtml))) {
    for (const [key, val] of file.headers) {
      console.log(key, ":", val);
    }
    const loc = file.headers.get("Content-Location");
    if (loc && args.output && makeOut) {
      const path = `${args.output}/${loc.replaceAll(/[:/]/g, "_")}`;
      proms.push(saveOutput(makeOut, path, file.content));
    }
    await Promise.all(proms);
    console.log("[done]");
  }
})();
