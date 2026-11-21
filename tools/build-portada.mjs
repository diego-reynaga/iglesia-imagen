// Portada (hero) crop: close-up of the Cristo's face, 2:3 for the rail + square for mobile.
import sharp from "sharp";
import path from "node:path";

// Gentle, consistent grade for the whole set: a touch of contrast and colour,
// plus light output sharpening (applied after crop/resize).
const grade = (img) => img.linear(1.08, -128 * 0.08 + 2).modulate({ saturation: 1.07, brightness: 1.02 }).sharpen({ sigma: 0.6 });
const input = path.resolve("img/web/DSC_0681.jpg");
const OUT = path.resolve("assets/img");
const crop = { left: 700, top: 700, width: 2400, height: 3600 };
const square = { left: 700, top: 900, width: 2400, height: 2400 };
for (const w of [2000, 1400, 1000, 700]) {
  const base = () => grade(sharp(input).rotate(-90).extract(crop).resize({ width: w }));
  await base().webp({ quality: 84, effort: 5 }).toFile(path.join(OUT, `portada-${w}.webp`));
  await base().jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(OUT, `portada-${w}.jpg`));
}
for (const w of [1400, 1000, 700]) {
  const base = () => grade(sharp(input).rotate(-90).extract(square).resize({ width: w }));
  await base().webp({ quality: 84, effort: 5 }).toFile(path.join(OUT, `portada-square-${w}.webp`));
  await base().jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(OUT, `portada-square-${w}.jpg`));
}
console.log("ok");
