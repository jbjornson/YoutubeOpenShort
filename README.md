# YouTube Open Short

Adds a floating **Open** button on short-form video pages that opens the current video as a regular watch URL in a new tab:

| Page | Opens |
| --- | --- |
| `youtube.com/shorts/{id}` | `youtube.com/watch?v={id}` |
| `facebook.com/reel/{id}` | `facebook.com/watch?v={id}` |
| `instagram.com/reels/{id}` | `instagram.com/p/{id}` |

The button appears in the top-right corner and behaves like a normal link, so middle-click and ⌘/Ctrl-click work too. Where a page has both the button and the speed slider — a Short or a Reel — they share a single floating bar.

Adds a **playback speed slider** from 0.5× to 2.0× in 0.05 steps, with preset ticks at 0.5, 1.0, 1.25, 1.5, 1.75, and 2.0 (the 1.0× tick is longer and bolder so normal speed is easy to find):

| Page | Slider |
| --- | --- |
| YouTube watch | in the player control bar, left of the settings cog |
| YouTube Shorts | in the floating bar (the Shorts player has no control bar) |
| Facebook video, Reels, and the feed | in the floating bar |
| Instagram video, Reels, and the feed | in the floating bar |

Each tab starts at your **default speed** — 1.0× unless you change it on the extension's Options page (right-click the toolbar icon → Options, or Details → Extension options in `chrome://extensions`; in Firefox, `about:addons` → Preferences). Your chosen speed applies to other videos in the same tab only, and carries over as you scroll from one Short, Reel, or feed video to the next. Where a page has several videos at once, the slider drives whichever one covers the most of the screen.

Works in **Google Chrome**, **Dia**, and other Chromium-based browsers that support Manifest V3 extensions.

**Current version:** 0.9.0

## Installation

### Chrome / Dia / Edge / Brave

1. Clone or download this repository.
2. Open your browser’s extensions page:
   - Chrome: `chrome://extensions`
   - **Dia: `dia://extensions`**
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the **`extension`** folder (not the repo root).
5. Open any YouTube Short (`https://www.youtube.com/shorts/VIDEO_ID`), Facebook Reel (`https://www.facebook.com/reel/VIDEO_ID`), or Instagram Reel (`https://www.instagram.com/reels/VIDEO_ID/`).
6. Click **Open** in the top-right corner.

On a regular YouTube video (`https://www.youtube.com/watch?v=VIDEO_ID`), use the speed slider in the player bar to change playback speed without opening Settings.

### Firefox

1. In the `extension` folder, copy `manifest.json.firefox` over `manifest.json`.
2. Load the **`extension`** folder as a temporary add-on from `about:debugging`.

## Project layout

```
YoutubeOpenShort/
  extension/
    sites.config.js   ← which URLs map to which watch URL (edit this to add a site)
    site-matcher.js   ← pure URL matching for those patterns
    content.js        ← button + speed slider DOM work
    options.html/.js  ← Options page: default playback speed
    manifest.json     ← load the extension/ folder unpacked
  scripts/            ← dev tests and icon build
  package.json        ← dev dependencies only
  README.md
```

## Supported sites

Sites are configured, not hardcoded. To support a new one, add an entry to `openTargets` in
[`extension/sites.config.js`](extension/sites.config.js) — no code changes needed:

```js
{
  id: 'facebook-reel',
  hosts: ['facebook.com'],                          // subdomains match too
  match: '^/reel/([^/?#&]+)',                       // regex vs pathname + search
  target: 'https://www.facebook.com/watch?v=$1',    // $1..$9 = capture groups
  label: 'Open',
  title: 'Open as regular video in new tab',
  position: { top: '68px', right: '24px' },         // clears the site header
}
```

Then add the host to `matches` and `host_permissions` in both `manifest.json` and
`manifest.json.firefox`, and add a case to `scripts/test-url-config.mjs`.

The `speedTargets` list works the same way for the playback-speed slider:

```js
{
  id: 'youtube-watch',
  hosts: ['youtube.com'],
  match: '^/watch\\?(?:.*&)?v=',
  mount: 'player-bar',                    // or 'floating' when the player has no usable bar
  controlsSelector: '.ytp-right-controls',
  insertBeforeSelector: '.ytp-settings-button',
  videoSelector: '#movie_player video.html5-main-video',
}
```

- `mount`: `'player-bar'` (default) inserts into the site's own controls next to
  `insertBeforeSelector`; `'floating'` uses the shared floating bar instead.
- `videoStrategy`: `'selector'` (default) uses `videoSelector`; `'most-visible'` picks the video
  covering the most of the viewport, which is what pages with several videos (a feed) or a hidden
  decoy video (Shorts) need.

## Development

