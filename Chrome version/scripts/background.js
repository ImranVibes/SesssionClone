/**
 * SessionClone - Background Service Worker
 * Keeps the toolbar badge in sync with the cookie count of the active tab.
 * Rapid cookie events are debounced so busy tabs do not spam the API.
 */

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

const badgeState = new Map(); // tabId -> timeout handle
const BADGE_DEBOUNCE_MS = 600;

browserAPI.runtime.onInstalled.addListener(() => {
  if (browserAPI.action && browserAPI.action.setBadgeBackgroundColor) {
    browserAPI.action.setBadgeBackgroundColor({ color: '#6366f1' });
  }
  console.log('[SessionClone] Extension installed or updated.');
});

function isInternalUrl(url) {
  if (!url) return true;
  return ['chrome://', 'edge://', 'about:', 'chrome-extension://', 'moz-extension://', 'devtools://', 'view-source:']
    .some(p => url.startsWith(p));
}

async function updateBadge(tabId, url) {
  if (isInternalUrl(url)) {
    if (browserAPI.action && browserAPI.action.setBadgeText) {
      try { await browserAPI.action.setBadgeText({ tabId, text: '' }); } catch (e) {}
    }
    return;
  }

  try {
    const filter = { url };
    try {
      const tab = await browserAPI.tabs.get(tabId);
      if (tab && tab.cookieStoreId) {
        filter.storeId = tab.cookieStoreId;
      }
    } catch (e) {}

    let cookies;
    try {
      cookies = await browserAPI.cookies.getAll(filter);
    } catch (e) {
      cookies = await browserAPI.cookies.getAll({ url });
    }
    const count = cookies ? cookies.length : 0;
    const text = count > 0 ? (count > 999 ? '999+' : String(count)) : '';

    if (browserAPI.action && browserAPI.action.setBadgeText) {
      await browserAPI.action.setBadgeText({ tabId, text });
      await browserAPI.action.setBadgeBackgroundColor({
        tabId,
        color: count > 0 ? '#4f46e5' : '#64748b'
      });
    }
  } catch (err) {
    // Tab may be closed or the URL inaccessible - nothing to show
  }
}

/** Debounced badge refresh for a tab. */
function scheduleBadge(tabId, url) {
  if (badgeState.has(tabId)) clearTimeout(badgeState.get(tabId));
  badgeState.set(tabId, setTimeout(() => {
    badgeState.delete(tabId);
    updateBadge(tabId, url);
  }, BADGE_DEBOUNCE_MS));
}

function clearBadge(tabId) {
  if (badgeState.has(tabId)) {
    clearTimeout(badgeState.get(tabId));
    badgeState.delete(tabId);
  }
}

browserAPI.tabs.onRemoved.addListener(tabId => clearBadge(tabId));

browserAPI.tabs.onActivated.addListener(async activeInfo => {
  try {
    const tab = await browserAPI.tabs.get(activeInfo.tabId);
    if (tab && tab.url) {
      scheduleBadge(tab.id, tab.url);
    }
  } catch (e) {}
});

browserAPI.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab && tab.url) {
    scheduleBadge(tabId, tab.url);
  }
});

if (browserAPI.cookies && browserAPI.cookies.onChanged) {
  browserAPI.cookies.onChanged.addListener(() => {
    browserAPI.tabs.query({ active: true, currentWindow: true })
      .then(tabs => {
        let active = tabs && tabs[0];
        if (!active || !active.url) {
          return browserAPI.tabs.query({ active: true, lastFocusedWindow: true });
        }
        return [active];
      })
      .then(tabs => {
        const active = tabs && tabs[0];
        if (active && active.id != null && active.url) {
          scheduleBadge(active.id, active.url);
        }
      })
      .catch(() => {});
  });
}
