# YouTube Open Short

Adds an **Open** button on YouTube Shorts that opens the current short as a regular watch URL (`/watch?v=...`) in a new tab.

On regular **watch** pages, adds a **playback speed slider** in the player control bar (left of the settings cog). Drag to any speed from 1.0× to 2.0× in 0.05 steps, with preset ticks at 1.0, 1.25, 1.5, 1.75, and 2.0. Each tab starts at 1.0×; your chosen speed applies to other videos in the same tab only.

Works in **Google Chrome**, **Dia**, and other Chromium-based browsers that support Manifest V3 extensions.

**Current version:** 0.5.0

## Installation

### Chrome / Dia / Edge / Brave

1. Clone or download this repository.
2. Open your browser’s extensions page:
   - Chrome: `chrome://extensions`
   - **Dia: `dia://extensions`**
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the **`extension`** folder (not the repo root).
5. Open any YouTube Short (e.g. `https://www.youtube.com/shorts/VIDEO_ID`).
6. Click **Open** at the top of the Shorts action column (above Like).

On a regular video (`https://www.youtube.com/watch?v=VIDEO_ID`), use the speed slider in the player bar to change playback speed without opening Settings.

### Firefox

1. In the `extension` folder, copy `manifest.json.firefox` over `manifest.json`.
2. Load the **`extension`** folder as a temporary add-on from `about:debugging`.

## Project layout

```
YoutubeOpenShort/
  extension/          ← Load unpacked (manifest, scripts, icons)
  scripts/            ← dev tests and icon build
  package.json        ← dev dependencies only
  README.md
```

## Development

```bash
npm install
npm run test:shorts    # Playwright mount smoke test (partial; loads extension/)
npm run test:watch     # Playwright watch-page speed slider smoke test
npm run build:icons    # Regenerate PNGs from extension/icons/icon.svg
```

To package a release zip:

```bash
cd extension && zip -r ../YoutubeOpenShort.zip .
```

### Debugging

On a Shorts or watch page, open DevTools and filter the console for `YoutubeOpenShort`, or run:

```javascript
__youtubeOpenShortDumpState()
```

Disable verbose logging: `localStorage.setItem('youtube-open-short-debug', '0')`

## Changelog

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
