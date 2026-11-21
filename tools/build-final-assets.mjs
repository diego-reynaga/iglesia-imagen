// Final asset pipeline: semantic names, square mobile crops, editorial detail crop.
import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";

// Gentle, consistent grade for the whole set: a touch of contrast and colour,
// plus light output sharpening (applied after crop/resize).
const grade = (img) => img.linear(1.08, -128 * 0.08 + 2).modulate({ saturation: 1.07, brightness: 1.02 }).sharpen({ sigma: 0.6 });

const SRC = path.resolve("img/web");
const OUT = path.resolve("assets/img");
await fs.mkdir(OUT, { recursive: true });

const jobs = [
  { src: "DSC_0681.jpg", name: "cristo", square: { left: 500, top: 700, width: 3000, height: 3000 } },
  { src: "DSC_0683.jpg", name: "retablo", square: { left: 0, top: 600, width: 4000, height: 4000 } },
  { src: "DSC_0685.jpg", name: "pila", square: { left: 500, top: 1500, width: 3000, height: 3000 } },
];

const widths = [2000, 1400, 1000, 700];

for (const job of jobs) {
  const input = path.join(SRC, job.src);
  for (const w of widths) {
    await grade(sharp(input).rotate(-90).resize({ width: w, withoutEnlargement: true }))
      .webp({ quality: 84, effort: 5 }).toFile(path.join(OUT, `${job.name}-${w}.webp`));
    await grade(sharp(input).rotate(-90).resize({ width: w, withoutEnlargement: true }))
      .jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(OUT, `${job.name}-${w}.jpg`));
  }
  const oriented = await sharp(input).rotate(-90).toBuffer({ resolveWithObject: true });
  const maxW = oriented.info.width;
  for (const w of [1400, 1000, 700]) {
    await grade(sharp(input).rotate(-90).extract(job.square)
      .resize({ width: Math.min(w, job.square.width), withoutEnlargement: true }))
      .webp({ quality: 84, effort: 5 }).toFile(path.join(OUT, `${job.name}-square-${w}.webp`));
    await grade(sharp(input).rotate(-90).extract(job.square)
      .resize({ width: Math.min(w, job.square.width), withoutEnlargement: true }))
      .jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(OUT, `${job.name}-square-${w}.jpg`));
  }
  console.log(job.name, "full", maxW, "x", oriented.info.height);
}

// Editorial detail: gold carved column of the altarpiece
const detail = { left: 150, top: 1000, width: 1700, height: 2550 };
for (const w of [1400, 1000, 700]) {
  await grade(sharp(path.join(SRC, "DSC_0683.jpg")).rotate(-90).extract(detail)
    .resize({ width: w, withoutEnlargement: true }))
      .webp({ quality: 85, effort: 5 }).toFile(path.join(OUT, `oficio-${w}.webp`));
  await grade(sharp(path.join(SRC, "DSC_0683.jpg")).rotate(-90).extract(detail)
    .resize({ width: w, withoutEnlargement: true }))
      .jpeg({ quality: 85, mozjpeg: true }).toFile(path.join(OUT, `oficio-${w}.jpg`));
}
await sharp(path.join(SRC, "DSC_0683.jpg")).rotate(-90).extract(detail)
  .resize({ width: 700 })
      .jpeg({ quality: 80 }).toFile(path.join(OUT, "oficio-preview.jpg"));

const files = await fs.readdir(OUT);
let total = 0;
for (const f of files) total += (await fs.stat(path.join(OUT, f))).size;
console.log("files", files.length, "totalMB", (total / 1048576).toFixed(2));
