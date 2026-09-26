(function () {
  'use strict';

  if (window.__youtubeOpenShortLoaded) return;
  window.__youtubeOpenShortLoaded = true;

  const VERSION = '0.8.1';
  const LOG_PREFIX = '[YoutubeOpenShort]';
  const BUTTON_ID = 'youtube-open-short-button';
  const FLOATING_CLASS = 'youtube-open-short-floating';
  const SPEED_CONTROL_ID = 'youtube-open-short-speed';
  const SPEED_MIN = 0.5;
  const SPEED_MAX = 2.0;
  const SPEED_STEP = 0.05;
  const SPEED_TICK = 0.25;
  const SPEED_PRESETS = [0.5, 1.0, 1.25, 1.5, 1.75, 2.0];

  // Widget order inside the shared floating bar.
  const ORDER_OPEN = 1;
  const ORDER_SPEED = 2;

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

  let rateSyncVideo = null;
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
    if (!(rateSyncVideo instanceof HTMLVideoElement)) return;
    const entry = getSpeedEntry();
    if (entry?.mount === 'floating') {
      if (Math.abs(rateSyncVideo.playbackRate - preferredSpeed) > 0.001) {
        rateSyncVideo.playbackRate = preferredSpeed;
      }
      return;
    }
    preferredSpeed = clampSpeed(rateSyncVideo.playbackRate);
    const control = document.getElementById(SPEED_CONTROL_ID);
    if (control) updateSpeedControlUI(control, rateSyncVideo.playbackRate);
  }

  function onVideoReady() {
    if (!(rateSyncVideo instanceof HTMLVideoElement)) return;
    if (Math.abs(rateSyncVideo.playbackRate - preferredSpeed) > 0.001) {
      rateSyncVideo.playbackRate = preferredSpeed;
    }
    const control = document.getElementById(SPEED_CONTROL_ID);
    if (control) updateSpeedControlUI(control, rateSyncVideo.playbackRate);
  }

  function ensureRateSync() {
    const video = getActiveVideo();
    if (video === rateSyncVideo) return;

    if (rateSyncVideo instanceof HTMLVideoElement) {
      rateSyncVideo.removeEventListener('ratechange', onVideoRateChange);
      rateSyncVideo.removeEventListener('loadedmetadata', onVideoReady);
      rateSyncVideo.removeEventListener('canplay', onVideoReady);
    }

    rateSyncVideo = video instanceof HTMLVideoElement ? video : null;

    if (rateSyncVideo) {
      rateSyncVideo.addEventListener('ratechange', onVideoRateChange);
      rateSyncVideo.addEventListener('loadedmetadata', onVideoReady);
      rateSyncVideo.addEventListener('canplay', onVideoReady);
      onVideoReady();
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
    readout.textContent = '1×';

    const sliderId = `${SPEED_CONTROL_ID}-slider`;
    const listId = `${SPEED_CONTROL_ID}-presets`;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.id = sliderId;
    slider.min = String(SPEED_MIN);
    slider.max = String(SPEED_MAX);
    slider.step = String(SPEED_STEP);
    slider.value = '1';
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
    removeFloatingBarIfEmpty();
    if (rateSyncVideo instanceof HTMLVideoElement) {
      rateSyncVideo.removeEventListener('ratechange', onVideoRateChange);
      rateSyncVideo.removeEventListener('loadedmetadata', onVideoReady);
      rateSyncVideo.removeEventListener('canplay', onVideoReady);
    }
    rateSyncVideo = null;
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

    ensureRateSync();
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

    ensureRateSync();
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

  function init() {
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
