import sharp from "sharp";
import { mkdir, readFile } from "node:fs/promises";
const source = await readFile(new URL("../public/dorni-logo.svg", import.meta.url));
const directory = new URL("../public/icons/", import.meta.url);
await mkdir(directory, { recursive: true });
for (const [name, size] of [["icon-192.png",192],["icon-512.png",512],["apple-touch-icon.png",180]]) {
  await sharp(source).resize(size,size).flatten({background:"#071421"}).png().toFile(new URL(name,directory).pathname.replace(/^\/([A-Za-z]:)/,"$1"));
}
const mark = await sharp(source).resize(380,380).png().toBuffer();
await sharp({ create:{width:512,height:512,channels:4,background:"#071421"} }).composite([{input:mark,left:66,top:66}]).png().toFile(new URL("maskable-512.png",directory).pathname.replace(/^\/([A-Za-z]:)/,"$1"));
