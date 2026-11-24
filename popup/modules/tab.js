/**
 * SessionClone - Active tab resolution & counters
 * Decides which tab we are operating on (popup view, full-tab view, or a
 * remembered last target), detects internal browser pages and renders counters.
 */

import {
  browserAPI, state, dom, showToast, isInternalUrl,
  sourceTabIdParam, isPopupView, openModal
} from './core.js';

const LAST_TAB_KEY = 'sessionclone_lastTab';

/** Internal browser pages cannot expose cookies or storage. */
function isInjectable(url) {
  return Boolean(url) && /^https?:\/\//i.test(url) && !isInternalUrl(url);
}

async function rememberTab(tab) {
  if (!tab || !tab.id || !browserAPI || !browserAPI.storage) return;
  try {
    await browserAPI.storage.local.set({
      [LAST_TAB_KEY]: { id: tab.id, url: tab.url || '', at: Date.now() }
    });
  } catch (e) {}
}

async function resolveTargetTab() {
  // 1. Full-tab view opened from a specific tab
  if (sourceTabIdParam && browserAPI.tabs && browserAPI.tabs.get) {
    try {
      const tab = await browserAPI.tabs.get(sourceTabIdParam);
      if (tab && isInjectable(tab.url)) return tab;
    } catch (e) {}
  }

  // 2. The currently active tab in this window (or last focused window)
  try {
    let [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
    if (!tab || !isInjectable(tab.url)) {
      const [lastFocused] = await browserAPI.tabs.query({ active: true, lastFocusedWindow: true });
      if (lastFocused && isInjectable(lastFocused.url)) {
        tab = lastFocused;
      }
    }
    if (tab && isInjectable(tab.url)) return tab;
  } catch (e) {}

  // 3. Fall back to the last tab we worked on (avoids targeting ourselves)
  try {
    const stored = await browserAPI.storage.local.get([LAST_TAB_KEY]);
    const last = stored && stored[LAST_TAB_KEY];
    if (last && last.id) {
      const tab = await browserAPI.tabs.get(last.id);
      if (tab && isInjectable(tab.url)) return tab;
    }
  } catch (e) {}

  return null;
}

export async function initializeActiveTab() {
  try {
    const tab = await resolveTargetTab();

    if (!tab || !tab.url) {
      setRestrictedState('No website tab');
      return;
    }

    state.activeTab = tab;

    try {
      const parsedUrl = new URL(tab.url);
      state.activeTab.domain = parsedUrl.hostname;
      state.activeTab.origin = parsedUrl.origin;
      state.activeTab.protocol = parsedUrl.protocol;
      state.activeTab.cookieStoreId = tab.cookieStoreId || null;
      dom.activeDomainText.textContent = parsedUrl.hostname;
      dom.activeDomainText.title = tab.url;
      if (dom.restrictedAlert) dom.restrictedAlert.classList.add('hidden');
      setActionsEnabled(true);
      await rememberTab(tab);
    } catch (e) {
      setRestrictedState('Invalid URL');
      return;
    }

    await refreshAllData();
  } catch (err) {
    console.error('[SessionClone] Initialization error:', err);
    showToast('Error initializing tab: ' + err.message, 'error');
  }
}

function setActionsEnabled(enabled) {
  if (dom.quickCloneBtn) dom.quickCloneBtn.disabled = !enabled;
  if (dom.quickPasteBtn) dom.quickPasteBtn.disabled = !enabled;
  if (dom.wipeSessionBtn) dom.wipeSessionBtn.disabled = !enabled;
}

export function setRestrictedState(label) {
  state.activeTab = state.activeTab || {};
  state.activeTab.isRestricted = true;
  state.activeTab.url = state.activeTab.url || '';

  if (dom.activeDomainText) dom.activeDomainText.textContent = label;
  if (dom.restrictedAlert) dom.restrictedAlert.classList.remove('hidden');
  setActionsEnabled(false);

  if (dom.cookiesListContainer) {
    dom.cookiesListContainer.innerHTML = `
      <div class="empty-state">
        <span class="empty-title">Not available here</span>
        <span class="empty-desc">Open a regular website tab to manage its session.</span>
      </div>`;
  }
  updateBadgeCounts();
}

/** Guards every operation that must run inside a real web page. */
export function ensureTargetReady(action = 'This action') {
  if (!state.activeTab || state.activeTab.isRestricted || !isInjectable(state.activeTab.url)) {
    showToast(`${action} needs a regular website tab (http/https).`, 'warning');
    return false;
  }
  if (!state.activeTab.id) {
    showToast(`${action} needs an active tab.`, 'warning');
    return false;
  }
  return true;
}

export async function refreshAllData() {
  if (!state.activeTab || !state.activeTab.url || state.activeTab.isRestricted) {
    updateBadgeCounts();
    return;
  }
  await Promise.all([fetchCookiesSafe(), fetchStorageSafe()]);
  updateBadgeCounts();
}

/* The fetch/render implementations live in their own modules; main.js wires
   them here so that neither module has to import the other. */
let cookiesFetcher = null;
let storageFetcher = null;

export function wireDataLoaders({ fetchCookies, fetchStorage }) {
  cookiesFetcher = fetchCookies;
  storageFetcher = fetchStorage;
}

async function fetchCookiesSafe() {
  if (cookiesFetcher) {
    try { await cookiesFetcher(); } catch (e) { console.warn('[SessionClone] cookie fetch failed', e); }
  }
}

async function fetchStorageSafe() {
  if (storageFetcher) {
    try { await storageFetcher(); } catch (e) { console.warn('[SessionClone] storage fetch failed', e); }
  }
}

export function updateBadgeCounts() {
  const cCount = state.cookies.length;
  const lCount = Object.keys(state.localStorageData || {}).length;
  const sCount = Object.keys(state.sessionStorageData || {}).length;

  if (dom.cookiesCountBadge) dom.cookiesCountBadge.textContent = String(cCount);
  if (dom.localCountBadge) dom.localCountBadge.textContent = String(lCount);
  if (dom.sessionCountBadge) dom.sessionCountBadge.textContent = String(sCount);
  if (dom.footerTotalSummary) {
    dom.footerTotalSummary.textContent = `${cCount} Cookies • ${lCount + sCount} Storage Items`;
  }
}

export function bindHeaderActions({ onClone, onPaste, onWipe, onOpenFullTab }) {
  if (dom.quickCloneBtn) dom.quickCloneBtn.addEventListener('click', onClone);
  if (dom.quickPasteBtn) dom.quickPasteBtn.addEventListener('click', onPaste);
  if (dom.wipeSessionBtn) dom.wipeSessionBtn.addEventListener('click', onWipe);
  if (dom.openFullTabBtn) dom.openFullTabBtn.addEventListener('click', onOpenFullTab);

  if (dom.refreshTabBtn) {
    dom.refreshTabBtn.addEventListener('click', async () => {
      if (state.activeTab && state.activeTab.id && !state.activeTab.isRestricted) {
        try {
          await browserAPI.tabs.reload(state.activeTab.id);
          showToast('Tab reloaded', 'info');
          setTimeout(() => refreshAllData(), 400);
        } catch (e) {
          showToast('Could not reload tab: ' + (e.message || ''), 'error');
        }
      } else {
        showToast('No reloadable website tab.', 'warning');
      }
    });
  }

  // Segmented tab navigation
  dom.navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      dom.navTabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      dom.tabPanels.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      const targetId = tab.getAttribute('data-tab');
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) targetPanel.classList.add('active');
      state.activeTabNav = targetId;
    });
  });
}

/**
 * Opens the complete interface in a normal browser tab, aimed at the tab we
 * are currently inspecting. Fixed-size popups struggle with large sites.
 */
export async function openFullTabView() {
  if (!browserAPI || !browserAPI.tabs || !browserAPI.tabs.create) {
    showToast('Opening a full tab is not supported in this browser.', 'warning');
    return;
  }
  const source = state.activeTab && state.activeTab.id ? state.activeTab.id : '';
  const url = browserAPI.runtime.getURL(`popup/popup.html?mode=tab${source ? `&sourceTabId=${source}` : ''}`);
  try {
    await browserAPI.tabs.create({ url });
    if (isPopupView()) {
      setTimeout(() => { try { window.close(); } catch (e) {} }, 150);
    }
  } catch (e) {
    showToast('Could not open full view: ' + (e.message || ''), 'error');
  }
}
