import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
const destination = new URL("../public/vendor/", import.meta.url);
const source = new URL("../node_modules/ammojs3/", import.meta.url);
await mkdir(destination, { recursive: true });
const javascript = await readFile(
  new URL("builds/ammo.wasm.js", source),
  "utf8",
);
await writeFile(
  new URL("ammo.mjs", destination),
  javascript + "\nexport default Ammo;\n",
);
await copyFile(
  new URL("builds/ammo.wasm.wasm", source),
  new URL("ammo.wasm.wasm", destination),
);
await copyFile(
  new URL("LICENSE", source),
  new URL("ammo.LICENSE", destination),
);
