import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";
// Restore the supplied PNG byte-for-byte from its source representation.
const wordmark = await readFile(new URL("../assets/dawrni-wordmark.png.base64", import.meta.url), "utf8");
await writeFile(new URL("../public/dawrni-wordmark.png", import.meta.url), Buffer.from(wordmark.trim(), "base64"));
const source = await readFile(new URL("../public/dawrni-app-icon.svg", import.meta.url));
// Launcher owns the outer shape. Extend the gradient to every edge and keep
// the white mark within the maskable safe area rather than nesting a square.
const fullBleed = source.toString()
  .replace(/<rect[^>]+\/>/, '<rect width="512" height="512" fill="url(#bg)"/>')
  .replace(/<path/, '<g transform="translate(256 256) scale(0.82) translate(-256 -256)"><path')
  .replace('</svg>', '</g></svg>');
const directory = new URL("../public/icons/", import.meta.url);
await mkdir(directory, { recursive: true });
for (const [name, size] of [["icon-192.png",192],["icon-512.png",512],["apple-touch-icon.png",180]]) {
  await sharp(Buffer.from(fullBleed)).resize(size,size).png().toFile(new URL(name,directory).pathname.replace(/^\/([A-Za-z]:)/,"$1"));
}
await sharp(Buffer.from(fullBleed)).resize(512,512).png().toFile(new URL("maskable-512.png",directory).pathname.replace(/^\/([A-Za-z]:)/,"$1"));
