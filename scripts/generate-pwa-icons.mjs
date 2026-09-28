import sharp from "sharp";
import { mkdir, readFile, writeFile } from "node:fs/promises";

// Restore the supplied wordmark byte-for-byte from its source representation.
const wordmark = await readFile(new URL("../assets/dawrni-wordmark.png.base64", import.meta.url), "utf8");
await writeFile(new URL("../public/dawrni-wordmark-brand5.png", import.meta.url), Buffer.from(wordmark.trim(), "base64"));

const iconBase64 = await readFile(new URL("../assets/dawrni-app-icon.png.base64", import.meta.url), "utf8");
const suppliedIcon = Buffer.from(iconBase64.trim(), "base64");
const { data: sourcePixels, info } = await sharp(suppliedIcon)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

// The supplied icon has a black preview matte around its rounded square.
// Keep every visible orange and white source pixel in its original position.
// Only replace the black matte (and softly blend its antialiased boundary), so
// the supplied glyph is never traced, redrawn, stretched or re-proportioned.
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
const { data: gradientPixels } = await sharp(gradient)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const exactArtwork = Buffer.from(sourcePixels);
for (let offset = 0; offset < exactArtwork.length; offset += 4) {
  const brightestChannel = Math.max(
    sourcePixels[offset],
    sourcePixels[offset + 1],
    sourcePixels[offset + 2],
  );
  const sourceWeight = Math.max(0, Math.min(1, (brightestChannel - 24) / 156));
  if (sourceWeight >= 1) continue;
  for (let channel = 0; channel < 3; channel += 1) {
    exactArtwork[offset + channel] = Math.round(
      gradientPixels[offset + channel] * (1 - sourceWeight)
      + sourcePixels[offset + channel] * sourceWeight,
    );
  }
  exactArtwork[offset + 3] = 255;
}
const fullBleed = await sharp(exactArtwork, { raw: info }).png().toBuffer();
const directory = new URL("../public/icons/", import.meta.url);
await mkdir(directory, { recursive: true });
for (const [name, size] of [["icon-192.png",192],["icon-512.png",512],["apple-touch-icon.png",180]]) {
  await sharp(fullBleed).resize(size,size).png().toFile(new URL(name,directory).pathname.replace(/^\/([A-Za-z]:)/,"$1"));
}
await sharp(fullBleed).resize(512,512).png().toFile(new URL("maskable-512.png",directory).pathname.replace(/^\/([A-Za-z]:)/,"$1"));
