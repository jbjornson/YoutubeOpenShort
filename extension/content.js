(function () {
  'use strict';

  if (window.__youtubeOpenShortLoaded) return;
  window.__youtubeOpenShortLoaded = true;

  const VERSION = '0.10.0';
  const LOG_PREFIX = '[YoutubeOpenShort]';
  const BUTTON_ID = 'youtube-open-short-button';
  const FLOATING_CLASS = 'youtube-open-short-floating';
  const SPEED_CONTROL_ID = 'youtube-open-short-speed';
  const SPEED_MIN = 0.5;
  const SPEED_MAX = 2.0;
  const SPEED_STEP = 0.05;
  const SPEED_TICK = 0.25;
  const SPEED_PRESETS = [0.5, 1.0, 1.25, 1.5, 1.75, 2.0];
  const SEEK_CONTROL_ID = 'youtube-open-short-seek';
  const SEEK_STEPS = [-10, -5, -1, 1, 5, 10];
  // Chevrons drawn on each seek button, by step size in seconds.
  const SEEK_CHEVRONS = { 1: 1, 5: 2, 10: 3 };
  const MUTE_BUTTON_ID = 'youtube-open-short-mute';
  // How long after a video becomes active a mute change is taken as the site resetting
  // it rather than the user choosing.
  const MUTE_GRACE_MS = 1500;
  // storage.sync key for the starting speed chosen on the Options page.
  const DEFAULT_SPEED_KEY = 'defaultSpeed';

  // Widget order inside the shared floating bar.
  const ORDER_OPEN = 1;
  const ORDER_MUTE = 2;
  const ORDER_SPEED = 3;
  const ORDER_SEEK = 4;

  // A video smaller than this is chrome or a hidden decoy, not the one being watched.
  // Shorts pages keep a 0x0 <video> alongside the real one.
  const MIN_VIDEO_WIDTH = 80;
  const MIN_VIDEO_HEIGHT = 60;
  // Weight given to a video that is actually playing, when several are on screen.
  const PLAYING_WEIGHT = 1.5;

  const config = globalThis.OPEN_SHORT_CONFIG || { openTargets: [], speedTargets: [] };
  const matcher = globalThis.OpenShortMatcher;

  function isDebugEnabled() {
    try {
      if (localStorage.getItem('youtube-open-short-debug') === '0') return false;
    } catch (_) {}
    return true;
  }

  function log(level, message, data) {
    if (!isDebugEnabled()) return;
    const fn = level === 'warn' ? console.warn : level === 'error' ? console.error : console.log;
    if (data !== undefined) fn(`${LOG_PREFIX} ${message}`, data);
    else fn(`${LOG_PREFIX} ${message}`);
  }

  function describeEl(el) {
    if (!(el instanceof Element)) return null;
    const rect = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      className: typeof el.className === 'string' ? el.className.slice(0, 80) : null,
      visible: rect.width > 8 && rect.height > 8,
      rect: { w: Math.round(rect.width), h: Math.round(rect.height) },
    };
  }

  function querySelectorDeep(selector, base = document.documentElement) {
    if (!base) return null;
    const stack = [base];
    while (stack.length) {
      const node = stack.pop();
      if (!node) continue;
      if (node instanceof Element) {
        try {
          if (node.matches(selector)) return node;
          const hit = node.querySelector(selector);
          if (hit) return hit;
        } catch (_) {}
        if (node.shadowRoot) stack.push(node.shadowRoot);
        for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
      } else if (node instanceof ShadowRoot) {
        try {
          const hit = node.querySelector(selector);
          if (hit) return hit;
        } catch (_) {}
        for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
      }
    }
    return null;
  }

  function isVisible(el) {
    if (!(el instanceof Element)) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 8 && rect.height > 8;
  }

  function elementIsOnScreen(el) {
    if (!(el instanceof Element) || !isVisible(el)) return false;
    const rect = el.getBoundingClientRect();
    return (
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth
    );
  }

  // --- Config lookups -------------------------------------------------------

  function getOpenEntry() {
    if (!matcher) return null;

    const byUrl = matcher.findEntry(location.href, config.openTargets);
    if (byUrl) return byUrl;

    // A configured site can already be showing a short/reel while its SPA URL lags
    // behind. Light-DOM selectors only — this runs on every mutation tick.
    for (const entry of config.openTargets || []) {
      if (!Array.isArray(entry.pageSelectors) || !entry.pageSelectors.length) continue;
      if (!matcher.hostMatches(location.hostname, entry.hosts)) continue;
      if (entry.pageSelectors.some((selector) => document.querySelector(selector))) return entry;
    }

    return null;
  }

  function getSpeedEntry() {
    if (!matcher) return null;
    return matcher.findEntry(location.href, config.speedTargets);
  }

  /**
   * Target URL for the current page. Falls back to the active item's link when the
   * SPA URL lags behind what is on screen (YouTube's Shorts feed does this while
   * scrolling), driven by the entry's own selectors.
   */
  function getTargetUrl(entry = getOpenEntry()) {
    if (!entry || !matcher) return null;

    const fromUrl = matcher.resolveTarget(location.href, entry);
    if (fromUrl) return fromUrl;

    const fallback = entry.fallback;
    if (!fallback) return null;

    const activeItem = fallback.activeItemSelector
      ? document.querySelector(fallback.activeItemSelector) ||
        querySelectorDeep(fallback.activeItemSelector)
      : null;
    if (!activeItem) return null;

    const link = activeItem.querySelector(fallback.linkSelector);
    const href = link?.href || link?.getAttribute('href');
    return matcher.resolveFromHref(href, entry, location.href);
  }

  // --- Debug snapshot -------------------------------------------------------

  function collectDomSnapshot() {
    const entry = getOpenEntry();
    const speedEntry = getSpeedEntry();
    const activeVideo = getActiveVideo();
    const btn = document.getElementById(BUTTON_ID);
    return {
      version: VERSION,
      url: location.href,
      pathname: location.pathname,
      entryId: entry?.id || null,
      targetUrl: getTargetUrl(entry),
      speedEntryId: speedEntry?.id || null,
      ourButton: describeEl(btn),
      buttonHref: btn instanceof HTMLAnchorElement ? btn.href : null,
      speedMount: speedEntry?.mount || null,
      speedControl: describeEl(document.getElementById(SPEED_CONTROL_ID)),
      activeVideo: describeEl(activeVideo),
      videoPickScore: speedEntry?.videoStrategy === 'most-visible' ? lastPickScore : null,
      playbackRate: activeVideo?.playbackRate ?? null,
      seekControl: describeEl(document.getElementById(SEEK_CONTROL_ID)),
      muteButton: describeEl(document.getElementById(MUTE_BUTTON_ID)),
      muted: activeVideo?.muted ?? null,
      currentTime: activeVideo?.currentTime ?? null,
      duration: activeVideo?.duration ?? null,
    };
  }

  let lastMountLogKey = '';
  function logMountResult(phase, detail) {
    const key = JSON.stringify({ phase, ...detail });
    if (key === lastMountLogKey) return;
    lastMountLogKey = key;
    log('log', `${phase}`, { ...detail, snapshot: collectDomSnapshot() });
  }

  function appendIcon(target) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('height', '1em');
    svg.setAttribute('viewBox', '0 0 512 512');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', 'currentColor');
    path.setAttribute(
      'd',
      'M320 0c-17.7 0-32 14.3-32 32s14.3 32 32 32h82.7L201.4 265.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L448 109.3V192c0 17.7 14.3 32 32 32s32-14.3 32-32V32c0-17.7-14.3-32-32-32H320zM80 32C35.8 32 0 67.8 0 112V432c0 44.2 35.8 80 80 80H400c44.2 0 80-35.8 80-80V320c0-17.7-14.3-32-32-32s-32 14.3-32 32V432c0 8.8-7.2 16-16 16H80c-8.8 0-16-7.2-16-16V112c0-8.8 7.2-16 16-16H192c17.7 0 32-14.3 32-32s-14.3-32-32-32H80z'
    );
    svg.appendChild(path);
    target.appendChild(svg);
  }

  // --- Speed slider ---------------------------------------------------------

  let lastPickScore = 0;

  /**
   * The video covering the most of the viewport, preferring one that is playing.
   * Needed where a selector cannot identify the right video: a Shorts page keeps a
   * hidden 0x0 <video> beside the real one and does not reliably mark the active
   * renderer, and a Facebook feed holds many videos at once.
   */
  function pickMostVisibleVideo() {
    const viewportWidth = window.innerWidth || 0;
    const viewportHeight = window.innerHeight || 0;
    let best = null;
    let bestScore = 0;

    for (const video of document.querySelectorAll('video')) {
      const rect = video.getBoundingClientRect();
      if (rect.width < MIN_VIDEO_WIDTH || rect.height < MIN_VIDEO_HEIGHT) continue;

      const visibleWidth = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
      const visibleHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
      let score = visibleWidth * visibleHeight;
      if (score <= 0) continue;
      if (!video.paused) score *= PLAYING_WEIGHT;

      if (score > bestScore) {
        bestScore = score;
        best = video;
      }
    }

    lastPickScore = Math.round(bestScore);
    return best;
  }

  function getActiveVideo() {
    // Only meaningful on a speed-slider page; skipping the lookup elsewhere keeps
    // this cheap on sites that only use the Open button.
    const entry = getSpeedEntry();
    if (!entry) return null;

    if (entry.videoStrategy === 'most-visible') return pickMostVisibleVideo();

    if (entry.videoSelector) {
      const el = document.querySelector(entry.videoSelector) || querySelectorDeep(entry.videoSelector);
      if (el) return el;
    }
    return querySelectorDeep('video');
  }

  function findSpeedMount(entry = getSpeedEntry()) {
    if (!entry?.controlsSelector) return null;
    const bar =
      document.querySelector(entry.controlsSelector) || querySelectorDeep(entry.controlsSelector);
    if (!bar) return null;

    // Mount into whatever container actually holds the reference control, so we land
    // directly beside it even when the site nests its controls in wrapper divs
    // (YouTube groups them under .ytp-right-controls-left / -right).
    const reference = entry.insertBeforeSelector
      ? bar.querySelector(entry.insertBeforeSelector)
      : null;
    if (reference?.parentElement) return { parent: reference.parentElement, before: reference };

    return { parent: bar, before: null };
  }

  function clampSpeed(rate) {
    const clamped = Math.min(SPEED_MAX, Math.max(SPEED_MIN, rate));
    return Math.round(clamped / SPEED_STEP) * SPEED_STEP;
  }

  function formatSpeed(rate) {
    const rounded = Math.round(rate * 100) / 100;
    const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, '');
    return `${text}×`;
  }

  function updateSpeedControlUI(control, rate) {
    if (!(control instanceof HTMLElement)) return;
    const slider = control.querySelector('input[type="range"]');
    const readout = control.querySelector('.youtube-open-short-speed-readout');
    const clamped = clampSpeed(rate);
    if (slider instanceof HTMLInputElement) slider.value = String(clamped);
    if (readout instanceof HTMLElement) readout.textContent = formatSpeed(clamped);
  }

  function applyPlaybackRate(rate) {
    const clamped = clampSpeed(rate);
    preferredSpeed = clamped;
    const video = getActiveVideo();
    if (video instanceof HTMLVideoElement) video.playbackRate = clamped;
    const control = document.getElementById(SPEED_CONTROL_ID);
    if (control) updateSpeedControlUI(control, clamped);
    return clamped;
  }

  let syncVideo = null;
  let preferredSpeed = 1;

  /**
   * A 'floating' mount (Shorts, Facebook, Instagram) has no native speed control of
   * its own to mirror — our slider is the only one, so it is authoritative. Some of
   * these sites' own players reset a video's playbackRate on their own (observed on
   * Instagram: a freshly-active video's rate gets reset to 0.5x moments after we set
   * it), which would otherwise get adopted here as if the user had chosen it, and
   * then get carried into every video after it. For 'player-bar' mounts (YouTube
   * watch, which has its own visible speed control next to the settings cog) a rate
   * change really can be the user reaching for that native control, so it is still
   * adopted as the new preference there.
   */
  function onVideoRateChange() {
    if (!(syncVideo instanceof HTMLVideoElement)) return;
    const entry = getSpeedEntry();
    if (entry?.mount === 'floating') {
      if (Math.abs(syncVideo.playbackRate - preferredSpeed) > 0.001) {
        syncVideo.playbackRate = preferredSpeed;
      }
      return;
    }
    preferredSpeed = clampSpeed(syncVideo.playbackRate);
    const control = document.getElementById(SPEED_CONTROL_ID);
    if (control) updateSpeedControlUI(control, syncVideo.playbackRate);
  }

  function onVideoReady() {
    if (!(syncVideo instanceof HTMLVideoElement)) return;
    if (Math.abs(syncVideo.playbackRate - preferredSpeed) > 0.001) {
      syncVideo.playbackRate = preferredSpeed;
    }
    const control = document.getElementById(SPEED_CONTROL_ID);
    if (control) updateSpeedControlUI(control, syncVideo.playbackRate);
    // Sites often reset sound as a new video loads; hold the user's choice meanwhile.
    if (Date.now() < muteGraceUntil) applyMuted(syncVideo, preferredMuted);
  }

  const TIME_EVENTS = ['timeupdate', 'durationchange', 'loadedmetadata', 'seeked'];

  function unbindSyncVideo() {
    if (syncVideo instanceof HTMLVideoElement) {
      syncVideo.removeEventListener('ratechange', onVideoRateChange);
      syncVideo.removeEventListener('loadedmetadata', onVideoReady);
      syncVideo.removeEventListener('canplay', onVideoReady);
      syncVideo.removeEventListener('volumechange', onVideoVolumeChange);
      for (const type of RESTART_EVENTS) syncVideo.removeEventListener(type, onVideoRestart);
      for (const type of TIME_EVENTS) syncVideo.removeEventListener(type, onVideoTime);
    }
    syncVideo = null;
  }

  /** Follow the active video's rate, sound, and position; rebinds when it changes. */
  function ensureVideoSync() {
    const video = getActiveVideo();
    if (video === syncVideo) return;

    unbindSyncVideo();
    syncVideo = video instanceof HTMLVideoElement ? video : null;

    if (syncVideo) {
      syncVideo.addEventListener('ratechange', onVideoRateChange);
      syncVideo.addEventListener('loadedmetadata', onVideoReady);
      syncVideo.addEventListener('canplay', onVideoReady);
      syncVideo.addEventListener('volumechange', onVideoVolumeChange);
      for (const type of RESTART_EVENTS) syncVideo.addEventListener(type, onVideoRestart);
      lastPlayhead = syncVideo.currentTime;
      for (const type of TIME_EVENTS) syncVideo.addEventListener(type, onVideoTime);
      holdMuteChoice();
      onVideoReady();
      onVideoTime();
      updateMuteButtonUI(document.getElementById(MUTE_BUTTON_ID), syncVideo);
    }
  }

  /** The starting speed saved on the Options page, or 1 when unset or unavailable. */
  async function loadDefaultSpeed() {
    // Firefox's promise-based `browser` namespace first; Chrome MV3's `chrome` also returns promises.
    const storage = globalThis.browser?.storage?.sync ?? globalThis.chrome?.storage?.sync;
    if (!storage) return 1;
    try {
      const stored = await storage.get(DEFAULT_SPEED_KEY);
      const rate = Number(stored?.[DEFAULT_SPEED_KEY]);
      return Number.isFinite(rate) ? clampSpeed(rate) : 1;
    } catch (err) {
      log('warn', 'could not read default speed', { error: String(err) });
      return 1;
    }
  }

  function speedToPercent(rate) {
    return ((clampSpeed(rate) - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)) * 100;
  }

  function appendSpeedTicks(container) {
    container.replaceChildren();
    for (
      let value = SPEED_MIN;
      value <= SPEED_MAX + SPEED_STEP / 2;
      value = Math.round((value + SPEED_TICK) * 100) / 100
    ) {
      const tick = document.createElement('span');
      tick.className = 'youtube-open-short-speed-tick';
      if (SPEED_PRESETS.includes(value)) tick.classList.add('youtube-open-short-speed-tick--preset');
      if (value === 1) tick.classList.add('youtube-open-short-speed-tick--unity');
      tick.style.left = `${speedToPercent(value)}%`;
      tick.setAttribute('aria-hidden', 'true');
      container.appendChild(tick);
    }
  }

  function createSpeedControl() {
    const control = document.createElement('div');
    control.id = SPEED_CONTROL_ID;
    control.className = 'youtube-open-short-speed-control';
    control.title = 'Playback speed';
    control.setAttribute('aria-label', 'Playback speed');

    const readout = document.createElement('span');
    readout.className = 'youtube-open-short-speed-readout';

    const sliderId = `${SPEED_CONTROL_ID}-slider`;
    const listId = `${SPEED_CONTROL_ID}-presets`;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.id = sliderId;
    slider.min = String(SPEED_MIN);
    slider.max = String(SPEED_MAX);
    slider.step = String(SPEED_STEP);
    slider.setAttribute('list', listId);
    slider.setAttribute('aria-label', 'Playback speed');

    const datalist = document.createElement('datalist');
    datalist.id = listId;
    for (const preset of SPEED_PRESETS) {
      const option = document.createElement('option');
      option.value = String(preset);
      datalist.appendChild(option);
    }

    slider.addEventListener('input', () => {
      applyPlaybackRate(parseFloat(slider.value));
    });
    slider.addEventListener('mousedown', (event) => event.stopPropagation());
    slider.addEventListener('click', (event) => event.stopPropagation());
    control.addEventListener('mousedown', (event) => event.stopPropagation());

    const sliderWrap = document.createElement('div');
    sliderWrap.className = 'youtube-open-short-speed-slider-wrap';

    const ticks = document.createElement('div');
    ticks.className = 'youtube-open-short-speed-ticks';
    appendSpeedTicks(ticks);

    sliderWrap.appendChild(ticks);
    sliderWrap.appendChild(slider);

    control.appendChild(readout);
    control.appendChild(sliderWrap);
    control.appendChild(datalist);

    updateSpeedControlUI(control, preferredSpeed);

    return control;
  }

  function removeSpeedControl() {
    document.getElementById(SPEED_CONTROL_ID)?.remove();
    removeMuteButton();
    removeSeekControl();
    unbindSyncVideo();
  }

  /** Speed control in the shared floating bar, for players with no usable control bar. */
  function mountFloatingSpeedControl(entry) {
    // No video on screen means nothing to control — this is what keeps the slider off
    // the many Facebook pages that the deliberately broad `match` also covers.
    const video = getActiveVideo();
    if (!(video instanceof HTMLVideoElement)) {
      logMountResult('speed:skip:no-video', { entryId: entry.id, pathname: location.pathname });
      removeSpeedControl();
      return;
    }

    let control = document.getElementById(SPEED_CONTROL_ID);
    const created = !control;
    if (!control) control = createSpeedControl();

    const moved = mountIntoBar(ensureFloatingBar(), control, ORDER_SPEED);
    if (created || moved) {
      logMountResult('speed:mounted:floating', {
        created,
        entryId: entry.id,
        video: describeEl(video),
        score: lastPickScore,
      });
    }

    if (entry.mute) mountMuteButton(entry);
    else removeMuteButton();

    if (entry.seek) mountSeekControl(entry);
    else removeSeekControl();

    ensureVideoSync();
  }

  function mountSpeedControl() {
    const entry = getSpeedEntry();
    if (!entry) {
      logMountResult('speed:skip:no-config-match', { pathname: location.pathname });
      removeSpeedControl();
      return;
    }

    if (entry.mount === 'floating') {
      mountFloatingSpeedControl(entry);
      return;
    }

    const mount = findSpeedMount(entry);
    if (!mount) {
      logMountResult('speed:fail:no-mount-point', { entryId: entry.id });
      return;
    }

    let control = document.getElementById(SPEED_CONTROL_ID);
    const created = !control;
    if (!control) {
      control = createSpeedControl();
    }

    const { parent, before } = mount;

    const insertMount = () => {
      if (before) parent.insertBefore(control, before);
      else parent.appendChild(control);
    };

    if (control.parentElement !== parent) {
      try {
        insertMount();
        logMountResult('speed:mounted', {
          created,
          entryId: entry.id,
          parent: describeEl(parent),
          before: describeEl(before),
        });
      } catch (err) {
        try {
          parent.appendChild(control);
          logMountResult('speed:mounted:append-fallback', {
            created,
            error: String(err),
            parent: describeEl(parent),
          });
        } catch (err2) {
          log('error', 'speed mount failed', {
            error: String(err2),
            parent: describeEl(parent),
          });
        }
      }
    } else if (before && control.nextElementSibling !== before) {
      try {
        insertMount();
        logMountResult('speed:repositioned', {
          parent: describeEl(parent),
          before: describeEl(before),
        });
      } catch (err) {
        log('warn', 'speed reposition failed', { error: String(err) });
      }
    }

    ensureVideoSync();
  }

  // --- Mute button ----------------------------------------------------------
  // The sites' own mute toggles are small overlaid icons (or, on Instagram, a tap on the
  // reel); this puts one in the floating bar. The choice carries to the next video.

  // null until the user presses our button; until then sound is left to the site.
  let preferredMuted = null;
  let muteGraceUntil = 0;
  let lastPlayhead = 0;

  const RESTART_EVENTS = ['seeking', 'play', 'timeupdate'];

  /** Re-assert the user's choice and give the site's reset the same grace as a new video. */
  function holdMuteChoice() {
    if (preferredMuted === null || !(syncVideo instanceof HTMLVideoElement)) return;
    muteGraceUntil = Date.now() + MUTE_GRACE_MS;
    applyMuted(syncVideo, preferredMuted);
  }

  /**
   * A looping reel starts over, and the sites re-apply their own sound setting as it
   * does (seen on Instagram), long after the new-video grace has run out. Treat a
   * restart like a new video. Loops show up as `seeking` back to the start (the `loop`
   * attribute, or a site rewinding by hand), `play` after a site-driven replay, or just
   * the playhead wrapping round between two timeupdates.
   */
  function onVideoRestart(event) {
    if (!(syncVideo instanceof HTMLVideoElement)) return;
    const t = syncVideo.currentTime;
    const wrapped = event.type === 'timeupdate' && t + 1 < lastPlayhead && t < 1;
    lastPlayhead = t;
    if (event.type === 'timeupdate' && !wrapped) return;
    if (event.type === 'seeking' && t >= 1) return;
    holdMuteChoice();
  }

  const SPEAKER_PATH =
    'M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05A4.5 4.5 0 0 0 16.5 12zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54z';
  const SPEAKER_MUTED_PATH =
    'M3 9v6h4l5 5V4L7 9H3zm13.59 3l2.7-2.7-1.41-1.41-2.7 2.7-2.7-2.7-1.41 1.41 2.7 2.7-2.7 2.7 1.41 1.41 2.7-2.7 2.7 2.7 1.41-1.41-2.7-2.7z';

  function isSilent(video) {
    return video instanceof HTMLVideoElement && (video.muted || video.volume === 0);
  }

  function applyMuted(video, muted) {
    if (!(video instanceof HTMLVideoElement) || muted === null) return;
    if (video.muted !== muted) video.muted = muted;
    // Unmuted at zero volume is still silent.
    if (!muted && video.volume === 0) video.volume = 1;
  }

  /**
   * Right after a video becomes active, a change is the site resetting it (Instagram
   * does this to playbackRate too), so hold the user's choice. After that it is the user
   * reaching for the site's own control, e.g. tapping a reel, and becomes the new choice.
   */
  function onVideoVolumeChange() {
    if (!(syncVideo instanceof HTMLVideoElement)) return;
    if (preferredMuted !== null) {
      if (Date.now() < muteGraceUntil) {
        if (isSilent(syncVideo) !== preferredMuted) applyMuted(syncVideo, preferredMuted);
      } else {
        preferredMuted = isSilent(syncVideo);
      }
    }
    updateMuteButtonUI(document.getElementById(MUTE_BUTTON_ID), syncVideo);
  }

  function toggleMute() {
    const video = getActiveVideo();
    if (!(video instanceof HTMLVideoElement)) return;
    preferredMuted = !isSilent(video);
    muteGraceUntil = 0;
    applyMuted(video, preferredMuted);
    updateMuteButtonUI(document.getElementById(MUTE_BUTTON_ID), video);
  }

  function updateMuteButtonUI(button, video) {
    if (!(button instanceof HTMLElement)) return;
    const silent = isSilent(video);
    const label = silent ? 'Unmute' : 'Mute';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(silent));
    button.querySelector('path')?.setAttribute('d', silent ? SPEAKER_MUTED_PATH : SPEAKER_PATH);
  }

  function createMuteButton() {
    const button = document.createElement('button');
    button.id = MUTE_BUTTON_ID;
    button.type = 'button';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', 'currentColor');
    svg.appendChild(path);
    button.appendChild(svg);

    button.addEventListener('click', toggleMute);
    // Keep the sites' own handlers from treating clicks here as play/pause or a swipe.
    for (const type of ['mousedown', 'pointerdown', 'click', 'touchstart']) {
      button.addEventListener(type, (event) => event.stopPropagation());
    }
    return button;
  }

  function mountMuteButton(entry) {
    let button = document.getElementById(MUTE_BUTTON_ID);
    const created = !button;
    if (!button) button = createMuteButton();

    const moved = mountIntoBar(ensureFloatingBar(), button, ORDER_MUTE);
    if (created || moved) logMountResult('mute:mounted:floating', { created, entryId: entry.id });
    updateMuteButtonUI(button, syncVideo || getActiveVideo());
  }

  function removeMuteButton() {
    document.getElementById(MUTE_BUTTON_ID)?.remove();
    removeFloatingBarIfEmpty();
  }

  // --- Seek controls --------------------------------------------------------
  // Skip buttons and a position scrubber, for players that offer neither (Instagram)
  // or hide them. Floating bar only; YouTube watch pages have native seeking.

  let scrubbing = false;

  function formatTime(seconds) {
    const total = Math.max(0, Math.floor(seconds || 0));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = String(total % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
  }

  function updateSeekControlUI(control, video) {
    if (!(control instanceof HTMLElement)) return;
    const slider = control.querySelector('input[type="range"]');
    const readout = control.querySelector('.youtube-open-short-seek-readout');
    const current = video instanceof HTMLVideoElement ? video.currentTime : 0;
    const duration = video instanceof HTMLVideoElement ? video.duration : NaN;
    // Live streams report Infinity and unloaded media NaN; neither can be scrubbed.
    const seekable = Number.isFinite(duration) && duration > 0;

    if (slider instanceof HTMLInputElement) {
      slider.disabled = !seekable;
      if (seekable) {
        if (slider.max !== String(duration)) slider.max = String(duration);
        if (!scrubbing) slider.value = String(current);
      } else {
        slider.value = '0';
      }
    }
    if (readout instanceof HTMLElement) {
      readout.textContent = seekable
        ? `${formatTime(current)} / ${formatTime(duration)}`
        : formatTime(current);
    }
  }

  function onVideoTime() {
    const control = document.getElementById(SEEK_CONTROL_ID);
    if (control) updateSeekControlUI(control, syncVideo);
  }

  function seekTo(time) {
    const video = getActiveVideo();
    if (!(video instanceof HTMLVideoElement)) return;
    const end = Number.isFinite(video.duration) ? video.duration : Infinity;
    video.currentTime = Math.min(end, Math.max(0, time));
    updateSeekControlUI(document.getElementById(SEEK_CONTROL_ID), video);
  }

  function seekBy(delta) {
    const video = getActiveVideo();
    if (video instanceof HTMLVideoElement) seekTo(video.currentTime + delta);
  }

  /** `count` right-pointing chevrons (mirrored when `back`), in the button's text colour. */
  function appendChevrons(target, count, back) {
    const NS = 'http://www.w3.org/2000/svg';
    const width = 6 + count * 6;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} 12`);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', '12');
    svg.setAttribute('aria-hidden', 'true');
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('fill', 'none');
    g.setAttribute('stroke', 'currentColor');
    g.setAttribute('stroke-width', '2');
    g.setAttribute('stroke-linecap', 'round');
    g.setAttribute('stroke-linejoin', 'round');
    if (back) g.setAttribute('transform', `translate(${width} 0) scale(-1 1)`);
    for (let i = 0; i < count; i++) {
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', `M${2 + i * 6} 2l4 4-4 4`);
      g.appendChild(path);
    }
    svg.appendChild(g);
    target.appendChild(svg);
  }

  function createSeekButton(step) {
    const seconds = Math.abs(step);
    const label = `${step < 0 ? 'Back' : 'Forward'} ${seconds} second${seconds === 1 ? '' : 's'}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'youtube-open-short-seek-button';
    button.dataset.step = String(step);
    appendChevrons(button, SEEK_CHEVRONS[seconds] || 1, step < 0);
    button.title = label;
    button.setAttribute('aria-label', label);
    button.addEventListener('click', () => seekBy(step));
    return button;
  }

  function createSeekControl() {
    const control = document.createElement('div');
    control.id = SEEK_CONTROL_ID;
    control.className = 'youtube-open-short-seek-control';
    control.setAttribute('role', 'group');
    control.setAttribute('aria-label', 'Seek');

    const row = document.createElement('div');
    row.className = 'youtube-open-short-seek-row';
    for (const step of SEEK_STEPS.filter((s) => s < 0)) row.appendChild(createSeekButton(step));

    const readout = document.createElement('span');
    readout.className = 'youtube-open-short-seek-readout';
    readout.textContent = '0:00';
    row.appendChild(readout);

    for (const step of SEEK_STEPS.filter((s) => s > 0)) row.appendChild(createSeekButton(step));

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '1';
    slider.step = '0.1';
    slider.value = '0';
    slider.setAttribute('aria-label', 'Position');
    // While dragging, timeupdate must not pull the thumb back to the playhead.
    const endScrub = () => {
      scrubbing = false;
    };
    slider.addEventListener('pointerdown', () => {
      scrubbing = true;
    });
    slider.addEventListener('pointerup', endScrub);
    slider.addEventListener('pointercancel', endScrub);
    slider.addEventListener('change', endScrub);
    slider.addEventListener('input', () => seekTo(parseFloat(slider.value)));

    // Keep the sites' own handlers from treating clicks here as play/pause or a swipe.
    for (const type of ['mousedown', 'pointerdown', 'click', 'touchstart']) {
      control.addEventListener(type, (event) => event.stopPropagation());
    }

    control.appendChild(row);
    control.appendChild(slider);
    return control;
  }

  function mountSeekControl(entry) {
    let control = document.getElementById(SEEK_CONTROL_ID);
    const created = !control;
    if (!control) control = createSeekControl();

    const moved = mountIntoBar(ensureFloatingBar(), control, ORDER_SEEK);
    if (created || moved) logMountResult('seek:mounted:floating', { created, entryId: entry.id });
    if (created) updateSeekControlUI(control, syncVideo);
  }

  function removeSeekControl() {
    document.getElementById(SEEK_CONTROL_ID)?.remove();
    scrubbing = false;
    removeFloatingBarIfEmpty();
  }

  // --- Shared floating bar --------------------------------------------------
  // The Open button and the floating speed slider share one container, so pages that
  // show both (Shorts, Reels) get a single control rather than two overlapping ones.

  /** The Open button's position wins; otherwise a floating speed entry supplies it. */
  function resolveBarPosition() {
    const openEntry = getOpenEntry();
    if (openEntry?.position) return openEntry.position;

    const speedEntry = getSpeedEntry();
    if (speedEntry?.mount === 'floating' && speedEntry.position) return speedEntry.position;

    return {};
  }

  function ensureFloatingBar() {
    let bar = document.querySelector(`.${FLOATING_CLASS}`);
    if (!bar) {
      bar = document.createElement('div');
      bar.className = FLOATING_CLASS;
      bar.setAttribute('data-youtube-open-short', '1');
    }
    if (bar.parentElement !== document.documentElement) {
      document.documentElement.appendChild(bar);
    }

    const position = resolveBarPosition();
    for (const side of ['top', 'right', 'bottom', 'left']) {
      if (position[side]) bar.style.setProperty(`--yos-${side}`, String(position[side]));
      else bar.style.removeProperty(`--yos-${side}`);
    }
    return bar;
  }

  /** Insert `el` into the bar at its configured slot. Returns true if it moved. */
  function mountIntoBar(bar, el, order) {
    el.dataset.yosOrder = String(order);
    if (el.parentElement === bar) return false;

    const next = [...bar.children].find((child) => Number(child.dataset.yosOrder) > order);
    if (next) bar.insertBefore(el, next);
    else bar.appendChild(el);
    return true;
  }

  function removeFloatingBarIfEmpty() {
    const bar = document.querySelector(`.${FLOATING_CLASS}`);
    if (bar && !bar.children.length) bar.remove();
  }

  // --- Floating Open button -------------------------------------------------

  function createOpenLink(entry) {
    const link = document.createElement('a');
    link.id = BUTTON_ID;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    appendIcon(link);

    const label = document.createElement('span');
    label.className = 'youtube-open-short-label';
    link.appendChild(label);

    applyButtonConfig(link, entry);
    return link;
  }

  function applyButtonConfig(link, entry) {
    const title = entry.title || 'Open as regular video in new tab';
    link.title = title;
    link.setAttribute('aria-label', title);

    const label = link.querySelector('.youtube-open-short-label');
    if (label instanceof HTMLElement) label.textContent = entry.label || 'Open';
  }

  function removeButton() {
    document.getElementById(BUTTON_ID)?.remove();
    removeFloatingBarIfEmpty();
  }

  function mountButton() {
    const entry = getOpenEntry();
    if (!entry) {
      logMountResult('skip:no-config-match', { pathname: location.pathname });
      removeButton();
      return;
    }

    const targetUrl = getTargetUrl(entry);
    if (!targetUrl) {
      logMountResult('skip:no-target-url', { entryId: entry.id, pathname: location.pathname });
      removeButton();
      return;
    }

    let link = document.getElementById(BUTTON_ID);
    const created = !link;

    if (!link) link = createOpenLink(entry);
    else applyButtonConfig(link, entry);

    if (link instanceof HTMLAnchorElement && link.getAttribute('href') !== targetUrl) {
      link.href = targetUrl;
    }

    try {
      const moved = mountIntoBar(ensureFloatingBar(), link, ORDER_OPEN);
      if (created || moved) {
        logMountResult('mounted', { created, entryId: entry.id, targetUrl });
      } else {
        logMountResult('ok:already-mounted', { entryId: entry.id, targetUrl });
      }
    } catch (err) {
      log('error', 'mount failed', { error: String(err), entryId: entry.id });
    }
  }

  // --- Lifecycle ------------------------------------------------------------

  let scheduled = false;
  function scheduleMount() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      mountButton();
      mountSpeedControl();
    });
  }

  function dumpState() {
    const speedMount = findSpeedMount();
    const state = {
      ...collectDomSnapshot(),
      buttonOnScreen: elementIsOnScreen(document.getElementById(BUTTON_ID)),
      speedMountPoint: speedMount
        ? {
            parent: describeEl(speedMount.parent),
            before: describeEl(speedMount.before),
          }
        : null,
      preferredSpeed,
      preferredMuted,
      debugEnabled: isDebugEnabled(),
    };
    console.log(`${LOG_PREFIX} dumpState v${VERSION}`, state);
    return state;
  }

  window.__youtubeOpenShortDumpState = dumpState;

  /** True when this host appears in any config list; keeps observers off unrelated pages. */
  function hostIsConfigured() {
    if (!matcher) return false;
    const entries = [...(config.openTargets || []), ...(config.speedTargets || [])];
    return entries.some((entry) => matcher.hostMatches(location.hostname, entry.hosts));
  }

  async function init() {
    log('log', `content script loaded v${VERSION}`, {
      readyState: document.readyState,
      url: location.href,
    });

    if (!matcher) {
      log('error', 'site-matcher.js did not load; check manifest content_scripts order');
      return;
    }

    if (!hostIsConfigured()) {
      log('log', 'host not configured; idle', { hostname: location.hostname });
      return;
    }

    preferredSpeed = await loadDefaultSpeed();

    dumpState();
    mountButton();
    mountSpeedControl();

    const domObserver = new MutationObserver(scheduleMount);
    domObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['is-active', 'reel-active', 'aria-hidden', 'hidden'],
    });

    let lastUrl = location.href;
    const urlObserver = new MutationObserver(() => {
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      removeButton();
      removeSpeedControl();
      scheduleMount();
    });
    urlObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    window.addEventListener('yt-navigate-finish', scheduleMount);
    window.addEventListener('popstate', scheduleMount);

    // Which video is most visible changes on scroll, which does not always mutate the
    // DOM. Capture phase so scrolling containers (the Shorts and Facebook feeds) count.
    window.addEventListener('scroll', scheduleMount, { passive: true, capture: true });
    window.addEventListener('resize', scheduleMount, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
