/**
 * Offline mount test. Serves stub pages at the real URLs so the content script sees a
 * genuine location.href, then asserts what it mounts. No network, no login, deterministic —
 * this is what covers Facebook Reels, where a live test would need a logged-in session.
 * Run: node scripts/test-mount.mjs
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.resolve(__dirname, '../extension');

const SCRIPTS = ['sites.config.js', 'site-matcher.js', 'content.js'].map((f) =>
  fs.readFileSync(path.join(EXT, f), 'utf8')
);
const CSS = fs.readFileSync(path.join(EXT, 'content.css'), 'utf8');

const PLAIN = '<body style="background:#111">nothing here</body>';
const SHORTS_DOM = `<body style="background:#111">
  <div id="shorts-player"></div>
  <ytd-reel-video-renderer is-active><a href="/shorts/FROMLINK9">x</a></ytd-reel-video-renderer>
</body>`;
// A Shorts page keeps a hidden 0x0 <video> beside the real one, and does not reliably
// mark the active renderer — the picker has to choose by visible area.
const SHORTS_PLAYER_DOM = `<body style="background:#111;margin:0">
  <div id="shorts-player">
    <video id="real" style="width:315px;height:560px" muted></video>
  </div>
  <video id="decoy" style="width:0;height:0"></video>
</body>`;

// Several videos down a scrolling feed, as Facebook renders inline video.
const FEED_DOM = `<body style="background:#111;margin:0">
  <video id="v1" style="width:500px;height:280px;display:block" muted></video>
  <div style="height:900px"></div>
  <video id="v2" style="width:500px;height:280px;display:block" muted></video>
  <div style="height:900px"></div>
  <video id="v3" style="width:500px;height:280px;display:block" muted></video>
  <div style="height:900px"></div>
</body>`;

const WATCH_DOM = `<body style="background:#111">
  <div id="movie_player"><video class="html5-main-video"></video>
    <div class="ytp-right-controls" style="display:flex;height:40px;width:300px">
      <button class="ytp-settings-button" style="width:40px">cog</button>
    </div>
  </div></body>`;

let failures = 0;
function expect(label, actual, want) {
  const ok = JSON.stringify(actual) === JSON.stringify(want);
  if (ok) console.log(`  ok   ${label} -> ${JSON.stringify(actual)}`);
  else {
    failures++;
    console.error(`  FAIL ${label}\n       want: ${JSON.stringify(want)}\n       got:  ${JSON.stringify(actual)}`);
  }
}

async function open(browser, url, body, prelude) {
  const page = await browser.newPage();
  await page.route('**/*', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: `<!doctype html><html>${body}</html>` })
  );
  await page.goto(url);
  await page.addStyleTag({ content: CSS });
  if (prelude) await page.addScriptTag({ content: prelude });
  for (const src of SCRIPTS) await page.addScriptTag({ content: src });
  await page.waitForTimeout(400);
  return page;
}

const state = (page) =>
  page.evaluate(() => {
    const btn = document.getElementById('youtube-open-short-button');
    const rect = btn?.getBoundingClientRect();
    return {
      href: btn instanceof HTMLAnchorElement ? btn.href : null,
      target: btn?.getAttribute('target') || null,
      label: btn?.querySelector('.youtube-open-short-label')?.textContent || null,
      visible: Boolean(rect && rect.width > 8 && rect.height > 8),
      inWrapper: Boolean(btn?.closest('.youtube-open-short-floating')),
      // `position` config places the bar, so measure the bar, not the widget inside it.
      offset: (() => {
        const bar = document.querySelector('.youtube-open-short-floating');
        if (!bar) return null;
        const b = bar.getBoundingClientRect();
        return { top: Math.round(b.top), right: Math.round(window.innerWidth - b.right) };
      })(),
      speedMounted: Boolean(document.getElementById('youtube-open-short-speed')),
      speedBefore: document.getElementById('youtube-open-short-speed')?.nextElementSibling?.className || null,
      // Order of widgets inside the shared floating bar.
      barContents: [...(document.querySelector('.youtube-open-short-floating')?.children || [])].map(
        (c) => c.id || c.tagName.toLowerCase()
      ),
      barCount: document.querySelectorAll('.youtube-open-short-floating').length,
    };
  });

/**
 * id of the video the slider is actually driving, via its playbackRate. Resets every
 * video to 1x first, so videos driven by an earlier probe do not also register.
 */
