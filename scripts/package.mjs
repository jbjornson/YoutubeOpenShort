/**
 * Builds versioned release zips of extension/ into dist/:
 *   dist/shorts-reels-as-video-chrome-<version>.zip   (Chrome Web Store / Load unpacked)
 *   dist/shorts-reels-as-video-firefox-<version>.zip  (addons.mozilla.org)
 * Run: node scripts/package.mjs
 *      node scripts/package.mjs --notes <file>   also writes this version's changelog entry from README.md
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const extDir = path.join(root, 'extension');
const distDir = path.join(root, 'dist');

const EXCLUDE = new Set(['manifest.json.firefox', 'icon.svg', '.DS_Store', 'Thumbs.db']);

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const chromeManifest = readJson(path.join(extDir, 'manifest.json'));
const firefoxManifest = readJson(path.join(extDir, 'manifest.json.firefox'));
const version = chromeManifest.version;

if (firefoxManifest.version !== version) {
  console.error(
    `Version mismatch: manifest.json is ${version}, manifest.json.firefox is ${firefoxManifest.version}`
  );
  process.exit(1);
}

/** Returns this version's `### <version>` section of the README changelog, or null. */
export function changelogFor(v) {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const lines = readme.split('\n');
  const start = lines.findIndex((l) => l.trim() === `### ${v}`);
  if (start === -1) return null;
  let end = lines.findIndex((l, i) => i > start && /^#{1,3} /.test(l));
  if (end === -1) end = lines.length;
  return lines.slice(start + 1, end).join('\n').trim();
}

function build(target, manifestFile) {
  const stage = path.join(distDir, `stage-${target}`);
  fs.rmSync(stage, { recursive: true, force: true });
  fs.cpSync(extDir, stage, {
    recursive: true,
    filter: (src) => !EXCLUDE.has(path.basename(src)),
  });
  fs.copyFileSync(path.join(extDir, manifestFile), path.join(stage, 'manifest.json'));

  const zipPath = path.join(distDir, `shorts-reels-as-video-${target}-${version}.zip`);
  fs.rmSync(zipPath, { force: true });
  execFileSync('zip', ['-r', '-X', '-q', zipPath, '.'], { cwd: stage, stdio: 'inherit' });
  fs.rmSync(stage, { recursive: true, force: true });

  const kb = (fs.statSync(zipPath).size / 1024).toFixed(1);
  console.log(`Wrote ${path.relative(root, zipPath)} (${kb} KB)`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  fs.mkdirSync(distDir, { recursive: true });
  build('chrome', 'manifest.json');
  build('firefox', 'manifest.json.firefox');

  const notesIdx = process.argv.indexOf('--notes');
  if (notesIdx !== -1) {
    const notesFile = process.argv[notesIdx + 1];
    const notes = changelogFor(version);
    if (!notes) {
      console.error(`No "### ${version}" entry in the README changelog`);
      process.exit(1);
    }
    fs.writeFileSync(notesFile, notes + '\n');
    console.log(`Wrote ${notesFile}`);
  }
}

export { version };
