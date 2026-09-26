/**
 * Offline test of the URL patterns in extension/sites.config.js.
 * No browser, no network. Run: node scripts/test-url-config.mjs
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

require(path.resolve(__dirname, '../extension/sites.config.js'));
require(path.resolve(__dirname, '../extension/site-matcher.js'));

const config = globalThis.OPEN_SHORT_CONFIG;
const matcher = globalThis.OpenShortMatcher;

/** [url, expected open-target URL or null, expected speed-target id or null] */
const CASES = [
  // YouTube Shorts -> watch, and Shorts now get the floating speed slider too
  ['https://www.youtube.com/shorts/abc123', 'https://www.youtube.com/watch?v=abc123', 'youtube-shorts'],
  ['https://m.youtube.com/shorts/abc123?feature=share', 'https://www.youtube.com/watch?v=abc123', 'youtube-shorts'],
  ['https://youtube.com/shorts/k-YQCdqyQUo', 'https://www.youtube.com/watch?v=k-YQCdqyQUo', 'youtube-shorts'],
  // YouTube watch pages: no Open button, native in-player slider
  ['https://www.youtube.com/watch?v=abc123', null, 'youtube-watch'],
  ['https://www.youtube.com/watch?t=10&v=abc123', null, 'youtube-watch'],
  ['https://www.youtube.com/', null, null],
  ['https://www.youtube.com/feed/subscriptions', null, null],
  // Facebook Reels -> watch. Every facebook.com page matches the speed entry; the
  // slider itself only renders when a video is actually on screen.
  ['https://www.facebook.com/reel/1234567890', 'https://www.facebook.com/watch?v=1234567890', 'facebook-video'],
  ['https://web.facebook.com/reel/1234567890/?s=x', 'https://www.facebook.com/watch?v=1234567890', 'facebook-video'],
  ['https://m.facebook.com/reel/987?mibextid=y', 'https://www.facebook.com/watch?v=987', 'facebook-video'],
  // The video-page URL forms, including the one /watch/?v= redirects to
  ['https://www.facebook.com/watch/?v=123', null, 'facebook-video'],
  ['https://www.facebook.com/NASA/videos/1617067833466601/', null, 'facebook-video'],
  ['https://www.facebook.com/NASA/videos/2026-total-solar-eclipse/1617067833466601/', null, 'facebook-video'],
  ['https://www.facebook.com/', null, 'facebook-video'],
  // Instagram Reels -> post permalink. Every instagram.com page matches the speed
  // entry; the slider itself only renders when a video is actually on screen.
  ['https://www.instagram.com/reels/DcwGOO6kd6g/', 'https://www.instagram.com/p/DcwGOO6kd6g/', 'instagram-video'],
  ['https://www.instagram.com/reel/DcwGOO6kd6g/', 'https://www.instagram.com/p/DcwGOO6kd6g/', 'instagram-video'],
  ['https://instagram.com/reels/DcwGOO6kd6g/?igsh=x', 'https://www.instagram.com/p/DcwGOO6kd6g/', 'instagram-video'],
  ['https://www.instagram.com/p/DcwGOO6kd6g/', null, 'instagram-video'],
  ['https://www.instagram.com/', null, 'instagram-video'],
  // Host guard: the path alone is not enough
  ['https://example.com/reel/123', null, null],
  ['https://notfacebook.com/reel/123', null, null],
  ['https://example.com/shorts/abc123', null, null],
  ['https://example.com/reels/abc123', null, null],
  ['https://notinstagram.com/reels/abc123', null, null],
];

let failures = 0;

function check(label, actual, expected) {
  if (actual === expected) {
    console.log(`  ok   ${label} -> ${actual === null ? 'no match' : actual}`);
    return;
  }
  failures++;
  console.error(`  FAIL ${label}\n       expected: ${expected}\n       actual:   ${actual}`);
}

console.log('URL config cases:');
for (const [url, expectedTarget, expectedSpeedId] of CASES) {
  const openEntry = matcher.findEntry(url, config.openTargets);
  const target = openEntry ? matcher.resolveTarget(url, openEntry) : null;
  check(url, target, expectedTarget);

  const speedEntry = matcher.findEntry(url, config.speedTargets);
  const speedId = speedEntry ? speedEntry.id : null;
  if (speedId !== expectedSpeedId) {
    failures++;
    console.error(
      `  FAIL ${url} (speed target)\n       expected: ${expectedSpeedId}\n       actual:   ${speedId}`
    );
  }
}

// Ids capable of breaking out of the target URL must be escaped, not interpolated raw.
console.log('Escaping:');
const injected = 'https://www.facebook.com/reel/12%263Fevil%3D1';
const injectedEntry = matcher.findEntry(injected, config.openTargets);
const injectedTarget = injectedEntry ? matcher.resolveTarget(injected, injectedEntry) : null;
check(injected, injectedTarget, 'https://www.facebook.com/watch?v=12%25263Fevil%253D1');

const injectedIg = 'https://www.instagram.com/reels/12%263Fevil%3D1/';
const injectedIgEntry = matcher.findEntry(injectedIg, config.openTargets);
const injectedIgTarget = injectedIgEntry ? matcher.resolveTarget(injectedIg, injectedIgEntry) : null;
check(injectedIg, injectedIgTarget, 'https://www.instagram.com/p/12%25263Fevil%253D1/');

// Every configured entry must be structurally complete.
console.log('Config shape:');
for (const entry of [...config.openTargets, ...config.speedTargets]) {
  const problems = [];
  if (!entry.id) problems.push('missing id');
  if (!Array.isArray(entry.hosts) || entry.hosts.length === 0) problems.push('missing hosts');
  if (!entry.match) problems.push('missing match');
  try {
    new RegExp(entry.match, 'i');
  } catch (err) {
    problems.push(`invalid match regex: ${err.message}`);
  }
  if (config.openTargets.includes(entry) && !entry.target) problems.push('missing target');
  if (config.speedTargets.includes(entry)) {
    const mount = entry.mount || 'player-bar';
    if (!['player-bar', 'floating'].includes(mount)) problems.push(`unknown mount: ${mount}`);
    // A player-bar entry needs somewhere to mount; a floating one does not.
    if (mount === 'player-bar' && !entry.controlsSelector) problems.push('missing controlsSelector');
    const strategy = entry.videoStrategy || 'selector';
    if (!['selector', 'most-visible'].includes(strategy)) {
      problems.push(`unknown videoStrategy: ${strategy}`);
    }
    if (strategy === 'selector' && !entry.videoSelector) problems.push('missing videoSelector');
  }
  if (problems.length) {
    failures++;
    console.error(`  FAIL ${entry.id || '(unnamed)'}: ${problems.join(', ')}`);
  } else {
    console.log(`  ok   ${entry.id}`);
  }
}

if (failures) {
  console.error(`\nFAIL: ${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nPASS: all URL config checks passed');
