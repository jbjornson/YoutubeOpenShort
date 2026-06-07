/**
 * Renders extension/icons/icon.svg to icon16.png, icon48.png, icon128.png
 * Run: node scripts/build-icons.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.resolve(__dirname, '../extension/icons');
const svgPath = path.join(iconsDir, 'icon.svg');
const svg = fs.readFileSync(svgPath);

for (const size of [16, 48, 128]) {
  const out = path.join(iconsDir, `icon${size}.png`);
  await sharp(svg, { density: 300 }).resize(size, size).png().toFile(out);
  console.log('Wrote', out);
}
