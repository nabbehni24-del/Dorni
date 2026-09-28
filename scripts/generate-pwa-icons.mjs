import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";

// Restore the supplied wordmark byte-for-byte from its source representation.
const wordmark = await readFile(new URL("../assets/dawrni-wordmark.png.base64", import.meta.url), "utf8");
await writeFile(new URL("../public/dawrni-wordmark.png", import.meta.url), Buffer.from(wordmark.trim(), "base64"));

const iconBase64 = await readFile(new URL("../assets/dawrni-app-icon.png.base64", import.meta.url), "utf8");
const suppliedIcon = Buffer.from(iconBase64.trim(), "base64");
const { data, info } = await sharp(suppliedIcon)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

// The supplied icon has a black preview matte around its rounded square.
// Extract its corrected white mark and place it on a matching full-bleed
// gradient. Mobile launchers own the final outer mask, so neither the preview
// matte nor the source square edge can appear around the installed app icon.
for (let offset = 0; offset < data.length; offset += 4) {
  const whiteness = Math.min(data[offset], data[offset + 1], data[offset + 2]);
  data[offset] = 255;
  data[offset + 1] = 255;
  data[offset + 2] = 255;
  data[offset + 3] = whiteness <= 110
    ? 0
    : whiteness < 220
      ? Math.round(((whiteness - 110) / 110) * 255)
      : 255;
}
const correctedMark = await sharp(data, { raw: info }).png().toBuffer();
const gradient = Buffer.from(`
  <svg width="${info.width}" height="${info.height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffad58"/>
        <stop offset="0.55" stop-color="#ff7549"/>
        <stop offset="1" stop-color="#ff493e"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#brand)"/>
  </svg>
`);
const fullBleed = await sharp(gradient)
  .composite([{ input: correctedMark }])
  .png()
  .toBuffer();
const directory = new URL("../public/icons/", import.meta.url);
await mkdir(directory, { recursive: true });
for (const [name, size] of [["icon-192.png",192],["icon-512.png",512],["apple-touch-icon.png",180]]) {
  await sharp(fullBleed).resize(size,size).png().toFile(new URL(name,directory).pathname.replace(/^\/([A-Za-z]:)/,"$1"));
}
await sharp(fullBleed).resize(512,512).png().toFile(new URL("maskable-512.png",directory).pathname.replace(/^\/([A-Za-z]:)/,"$1"));
