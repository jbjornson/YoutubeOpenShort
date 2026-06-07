(function () {
  'use strict';

  if (window.__youtubeOpenShortLoaded) return;
  window.__youtubeOpenShortLoaded = true;

  const VERSION = '0.5.0';
  const LOG_PREFIX = '[YoutubeOpenShort]';
  const BUTTON_ID = 'youtube-open-short-button';
  const SPEED_CONTROL_ID = 'youtube-open-short-speed';
  const SPEED_MIN = 1.0;
  const SPEED_MAX = 2.0;
  const SPEED_STEP = 0.05;
  const SPEED_TICK = 0.25;
  const SPEED_PRESETS = [1.0, 1.25, 1.5, 1.75, 2.0];

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

  function collectDomSnapshot() {
    const buttons = document.querySelector('#buttons');
    const actions = document.querySelector('#actions');
    const btn = document.getElementById(BUTTON_ID);
    return {
      version: VERSION,
      url: location.href,
      pathname: location.pathname,
      isShortsPage: isShortsPage(),
      videoId: getVideoId(),
      watchUrl: getWatchUrl(),
      legacyButtons: describeEl(buttons),
      legacyActions: describeEl(actions),
      likeButtonViewModel: Boolean(querySelectorDeep('like-button-view-model')),
      reelActionBarItems: querySelectorAllDeep(
        'reel-action-bar-item-view-model, reel-action-bar-item-renderer'
      ).length,
      shortsPlayer: Boolean(
        document.querySelector('#shorts-player') || querySelectorDeep('#shorts-player')
      ),
      reelOverlay: Boolean(
        document.querySelector('ytd-reel-player-overlay-renderer') ||
          querySelectorDeep('ytd-reel-player-overlay-renderer')
      ),
      activeRenderer: Boolean(getActiveRenderer()),
      ourButton: describeEl(btn),
      ourButtonParent: describeEl(btn?.parentElement),
      isWatchPage: isWatchPage(),
      speedControl: describeEl(document.getElementById(SPEED_CONTROL_ID)),
      playbackRate: getActiveVideo()?.playbackRate ?? null,
    };
  }

  let lastMountLogKey = '';
  function logMountResult(phase, detail) {
    const key = JSON.stringify({ phase, ...detail });
    if (key === lastMountLogKey) return;
    lastMountLogKey = key;
    log('log', `${phase}`, { ...detail, snapshot: collectDomSnapshot() });
  }
  const ACTION_ROW_SEL =
    'reel-action-bar-item-view-model, reel-action-bar-item-renderer, ytd-reel-player-overlay-reel-item-renderer';

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

  function querySelectorAllDeep(selector, base = document.documentElement) {
    if (!base) return [];
    const out = [];
    const seen = new Set();
    const stack = [base];
    while (stack.length) {
      const node = stack.pop();
      if (!node) continue;
      if (node instanceof Element || node instanceof ShadowRoot) {
        try {
          node.querySelectorAll(selector).forEach((el) => {
            if (!seen.has(el)) {
              seen.add(el);
              out.push(el);
            }
          });
        } catch (_) {}
      }
      if (node instanceof Element) {
        if (node.shadowRoot) stack.push(node.shadowRoot);
        for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
      } else if (node instanceof ShadowRoot) {
        for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
      }
    }
    return out;
  }

  function isShortsPage() {
    if (/\/shorts(\/|$)/.test(window.location.pathname)) return true;
    return Boolean(
      document.querySelector('#shorts-player') ||
        querySelectorDeep('#shorts-player') ||
        document.querySelector('ytd-shorts') ||
        document.querySelector('#shorts-container')
    );
  }

  function getActiveRenderer() {
    return (
      document.querySelector('ytd-reel-video-renderer[is-active]') ||
      document.querySelector('ytd-reel-video-renderer[reel-active]') ||
      document.querySelector("ytd-reel-video-renderer[aria-hidden='false']") ||
      querySelectorDeep("ytd-reel-video-renderer[is-active]") ||
      querySelectorDeep("ytd-reel-video-renderer[reel-active]")
    );
  }

  function parseShortsIdFromHref(href) {
    if (!href) return null;
    const match = String(href).match(/\/shorts\/([^/?#&]+)/);
    return match ? match[1] : null;
  }

  function getVideoId() {
    const fromUrl = parseShortsIdFromHref(window.location.pathname);
    if (fromUrl) return fromUrl;

    const activeRenderer = getActiveRenderer();
    if (activeRenderer) {
      const link = activeRenderer.querySelector('a[href*="/shorts/"]');
      const fromLink = parseShortsIdFromHref(link?.href || link?.getAttribute('href'));
      if (fromLink) return fromLink;
    }

    return null;
  }

  function getWatchUrl() {
    const videoId = getVideoId();
    return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
  }

  function isWatchPage() {
    return (
      /^\/watch(\/|$)/.test(location.pathname) &&
      new URLSearchParams(location.search).has('v') &&
      !isShortsPage()
    );
  }

  function getActiveVideo() {
    return (
      document.querySelector('#movie_player video.html5-main-video') ||
      document.querySelector('video.html5-main-video') ||
      querySelectorDeep('video')
    );
  }

  function findSpeedMount() {
    const right =
      document.querySelector('#movie_player .ytp-right-controls') ||
      querySelectorDeep('.ytp-right-controls');
    if (!right) return null;
    return { parent: right, before: right.querySelector('.ytp-settings-button') };
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

  function onVideoRateChange() {
    if (!(rateSyncVideo instanceof HTMLVideoElement)) return;
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
    if (rateSyncVideo instanceof HTMLVideoElement) {
      rateSyncVideo.removeEventListener('ratechange', onVideoRateChange);
      rateSyncVideo.removeEventListener('loadedmetadata', onVideoReady);
      rateSyncVideo.removeEventListener('canplay', onVideoReady);
    }
    rateSyncVideo = null;
  }

  function mountSpeedControl() {
    if (!isWatchPage()) {
      logMountResult('speed:skip:not-watch-page', { pathname: location.pathname });
      removeSpeedControl();
      return;
    }

    const mount = findSpeedMount();
    if (!mount) {
      logMountResult('speed:fail:no-mount-point', {});
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

  function isVisible(el) {
    if (!(el instanceof Element)) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 8 && rect.height > 8;
  }

  function isInShortsActionUi(el) {
    if (!(el instanceof Element)) return false;
    return Boolean(
      el.closest('ytd-reel-player-overlay-renderer') ||
        el.closest('#shorts-player') ||
        el.closest('reel-action-bar-view-model') ||
        el.closest('reel-action-bar-item-view-model')
    );
  }

  function pickButtonsOrActions(root) {
    if (!root) return null;
    return (
      root.querySelector('#buttons') ||
      root.querySelector('#actions') ||
      querySelectorDeep('#buttons', root) ||
      querySelectorDeep('#actions', root)
    );
  }

  function findDirectFlexChild(column, inner) {
    let node = inner;
    while (node && node.parentElement && node.parentElement !== column) {
      node = node.parentElement;
    }
    return node;
  }

  function findActionRowElement(inner) {
    if (!(inner instanceof Element)) return null;
    const byItem = inner.closest(ACTION_ROW_SEL);
    if (byItem?.parentElement) return byItem;

    let node = inner;
    for (let depth = 0; depth < 24 && node; depth++) {
      const parent = node.parentElement;
      if (!parent) break;
      const style = getComputedStyle(parent);
      if (
        style.display.includes('flex') &&
        (style.flexDirection === 'column' || style.flexDirection === 'column-reverse')
      ) {
        const direct = findDirectFlexChild(parent, inner);
        if (direct) return direct;
      }
      node = parent;
    }
    return null;
  }

  function findLikeAnchor(scope) {
    if (!scope) return null;
    return (
      (scope instanceof Element && scope.querySelector('#like-button')) ||
      querySelectorDeep('#like-button', scope) ||
      querySelectorDeep('like-button-view-model', scope) ||
      querySelectorDeep('segmented-like-dislike-button-view-model', scope)
    );
  }

  function findLikeAnchorByAria(scope) {
    const actions = pickButtonsOrActions(scope) || querySelectorDeep('#actions', scope);
    if (!(actions instanceof Element)) return null;
    const buttons = querySelectorAllDeep('button', actions);
    for (const btn of buttons) {
      if (!(btn instanceof HTMLButtonElement) || !isInShortsActionUi(btn)) continue;
      const label = (
        btn.getAttribute('aria-label') ||
        btn.getAttribute('title') ||
        btn.textContent ||
        ''
      ).toLowerCase();
      if (!/(like|likes)/i.test(label)) continue;
      return (
        btn.closest('#like-button') ||
        btn.closest('like-button-view-model') ||
        btn.closest('segmented-like-dislike-button-view-model') ||
        btn
      );
    }
    return null;
  }

  function findFallbackAnchorRow(scope) {
    const likeInner =
      findLikeAnchor(scope) || findLikeAnchorByAria(scope) || findLikeAnchor(document.documentElement);
    if (likeInner) {
      const row = findActionRowElement(likeInner);
      if (row) return row;
    }

    const actions = pickButtonsOrActions(scope);
    if (actions instanceof Element) {
      for (const child of actions.children) {
        if (!(child instanceof HTMLElement) || !isInShortsActionUi(child)) continue;
        const btn = child.querySelector('button');
        if (btn instanceof HTMLButtonElement) {
          return findActionRowElement(btn) || child;
        }
      }
    }

    const rows = querySelectorAllDeep(ACTION_ROW_SEL, scope || document.documentElement).filter(
      isInShortsActionUi
    );
    return rows[0] || null;
  }

  function getShortsScope() {
    const activeRenderer = getActiveRenderer();
    if (activeRenderer) {
      const overlay =
        activeRenderer.querySelector('ytd-reel-player-overlay-renderer') ||
        querySelectorDeep('ytd-reel-player-overlay-renderer', activeRenderer);
      if (overlay) return overlay;
    }

    const visibleOverlays = [...document.querySelectorAll('ytd-reel-player-overlay-renderer')]
      .filter(isVisible)
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return br.width * br.height - ar.width * ar.height;
      });
    if (visibleOverlays[0]) return visibleOverlays[0];

    const deepOverlay = querySelectorDeep('ytd-reel-player-overlay-renderer');
    if (deepOverlay) return deepOverlay;

    return (
      document.querySelector('#shorts-player') ||
      querySelectorDeep('#shorts-player') ||
      document.documentElement
    );
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

  function findVisibleLikeAnchor() {
    const scopes = [getActiveRenderer(), getShortsScope(), document.documentElement].filter(Boolean);

    for (const scope of scopes) {
      const inner = findLikeAnchor(scope) || findLikeAnchorByAria(scope);
      if (inner && elementIsOnScreen(inner)) return inner;
    }

    for (const btn of querySelectorAllDeep('button', getShortsScope())) {
      if (!(btn instanceof HTMLButtonElement) || !isInShortsActionUi(btn)) continue;
      const label = (
        btn.getAttribute('aria-label') ||
        btn.getAttribute('title') ||
        btn.textContent ||
        ''
      ).toLowerCase();
      if (!/(like|likes)/i.test(label)) continue;
      if (!elementIsOnScreen(btn)) continue;
      return (
        btn.closest('#like-button') ||
        btn.closest('like-button-view-model') ||
        btn.closest('segmented-like-dislike-button-view-model') ||
        btn
      );
    }

    return null;
  }

  function mountFromVisibleLike(scopeIndex) {
    const likeInner = findVisibleLikeAnchor();
    if (!likeInner) return null;

    const anchorRow = findActionRowElement(likeInner);
    const column = anchorRow?.parentElement;
    if (!(column instanceof Element)) return null;

    return {
      parent: column,
      before: anchorRow,
      strategy: 'visible-like-column',
      scopeIndex,
    };
  }

  function findMountPoint() {
    const scopes = [getActiveRenderer(), getShortsScope(), document.documentElement].filter(Boolean);

    for (let i = 0; i < scopes.length; i++) {
      const fromLike = mountFromVisibleLike(i);
      if (fromLike) return fromLike;
    }

    for (let i = 0; i < scopes.length; i++) {
      const anchorRow = findFallbackAnchorRow(scopes[i]);
      if (anchorRow && elementIsOnScreen(anchorRow)) {
        const column = anchorRow.parentElement;
        if (column instanceof Element) {
          return {
            parent: column,
            before: anchorRow,
            strategy: 'visible-action-column',
            scopeIndex: i,
          };
        }
      }
    }

    for (let i = 0; i < scopes.length; i++) {
      const legacy = pickButtonsOrActions(scopes[i]);
      if (legacy instanceof Element && elementIsOnScreen(legacy)) {
        return {
          parent: legacy,
          before: legacy.firstChild,
          strategy: 'visible-legacy-container',
          scopeIndex: i,
        };
      }
    }

    for (let i = 0; i < scopes.length; i++) {
      const legacy = pickButtonsOrActions(scopes[i]);
      if (legacy instanceof Element) {
        return {
          parent: legacy,
          before: legacy.firstChild,
          strategy: 'legacy-container-hidden',
          scopeIndex: i,
        };
      }
    }

    for (let i = 0; i < scopes.length; i++) {
      const anchorRow = findFallbackAnchorRow(scopes[i]);
      const column = anchorRow?.parentElement;
      if (column instanceof Element) {
        return {
          parent: column,
          before: anchorRow,
          strategy: 'action-column',
          scopeIndex: i,
        };
      }
    }

    const legacy =
      document.querySelector('ytd-reel-player-overlay-renderer #buttons') ||
      document.querySelector('ytd-reel-player-overlay-renderer #actions') ||
      querySelectorDeep('ytd-reel-player-overlay-renderer #buttons') ||
      querySelectorDeep('ytd-reel-player-overlay-renderer #actions');
    if (legacy instanceof Element) {
      return {
        parent: legacy,
        before: legacy.firstChild,
        strategy: 'legacy-overlay-fallback',
        scopeIndex: -1,
      };
    }

    return null;
  }

  function openWatchInNewTab() {
    const url = getWatchUrl();
    if (!url) return;

    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.display = 'none';
    document.documentElement.appendChild(link);
    link.click();
    link.remove();
  }

  function createButton() {
    const button = document.createElement('div');
    button.id = BUTTON_ID;
    button.setAttribute('role', 'button');
    button.tabIndex = 0;
    button.title = 'Open as regular video in new tab';
    button.setAttribute('aria-label', 'Open as regular video in new tab');
    button.className =
      'yt-spec-button-shape-next yt-spec-button-shape-next--tonal yt-spec-button-shape-next--mono yt-spec-button-shape-next--size-l yt-spec-button-shape-next--icon-button';
    appendIcon(button);
    button.addEventListener(
      'click',
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        openWatchInNewTab();
      },
      true
    );
    return button;
  }

  function findNativeActionLabel(scope) {
    const root = scope instanceof Element ? scope : scope?.parentElement;
    if (!root) return null;

    const selectors = [
      'ytd-reel-player-overlay-reel-item-renderer #text',
      '.yt-spec-button-shape-with-label__label',
      '.yt-spec-touch-feedback-shape__label',
      'yt-formatted-string#text',
      'yt-formatted-string',
    ];

    for (const sel of selectors) {
      const nodes = root.parentElement
        ? root.parentElement.querySelectorAll(sel)
        : document.querySelectorAll(sel);
      for (const node of nodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.closest('[data-youtube-open-short]')) continue;
        if (!isInShortsActionUi(node)) continue;
        const text = (node.textContent || '').trim();
        if (!text || text.length > 24) continue;
        if (elementIsOnScreen(node) || elementIsOnScreen(node.parentElement)) return node;
      }
    }

    return null;
  }

  function syncLabelStyle(label, wrapper) {
    if (!(label instanceof HTMLElement)) return;

    const native =
      findNativeActionLabel(wrapper) ||
      findNativeActionLabel(wrapper.parentElement) ||
      findNativeActionLabel(getShortsScope());

    label.className = 'youtube-open-short-label';

    if (native instanceof HTMLElement) {
      label.className = `${native.className} youtube-open-short-label`.trim();
      const nativeStyle = getComputedStyle(native);
      label.style.fontFamily = nativeStyle.fontFamily;
      label.style.fontSize = nativeStyle.fontSize;
      label.style.fontWeight = nativeStyle.fontWeight;
      label.style.lineHeight = nativeStyle.lineHeight;
      label.style.letterSpacing = nativeStyle.letterSpacing;
      label.style.color = nativeStyle.color;
      label.style.textShadow = nativeStyle.textShadow;
      label.style.marginTop = nativeStyle.marginTop;
      label.style.textAlign = nativeStyle.textAlign;
      return;
    }

    label.style.removeProperty('font-family');
    label.style.removeProperty('font-size');
    label.style.removeProperty('font-weight');
    label.style.removeProperty('line-height');
    label.style.removeProperty('letter-spacing');
    label.style.removeProperty('color');
    label.style.removeProperty('text-shadow');
    label.style.removeProperty('margin-top');
    label.style.removeProperty('text-align');
  }

  function ensureButtonWrapper(button) {
    const row = button.closest(ACTION_ROW_SEL);
    if (row) return row;

    let wrapper = button.closest('[data-youtube-open-short]');
    if (!(wrapper instanceof HTMLElement)) {
      wrapper = document.createElement('div');
      wrapper.className = 'youtube-open-short-action-item';
      wrapper.setAttribute('data-youtube-open-short', '1');
      wrapper.appendChild(button);
    }

    let label = wrapper.querySelector('.youtube-open-short-label');
    if (!(label instanceof HTMLElement)) {
      label = document.createElement('div');
      label.className = 'youtube-open-short-label';
      label.textContent = 'Open';
      wrapper.appendChild(label);
    }

    syncLabelStyle(label, wrapper);
    return wrapper;
  }

  function logMountOutcome(phase, detail) {
    const button = document.getElementById(BUTTON_ID);
    logMountResult(phase, {
      ...detail,
      button: describeEl(button),
      buttonOnScreen: elementIsOnScreen(button),
    });
  }

  function removeButton() {
    document.getElementById(BUTTON_ID)?.closest('[data-youtube-open-short]')?.remove();
    document.getElementById(BUTTON_ID)?.remove();
  }

  function mountButton() {
    if (!isShortsPage()) {
      logMountResult('skip:not-shorts-page', { pathname: location.pathname });
      removeButton();
      return;
    }

    const mount = findMountPoint();
    if (!mount) {
      logMountResult('fail:no-mount-point', {});
      return;
    }

    let button = document.getElementById(BUTTON_ID);
    const created = !button;
    if (!button) {
      button = createButton();
    }

    const mountNode = ensureButtonWrapper(button);
    const { parent, before, strategy, scopeIndex } = mount;

    const insertMount = () => {
      if (before) parent.insertBefore(mountNode, before);
      else parent.prepend(mountNode);
    };

    if (mountNode.parentElement !== parent) {
      try {
        insertMount();
        logMountOutcome('mounted', {
          created,
          strategy,
          scopeIndex,
          parent: describeEl(parent),
          before: describeEl(before),
          mountNode: describeEl(mountNode),
        });
      } catch (err) {
        try {
          parent.prepend(mountNode);
          logMountOutcome('mounted:prepend-fallback', {
            created,
            strategy,
            error: String(err),
            parent: describeEl(parent),
          });
        } catch (err2) {
          log('error', 'mount failed', {
            strategy,
            error: String(err2),
            parent: describeEl(parent),
          });
        }
      }
    } else if (before && mountNode.nextElementSibling !== before) {
      try {
        insertMount();
        logMountOutcome('repositioned', {
          strategy,
          parent: describeEl(parent),
          before: describeEl(before),
        });
      } catch (err) {
        log('warn', 'reposition failed', { error: String(err) });
      }
    } else {
      logMountOutcome('ok:already-mounted', {
        strategy,
        parent: describeEl(parent),
      });
    }

    const label = button.closest('[data-youtube-open-short]')?.querySelector('.youtube-open-short-label');
    if (label instanceof HTMLElement) syncLabelStyle(label, mountNode);

    if (!elementIsOnScreen(button) && strategy.includes('legacy')) {
      log('warn', 'button not on screen after legacy mount; retrying visible-like-column', {
        strategy,
      });
      removeButton();
      const retry = mountFromVisibleLike(scopeIndex);
      if (retry) {
        const retryButton = createButton();
        const retryNode = ensureButtonWrapper(retryButton);
        try {
          if (retry.before) retry.parent.insertBefore(retryNode, retry.before);
          else retry.parent.prepend(retryNode);
          logMountOutcome('mounted:visible-like-retry', {
            strategy: retry.strategy,
            parent: describeEl(retry.parent),
            before: describeEl(retry.before),
          });
        } catch (err) {
          log('error', 'visible-like retry failed', { error: String(err) });
        }
      }
    }
  }

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
    const mount = findMountPoint();
    const speedMount = findSpeedMount();
    const state = {
      ...collectDomSnapshot(),
      mountPoint: mount
        ? {
            strategy: mount.strategy,
            scopeIndex: mount.scopeIndex,
            parent: describeEl(mount.parent),
            before: describeEl(mount.before),
          }
        : null,
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

  function init() {
    log('log', `content script loaded v${VERSION}`, {
      readyState: document.readyState,
      url: location.href,
    });
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