```bash
npm install
npm run test:urls      # Offline test of the URL patterns in sites.config.js (no browser)
npm run test:mount     # Offline mount test: stub pages served at the real URLs (covers Facebook)
npm run test:shorts    # Playwright mount smoke test (partial; loads extension/)
npm run test:watch     # Playwright watch-page speed slider smoke test
npm run build:icons    # Regenerate PNGs from extension/icons/icon.svg
```

To package a release zip:

```bash
cd extension && zip -r ../YoutubeOpenShort.zip .
```

### Debugging

On a Shorts, Reels, or watch page, open DevTools and filter the console for `YoutubeOpenShort`, or run:

```javascript
__youtubeOpenShortDumpState()
```

Disable verbose logging: `localStorage.setItem('youtube-open-short-debug', '0')`

## Changelog

### 0.9.0

- Default playback speed: set the speed every tab starts at on the extension's Options page (saved with `storage.sync`, so it follows your browser profile). The in-player slider still changes only the current tab.
- The 1.0× tick on the speed slider is now longer and thicker than the other ticks.
- Needs the `storage` permission.

### 0.8.1

- Fixed: on a floating-bar site (Shorts, Facebook, Instagram), an external rate change — e.g. Instagram resetting a freshly-active reel's rate on its own — was adopted as the new preferred speed and then carried into every video after it. Instagram reels were opening at 0.5x, and setting the slider back to 1.0x didn't stick past the next scroll. These sites have no native speed control of their own to defer to, so an external change is now corrected back to the chosen speed instead of adopted. (YouTube's watch page still adopts changes from its own native speed control, next to the settings cog, as before.)

### 0.8.0

- Instagram support: `instagram.com/reels/{id}` and `/reel/{id}` now open as `instagram.com/p/{id}`, and the playback-speed slider works on Instagram video, Reels, and the feed the same way it does on Facebook (broad host match, floating bar, most-visible-video targeting — Instagram's own controls have no reliable class hooks either).

### 0.7.0

- Playback speed on **YouTube Shorts** and on **Facebook** video pages, Reels, and the feed.
- Slider range extended down to **0.5×** for slow motion (was 1.0×–2.0×).
- Where a page shows both the Open button and the speed slider, they now share one floating bar.
- The active video is chosen by visible area on Shorts and Facebook. A Shorts page keeps a hidden 0×0 `<video>` beside the real one and does not reliably mark the active renderer, and a feed holds many videos at once, so a selector cannot identify the right one.
- Speed carries across videos as you scroll a feed or move to the next Short or Reel.
- New config fields `mount` and `videoStrategy` on `speedTargets`; YouTube watch pages keep their native in-player slider.

### 0.6.0

- Facebook Reels support: `facebook.com/reel/{id}` now opens as `facebook.com/watch?v={id}`.
- URL patterns moved out of code into `extension/sites.config.js`; adding a site is a config entry.
- The **Open** button is now a floating pill in the top-right on every supported site, replacing the YouTube-specific action-bar mounting (and ~400 lines of shadow-DOM heuristics that broke whenever YouTube changed its markup). It is a real link, so middle-click and ⌘/Ctrl-click work.
- Playback-speed slider page detection and selectors also come from config now; YouTube behaviour is unchanged.
- Fixed: the speed slider was landing at the far right of the control bar instead of left of the settings cog. YouTube now nests its controls under `.ytp-right-controls-left`, so the old `insertBefore` threw and silently fell back to appending.
- New offline tests: `npm run test:urls` (URL patterns) and `npm run test:mount` (button and slider mounting, including Facebook, without a network or a login).

### 0.5.0

- Playback speed slider on regular watch pages, mounted in the player control bar.
- Preset ticks at 1.0, 1.25, 1.5, 1.75, and 2.0; manual selection in 0.05 increments from 1.0 to 2.0.
- Speed is scoped to the current tab (new tabs/windows always start at 1.0×).

### 0.4.0

- Extension sources moved to `extension/` so **Load unpacked** does not include `node_modules` or test artifacts.
- Added toolbar icons (YouTube-style red rounded square with white external-link glyph).

### 0.3.5

- “Open” label styling synced with native Shorts action captions.

### 0.3.4

- Mounts next to the visible Like control instead of a hidden `#buttons` container.
- Added `content.css` for reliable button layout on desktop Shorts.

### 0.3.3

- Console diagnostics (`[YoutubeOpenShort]` logs and `__youtubeOpenShortDumpState()`).

### 0.3.2

- Shorts action bar view-model and shadow DOM support; mounts above Like with fallbacks for older layouts.

### 0.3.1

- Targets `#buttons` inside `ytd-reel-player-overlay-renderer` (replacing `#actions`).

### 0.3.0

- Multiple mount fallbacks for YouTube SPA navigation (`reel-active`, mutation observers, gesture-safe link click).

## Issues and suggestions

Bug reports and pull requests are welcome on [GitHub](https://github.com/OtterBoops/YoutubeOpenShort).

## License

MIT License — see repository for details.
