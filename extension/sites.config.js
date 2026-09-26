/**
 * Site configuration — data only, no logic.
 *
 * To support a new site, add an entry here. No code changes are needed.
 *
 * openTargets[] — pages that get the floating "Open" button.
 *   id      unique slug, used in debug logs
 *   hosts   host names; each also matches its subdomains (youtube.com -> www./m.)
 *   match   regular expression (string, case-insensitive) run against pathname + search
 *   target  destination URL; $1..$9 are replaced with the capture groups of `match`
 *   label   button text
 *   title   button tooltip / aria-label
 *   position  floating button offsets, applied as CSS custom properties
 *   pageSelectors  optional; light-DOM selectors that mean "this page is showing a
 *                  short/reel" even though the SPA URL has not caught up yet.
 *   fallback  optional; how to recover the id in that case. The active item is located
 *             with `activeItemSelector`, then the first `linkSelector` href inside it
 *             is run through `match`/`target`.
 *
 * speedTargets[] — pages that get the playback-speed slider.
 *   id, hosts, match  as above
 *   mount             'player-bar' (default) mounts into the site's own controls using
 *                     controlsSelector/insertBeforeSelector; 'floating' renders in the
 *                     shared floating bar, for players with no usable control bar.
 *   videoStrategy     'selector' (default) uses videoSelector; 'most-visible' picks the
 *                     video covering the most of the viewport, for pages that hold
 *                     several videos (a feed) or a hidden decoy video (Shorts).
 *   controlsSelector      player control bar to mount into ('player-bar' only)
 *   insertBeforeSelector  optional; control to insert before (else appended)
 *   videoSelector         the media element to control ('selector' strategy only)
 *   position              floating bar offsets, as in openTargets ('floating' only)
 *   seek                  optional; also show skip buttons (±1/5/10 s) and a position
 *                         scrubber in the floating bar ('floating' only)
 *   mute                  optional; also show a mute/unmute button in the floating bar
 *                         ('floating' only)
 */
globalThis.OPEN_SHORT_CONFIG = {
  openTargets: [
    {
      id: 'youtube-shorts',
      hosts: ['youtube.com'],
      match: '^/shorts/([^/?#&]+)',
      target: 'https://www.youtube.com/watch?v=$1',
      label: 'Open',
      title: 'Open as regular video in new tab',
      position: { top: '72px', right: '24px' },
      pageSelectors: ['#shorts-player', 'ytd-shorts', '#shorts-container'],
      fallback: {
        activeItemSelector:
          'ytd-reel-video-renderer[is-active], ytd-reel-video-renderer[reel-active]',
        linkSelector: 'a[href*="/shorts/"]',
      },
    },
    {
      id: 'facebook-reel',
      hosts: ['facebook.com'],
      match: '^/reel/([^/?#&]+)',
      target: 'https://www.facebook.com/watch?v=$1',
      label: 'Open',
      title: 'Open as regular video in new tab',
      position: { top: '68px', right: '24px' },
    },
    {
      id: 'instagram-reel',
      hosts: ['instagram.com'],
      match: '^/reels?/([^/?#&]+)',
      target: 'https://www.instagram.com/p/$1/',
      label: 'Open',
      title: 'Open as regular post in new tab',
      position: { top: '76px', right: '24px' },
    },
  ],

  speedTargets: [
    {
      id: 'youtube-watch',
      hosts: ['youtube.com'],
      match: '^/watch\\?(?:.*&)?v=',
      mount: 'player-bar',
      controlsSelector: '.ytp-right-controls',
      insertBeforeSelector: '.ytp-settings-button',
      videoSelector: '#movie_player video.html5-main-video, video.html5-main-video',
    },
    {
      // The Shorts player has no control bar at all — no .ytp-right-controls,
      // .ytp-chrome-bottom or .ytp-settings-button — so this one has to float.
      id: 'youtube-shorts',
      hosts: ['youtube.com'],
      match: '^/shorts/',
      mount: 'floating',
      videoStrategy: 'most-visible',
      seek: true,
      mute: true,
      position: { top: '72px', right: '24px' },
    },
    {
      // Deliberately broad: Facebook serves video at /watch/?v=, /{page}/videos/{id}/,
      // /{page}/videos/{slug}/{id}/, /reel/{id} and inline in the feed, and /watch/?v=
      // redirects to the /videos/ form. Matching widely is safe because the slider only
      // renders when a video is actually on screen.
      // Its control bar is unusable: every class is a Meta atomic class, and the only
      // semantic handles are localized aria-labels.
      id: 'facebook-video',
      hosts: ['facebook.com'],
      match: '.',
      mount: 'floating',
      videoStrategy: 'most-visible',
      seek: true,
      mute: true,
      position: { top: '68px', right: '24px' },
    },
    {
      // Deliberately broad, like facebook-video: Instagram's own player controls have
      // no reliable class hooks either, and the slider only renders when a video is
      // actually visible on screen (see mountFloatingSpeedControl in content.js).
      id: 'instagram-video',
      hosts: ['instagram.com'],
      match: '.',
      mount: 'floating',
      videoStrategy: 'most-visible',
      seek: true,
      mute: true,
      position: { top: '76px', right: '24px' },
    },
  ],
};
