/**
 * Pure URL matching for the entries in sites.config.js.
 * No DOM access, so scripts/test-url-config.mjs can exercise it directly in Node.
 */
(function () {
  'use strict';

  const regexCache = new Map();

  function toRegExp(pattern) {
    let re = regexCache.get(pattern);
    if (!re) {
      re = new RegExp(pattern, 'i');
      regexCache.set(pattern, re);
    }
    return re;
  }

  function parseUrl(url) {
    try {
      return new URL(url);
    } catch (_) {
      return null;
    }
  }

  /** A host matches its own name and any subdomain of it. */
  function hostMatches(hostname, hosts) {
    if (!hostname || !Array.isArray(hosts)) return false;
    const h = hostname.toLowerCase();
    return hosts.some((host) => {
      const candidate = String(host).toLowerCase();
      return h === candidate || h.endsWith(`.${candidate}`);
    });
  }

  /** The part of the URL that `match` patterns are tested against. */
  function matchPath(parsed) {
    return `${parsed.pathname}${parsed.search}`;
  }

  function execEntry(url, entry) {
    if (!entry || !entry.match) return null;
    const parsed = parseUrl(url);
    if (!parsed || !hostMatches(parsed.hostname, entry.hosts)) return null;
    return toRegExp(entry.match).exec(matchPath(parsed));
  }

  /** First entry whose host and URL pattern both match, else null. */
  function findEntry(url, entries) {
    if (!Array.isArray(entries)) return null;
    for (const entry of entries) {
      if (execEntry(url, entry)) return entry;
    }
    return null;
  }

  function expand(template, groups) {
    return String(template).replace(/\$([1-9])/g, (whole, index) => {
      const value = groups[Number(index)];
      return value === undefined ? whole : encodeURIComponent(value);
    });
  }

  /** Resolve `url` to the entry's target URL, or null when it does not match. */
  function resolveTarget(url, entry) {
    const match = execEntry(url, entry);
    if (!match) return null;
    return expand(entry.target, match);
  }

  /**
   * Same as resolveTarget but for an arbitrary href, which may be relative and
   * therefore carry no host of its own.
   */
  function resolveFromHref(href, entry, base) {
    if (!href) return null;
    let absolute = href;
    try {
      absolute = new URL(href, base || undefined).href;
    } catch (_) {
      return null;
    }
    return resolveTarget(absolute, entry);
  }

  globalThis.OpenShortMatcher = {
    hostMatches,
    findEntry,
    resolveTarget,
    resolveFromHref,
  };
})();