const drivenVideoId = (page, rate = 1.5) =>
  page.evaluate((r) => {
    document.querySelectorAll('video').forEach((v) => {
      v.playbackRate = 1;
    });
    const slider = document.querySelector('#youtube-open-short-speed input[type="range"]');
    if (!slider) return null;
    slider.value = String(r);
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    const hit = [...document.querySelectorAll('video')].filter((v) => v.playbackRate === r);
    return hit.length === 1 ? hit[0].id : `${hit.length} videos at ${r}x`;
  }, rate);

const href = (page) =>
  page.evaluate(() => document.getElementById('youtube-open-short-button')?.href ?? null);

/** Trigger the MutationObserver the way a real SPA re-render would. */
const nudge = (page) =>
  page.evaluate(() => document.body.appendChild(document.createElement('i')));

async function main() {
  const browser = await chromium.launch();
  try {
    console.log('Button mounting:');
    for (const [url, body, wantHref, wantSpeed, wantOffset] of [
      ['https://www.youtube.com/shorts/abc123', PLAIN, 'https://www.youtube.com/watch?v=abc123', false, { top: 72, right: 24 }],
      ['https://www.facebook.com/reel/1234567890', PLAIN, 'https://www.facebook.com/watch?v=1234567890', false, { top: 68, right: 24 }],
      ['https://www.facebook.com/', PLAIN, null, false, null],
      ['https://www.instagram.com/reels/DcwGOO6kd6g/', PLAIN, 'https://www.instagram.com/p/DcwGOO6kd6g/', false, { top: 76, right: 24 }],
      ['https://www.instagram.com/', PLAIN, null, false, null],
      ['https://www.youtube.com/watch?v=abc123', WATCH_DOM, null, true, null],
      ['https://www.youtube.com/feed/subscriptions', PLAIN, null, false, null],
    ]) {
      const page = await open(browser, url, body);
      const s = await state(page);
      expect(`${url} href`, s.href, wantHref);
      expect(`${url} speed slider`, s.speedMounted, wantSpeed);
      if (wantHref) {
        expect(`${url} presentation`, { visible: s.visible, inWrapper: s.inWrapper, target: s.target, label: s.label }, { visible: true, inWrapper: true, target: '_blank', label: 'Open' });
        expect(`${url} position`, s.offset, wantOffset);
      }
      if (wantSpeed) expect(`${url} slider sits before the cog`, s.speedBefore, 'ytp-settings-button');
      await page.close();
    }

    console.log('SPA navigation:');
    {
      const page = await open(browser, 'https://www.youtube.com/shorts/abc123', PLAIN);
      await page.evaluate(() => history.pushState({}, '', '/shorts/xyz789'));
      await nudge(page);
      await page.waitForTimeout(400);
      expect('youtube next short', await href(page), 'https://www.youtube.com/watch?v=xyz789');
      await page.goBack();
      await page.waitForTimeout(400);
      expect('youtube back', await href(page), 'https://www.youtube.com/watch?v=abc123');
      await page.close();
    }
    {
      const page = await open(browser, 'https://www.facebook.com/reel/111', PLAIN);
      await page.evaluate(() => history.pushState({}, '', '/reel/222'));
      await nudge(page);
      await page.waitForTimeout(400);
      expect('facebook next reel', await href(page), 'https://www.facebook.com/watch?v=222');
      await page.evaluate(() => history.pushState({}, '', '/'));
      await nudge(page);
      await page.waitForTimeout(400);
      expect('facebook leaves reel (button removed)', await href(page), null);
      await page.evaluate(() => history.pushState({}, '', '/reel/333'));
      await nudge(page);
      await page.waitForTimeout(400);
      expect('facebook enters reel again', await href(page), 'https://www.facebook.com/watch?v=333');
      await page.close();
    }
    {
      const page = await open(browser, 'https://www.instagram.com/reels/111/', PLAIN);
      await page.evaluate(() => history.pushState({}, '', '/reels/222/'));
      await nudge(page);
      await page.waitForTimeout(400);
      expect('instagram next reel', await href(page), 'https://www.instagram.com/p/222/');
      await page.evaluate(() => history.pushState({}, '', '/'));
      await nudge(page);
      await page.waitForTimeout(400);
      expect('instagram leaves reel (button removed)', await href(page), null);
      await page.evaluate(() => history.pushState({}, '', '/reels/333/'));
      await nudge(page);
      await page.waitForTimeout(400);
      expect('instagram enters reel again', await href(page), 'https://www.instagram.com/p/333/');
      await page.close();
    }

    console.log('Shared floating bar:');
    {
      // A Short shows both widgets, in a single bar, Open first.
      const page = await open(browser, 'https://www.youtube.com/shorts/abc123', SHORTS_PLAYER_DOM);
      const st = await state(page);
      expect('shorts: one bar', st.barCount, 1);
      expect('shorts: Open + speed, in order', st.barContents, [
        'youtube-open-short-button',
        'youtube-open-short-speed',
      ]);
      expect('shorts: picker ignores the 0x0 decoy', await drivenVideoId(page), 'real');
      await page.close();
    }
    {
      const page = await open(browser, 'https://www.facebook.com/reel/111', SHORTS_PLAYER_DOM);
      const st = await state(page);
      expect('reel: Open + speed share one bar', st.barContents, [
        'youtube-open-short-button',
        'youtube-open-short-speed',
      ]);
      await page.close();
    }
    {
      const page = await open(browser, 'https://www.instagram.com/reels/111/', SHORTS_PLAYER_DOM);
      const st = await state(page);
      expect('instagram reel: Open + speed share one bar', st.barContents, [
        'youtube-open-short-button',
        'youtube-open-short-speed',
      ]);
      await page.close();
    }
    {
      // The feed has no Open button, so the bar holds the slider alone.
      const page = await open(browser, 'https://www.facebook.com/', FEED_DOM);
      const st = await state(page);
      expect('facebook feed: slider only', st.barContents, ['youtube-open-short-speed']);
      expect('facebook feed: no Open button', st.href, null);
      await page.close();
    }
    {
      // The Instagram feed has no Open button either, so the bar holds the slider alone.
      const page = await open(browser, 'https://www.instagram.com/', FEED_DOM);
      const st = await state(page);
      expect('instagram feed: slider only', st.barContents, ['youtube-open-short-speed']);
      expect('instagram feed: no Open button', st.href, null);
      await page.close();
    }
    {
      // Broad facebook match, but nothing to control -> no bar at all.
      const page = await open(browser, 'https://www.facebook.com/somepage', PLAIN);
      const st = await state(page);
      expect('facebook page with no video: no bar', st.barCount, 0);
      expect('facebook page with no video: no slider', st.speedMounted, false);
      await page.close();
    }
    {
      // Broad instagram match, but nothing to control -> no bar at all.
      const page = await open(browser, 'https://www.instagram.com/somepage', PLAIN);
      const st = await state(page);
      expect('instagram page with no video: no bar', st.barCount, 0);
      expect('instagram page with no video: no slider', st.speedMounted, false);
      await page.close();
    }

    console.log('Most-visible video targeting:');
    {
      const page = await open(browser, 'https://www.facebook.com/', FEED_DOM);
      expect('feed: drives the top video', await drivenVideoId(page), 'v1');

      await page.evaluate(() => window.scrollTo(0, 1180));
      await nudge(page);
      await page.waitForTimeout(400);
      expect('feed: retargets after scrolling', await drivenVideoId(page), 'v2');

      await page.evaluate(() => window.scrollTo(0, 2360));
      await nudge(page);
      await page.waitForTimeout(400);
      expect('feed: retargets again', await drivenVideoId(page), 'v3');
      await page.close();
    }
    {
      // The chosen speed should carry to whichever video becomes active next.
      const page = await open(browser, 'https://www.facebook.com/', FEED_DOM);
      await drivenVideoId(page); // sets 1.5x on v1
      await page.evaluate(() => window.scrollTo(0, 1180));
      await nudge(page);
      await page.waitForTimeout(500);
      const carried = await page.evaluate(() => {
        const v2 = document.getElementById('v2');
        v2.dispatchEvent(new Event('canplay'));
        return v2.playbackRate;
      });
      expect('speed carries to the next video', carried, 1.5);
      await page.close();
    }
    {
      // A floating mount has no native speed control of its own to defer to, so a
      // site resetting a video's rate on its own (observed on Instagram, where a
      // freshly-active reel's rate got reset to 0.5x moments after we set it) must
      // be corrected back rather than adopted as a new preference.
      const page = await open(browser, 'https://www.facebook.com/', FEED_DOM);
      await drivenVideoId(page); // sets 1.5x on v1
      const after = await page.evaluate(() => {
        const v1 = document.getElementById('v1');
        v1.playbackRate = 0.5; // the site resetting it behind our back
        return v1.playbackRate;
      });
      await page.waitForTimeout(200);
      const restored = await page.evaluate(() => document.getElementById('v1').playbackRate);
      expect('external rate reset lands at 0.5 momentarily', after, 0.5);
      expect('floating mount snaps an external reset back to the chosen speed', restored, 1.5);
      await page.close();
    }
    {
      // A player-bar mount (YouTube watch) has a real native speed control next to
      // the settings cog, so a rate change there is adopted as the new preference,
      // not corrected away.
      const page = await open(browser, 'https://www.youtube.com/watch?v=abc123', WATCH_DOM);
      await page.evaluate(() => {
        document.querySelector('video.html5-main-video').playbackRate = 1.75;
      });
      await page.waitForTimeout(200);
      const readout = await page.evaluate(
        () => document.querySelector('.youtube-open-short-speed-readout').textContent
      );
      expect('player-bar mount adopts a native rate change', readout, '1.75×');
      await page.close();
    }

    console.log('Speed slider drives the video:');
    {
      const page = await open(browser, 'https://www.youtube.com/watch?v=abc123', WATCH_DOM);
      const rate = await page.evaluate(() => {
        const slider = document.querySelector('#youtube-open-short-speed input[type="range"]');
        slider.value = '1.5';
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        return {
          playbackRate: document.querySelector('video.html5-main-video').playbackRate,
          readout: document.querySelector('.youtube-open-short-speed-readout').textContent,
        };
      });
      expect('slider at 1.5 sets playbackRate', rate.playbackRate, 1.5);
      expect('readout follows the slider', rate.readout, '1.5\u00d7');

      const slow = await page.evaluate(() => {
        const slider = document.querySelector('#youtube-open-short-speed input[type="range"]');
        slider.value = slider.min;
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        return {
          min: slider.min,
          playbackRate: document.querySelector('video.html5-main-video').playbackRate,
          readout: document.querySelector('.youtube-open-short-speed-readout').textContent,
        };
      });
      expect('slider minimum is 0.5', slow.min, '0.5');
      expect('slow motion reaches 0.5x', slow.playbackRate, 0.5);
      expect('readout shows 0.5\u00d7', slow.readout, '0.5\u00d7');
      await page.close();
    }

    console.log('Default speed from Options:');
    {
      // Stands in for chrome.storage.sync holding a speed saved on the Options page.
      const STORED = `window.chrome = { storage: { sync: { get: async () => ({ defaultSpeed: 1.5 }) } } };`;
      const page = await open(browser, 'https://www.youtube.com/watch?v=abc123', WATCH_DOM, STORED);
      const got = await page.evaluate(() => ({
        playbackRate: document.querySelector('video.html5-main-video').playbackRate,
        readout: document.querySelector('.youtube-open-short-speed-readout').textContent,
        unityTicks: document.querySelectorAll('.youtube-open-short-speed-tick--unity').length,
      }));
      expect('video starts at the saved default', got.playbackRate, 1.5);
      expect('readout starts at the saved default', got.readout, '1.5\u00d7');
      expect('exactly one emphasised 1.0\u00d7 tick', got.unityTicks, 1);
      await page.close();
    }
    {
      const page = await open(browser, 'https://www.youtube.com/watch?v=abc123', WATCH_DOM);
      const readout = await page.evaluate(
        () => document.querySelector('.youtube-open-short-speed-readout').textContent
      );
      expect('no storage available falls back to 1\u00d7', readout, '1\u00d7');
      await page.close();
    }

    console.log('URL lagging behind the DOM (pageSelectors + fallback):');
    for (const [url, body, want, label] of [
      ['https://www.youtube.com/', SHORTS_DOM, 'https://www.youtube.com/watch?v=FROMLINK9', 'id recovered from the active reel link'],
      ['https://www.youtube.com/', '<body><div id="shorts-player"></div></body>', null, 'shorts DOM but no resolvable id'],
      ['https://example.com/', SHORTS_DOM, null, 'unconfigured host is never touched'],
      ['https://www.youtube.com/shorts/URLWINS1', SHORTS_DOM, 'https://www.youtube.com/watch?v=URLWINS1', 'URL wins over stale DOM'],
    ]) {
      const page = await open(browser, url, body);
      expect(label, await href(page), want);
      await page.close();
    }
  } finally {
    await browser.close();
  }

  if (failures) {
    console.error(`\nFAIL: ${failures} check(s) failed`);
    process.exit(1);
  }
  console.log('\nPASS: all mount checks passed');
}

main();
