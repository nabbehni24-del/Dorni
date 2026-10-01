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

// Extract the supplied glyph; never traced, redrawn, stretched or re-proportioned.
// Replace the preview matte and baked-in corner outline with a clean background.
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
// Source glyph proportions stay intact. Launcher artwork below has no baked-in
// rounded-square outline: the operating system owns the final icon mask.
const directory = new URL("../public/icons/", import.meta.url);
await mkdir(directory, { recursive: true });
// Android uses the badge's alpha silhouette, not the launcher icon's colors.
// Extract the existing white brand glyph; never include its orange square.
const badgePixels = Buffer.alloc(sourcePixels.length);
for (let offset = 0; offset < sourcePixels.length; offset += 4) {
  const white = Math.min(sourcePixels[offset], sourcePixels[offset + 1], sourcePixels[offset + 2]);
  badgePixels[offset] = badgePixels[offset + 1] = badgePixels[offset + 2] = 255;
  badgePixels[offset + 3] = white > 225 ? sourcePixels[offset + 3] : 0;
}
await sharp(badgePixels, { raw: info }).trim().resize(80,80,{fit:'contain',background:'#00000000'})
  .extend({top:8,bottom:8,left:8,right:8,background:'#00000000'}).png()
  .toFile(new URL('notification-badge-v1.png',directory).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const glyph = await sharp(badgePixels,{raw:info}).trim().png().toBuffer();
for (const [name, size, glyphSize] of [["icon-192.png",192,132],["icon-512.png",512,352],["apple-touch-icon.png",180,124],["maskable-512.png",512,280]]) {
  const foreground=await sharp(glyph).resize(glyphSize,glyphSize,{fit:'contain',background:'#00000000'}).png().toBuffer();
  const artwork=await sharp(gradient).resize(size,size).composite([{input:foreground,gravity:'centre'}]).png().toBuffer();
  await writeFile(new URL(name,directory),artwork);
}
