// Build oriented previews + responsive web assets from the extracted NEF JPEGs.
import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";

const src = ["DSC_0681", "DSC_0683", "DSC_0685"];
const outDir = path.resolve("img/web");
await fs.mkdir(path.join(outDir, "preview"), { recursive: true });

for (const name of src) {
  const input = path.join(outDir, `${name}.jpg`);
  const meta = await sharp(input).metadata();
  console.log(name, "raw", meta.width, "x", meta.height, "orientation", meta.orientation);

  // Oriented preview for inspection
  await sharp(input)
    .rotate(-90)
    .resize({ width: 1200, withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toFile(path.join(outDir, "preview", `${name}.jpg`));

  // Responsive web variants (WebP + JPEG fallback)
  for (const width of [2000, 1400, 1000, 700]) {
    await sharp(input)
      .rotate(-90)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 84, effort: 5 })
      .toFile(path.join(outDir, `${name}-${width}.webp`));
    await sharp(input)
      .rotate(-90)
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality: 84, mozjpeg: true })
      .toFile(path.join(outDir, `${name}-${width}.jpg`));
  }
  const oriented = await sharp(input).rotate(-90).metadata();
  console.log(name, "oriented", oriented.width, "x", oriented.height);
}

