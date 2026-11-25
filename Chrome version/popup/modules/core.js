/**
 * SessionClone - Core runtime
 * Shared state, DOM cache, UI helpers (toasts, modals), clipboard helpers,
 * bulk-operation reporting and the configurable auto-reload countdown.
 */

export const browserAPI = (typeof browser !== 'undefined')
  ? browser
  : (typeof chrome !== 'undefined' ? chrome : null);

/* View mode: the popup itself, or the full-tab view (?mode=tab) */
const params = new URLSearchParams(location.search);
export const viewMode = params.get('mode') === 'tab' ? 'tab' : 'popup';
export const sourceTabIdParam = Number(params.get('sourceTabId')) || null;
export const isPopupView = () => viewMode === 'popup';

export const state = {
  activeTab: null,
  cookies: [],
  localStorageData: {},
  sessionStorageData: {},
  vaultProfiles: [],
  selectedProfileColor: 'indigo',
  settings: {
    theme: 'zinc',
    wipeBeforeImport: true,
    refreshMode: 'countdown', // 'instant' | 'countdown' | 'never'
    refreshDelay: 5,
    deepPurge: true,
    blurValues: false
  },
  filters: {
    cookies: '',
    local: '',
    session: '',
    vault: '',
    vaultDomainOnly: true
  },
  activeTabNav: 'cookiesTab',
  exportFormat: 'bundle',
  isEncryptedExport: false,
  pendingImportPayload: null
};

/** Cross-module wiring (set by main.js) avoids circular imports. */
export const hooks = { refresh: null };
export async function refresh() {
  if (typeof hooks.refresh === 'function') {
    await hooks.refresh();
  }
}

export const dom = {};

export function cacheDomElements() {
  const g = id => document.getElementById(id);

  // Header
  dom.domainBadge = g('domainBadge');
  dom.activeDomainText = g('activeDomainText');
  dom.quickCloneBtn = g('quickCloneBtn');
  dom.quickPasteBtn = g('quickPasteBtn');
  dom.openFullTabBtn = g('openFullTabBtn');
  dom.refreshTabBtn = g('refreshTabBtn');
  dom.wipeSessionBtn = g('wipeSessionBtn');
  dom.restrictedAlert = g('restrictedAlert');

  // Nav & Badges
  dom.navTabs = document.querySelectorAll('.nav-segment-tab');
  dom.tabPanels = document.querySelectorAll('.tab-panel');
  dom.cookiesCountBadge = g('cookiesCountBadge');
  dom.localCountBadge = g('localCountBadge');
  dom.sessionCountBadge = g('sessionCountBadge');
  dom.vaultCountBadge = g('vaultCountBadge');
  dom.footerTotalSummary = g('footerTotalSummary');
  dom.footerStatus = g('footerStatus');

  // Cookies Tab
  dom.cookieSearchInput = g('cookieSearchInput');
  dom.clearCookieSearchBtn = g('clearCookieSearchBtn');
  dom.addCookieBtn = g('addCookieBtn');
  dom.copyAllCookiesBtn = g('copyAllCookiesBtn');
  dom.clearAllCookiesBtn = g('clearAllCookiesBtn');
  dom.cookiesListContainer = g('cookiesListContainer');

  // LocalStorage Tab
  dom.localSearchInput = g('localSearchInput');
  dom.clearLocalSearchBtn = g('clearLocalSearchBtn');
  dom.addLocalBtn = g('addLocalBtn');
  dom.copyAllLocalBtn = g('copyAllLocalBtn');
  dom.clearAllLocalBtn = g('clearAllLocalBtn');
  dom.localListContainer = g('localListContainer');

  // SessionStorage Tab
  dom.sessionSearchInput = g('sessionSearchInput');
  dom.clearSessionSearchBtn = g('clearSessionSearchBtn');
  dom.addSessionBtn = g('addSessionBtn');
  dom.copyAllSessionBtn = g('copyAllSessionBtn');
  dom.clearAllSessionBtn = g('clearAllSessionBtn');
  dom.sessionListContainer = g('sessionListContainer');

  // Port (Import / Export)
  dom.exportModeBtn = g('exportModeBtn');
  dom.importModeBtn = g('importModeBtn');
  dom.exportViewSection = g('exportViewSection');
  dom.importViewSection = g('importViewSection');
  dom.formatOptions = document.querySelectorAll('.format-option');
  dom.enableEncryptionCheckbox = g('enableEncryptionCheckbox');
  dom.encryptionPasswordFields = g('encryptionPasswordFields');
  dom.exportPasswordInput = g('exportPasswordInput');
  dom.toggleExportPasswordBtn = g('toggleExportPasswordBtn');
  dom.copyExportBtn = g('copyExportBtn');
  dom.downloadExportBtn = g('downloadExportBtn');

  dom.importDropzone = g('importDropzone');
  dom.importTextarea = g('importTextarea');
  dom.pasteFromClipboardBtn = g('pasteFromClipboardBtn');
  dom.importFileInput = g('importFileInput');
  dom.detectedFormatBadge = g('detectedFormatBadge');
  dom.clearBeforeImportCheckbox = g('clearBeforeImportCheckbox');
  dom.executeImportBtn = g('executeImportBtn');

  // Vault Tab
  dom.newProfileNameInput = g('newProfileNameInput');
  dom.profileColorDots = g('profileColorDots');
  dom.saveProfileBtn = g('saveProfileBtn');
  dom.vaultSearchInput = g('vaultSearchInput');
  dom.vaultDomainOnlyCheckbox = g('vaultDomainOnlyCheckbox');
  dom.vaultProfilesContainer = g('vaultProfilesContainer');
  dom.vaultBackupExportBtn = g('vaultBackupExportBtn');
  dom.vaultBackupImportBtn = g('vaultBackupImportBtn');
  dom.vaultBackupFileInput = g('vaultBackupFileInput');

  // Settings Tab
  dom.themeCards = document.querySelectorAll('.theme-card');
  dom.settingWipeBeforeImport = g('settingWipeBeforeImport');
  dom.settingDeepPurge = g('settingDeepPurge');
  dom.settingBlurValues = g('settingBlurValues');
  dom.refreshModeSelect = g('refreshModeSelect');
  dom.refreshDelayInput = g('refreshDelayInput');
  dom.refreshDelayWrap = g('refreshDelayWrap');
  dom.aboutVersion = g('aboutVersion');
  dom.privacyPolicyLink = g('privacyPolicyLink');
  dom.refreshPermsBtn = g('refreshPermsBtn');
  dom.permHostBadge = g('permHostBadge');
  dom.permHostBtn = g('permHostBtn');
  dom.permClipBadge = g('permClipBadge');
  dom.permClipBtn = g('permClipBtn');
  dom.permCoreBadge = g('permCoreBadge');
  dom.permCoreBtn = g('permCoreBtn');

  // Modals
  dom.privacyModal = g('privacyModal');
  dom.quickPasteModal = g('quickPasteModal');
  dom.modalQuickPasteTextarea = g('modalQuickPasteTextarea');
  dom.quickPasteDetectedBadge = g('quickPasteDetectedBadge');
  dom.modalQuickPasteInjectBtn = g('modalQuickPasteInjectBtn');

  dom.cookieModal = g('cookieModal');
  dom.cookieModalTitle = g('cookieModalTitle');
  dom.modalCookieName = g('modalCookieName');
  dom.modalCookieValue = g('modalCookieValue');
  dom.modalCookieDomain = g('modalCookieDomain');
  dom.modalCookiePath = g('modalCookiePath');
  dom.modalCookieSameSite = g('modalCookieSameSite');
  dom.modalCookieExpiration = g('modalCookieExpiration');
  dom.modalCookieSession = g('modalCookieSession');
  dom.modalCookieSecure = g('modalCookieSecure');
  dom.modalCookieHttpOnly = g('modalCookieHttpOnly');
  dom.modalCookieHostOnly = g('modalCookieHostOnly');
  dom.modalCookieSaveBtn = g('modalCookieSaveBtn');

  dom.storageModal = g('storageModal');
  dom.storageModalTitle = g('storageModalTitle');
  dom.modalStorageKey = g('modalStorageKey');
  dom.modalStorageValue = g('modalStorageValue');
  dom.modalStorageType = g('modalStorageType');
  dom.modalStorageOriginalKey = g('modalStorageOriginalKey');
  dom.formatModalJsonBtn = g('formatModalJsonBtn');
  dom.modalStorageSaveBtn = g('modalStorageSaveBtn');

  dom.jwtModal = g('jwtModal');
  dom.jwtStatusBadge = g('jwtStatusBadge');
  dom.jwtIatDisplay = g('jwtIatDisplay');
  dom.jwtExpDisplay = g('jwtExpDisplay');
  dom.jwtAlgDisplay = g('jwtAlgDisplay');
  dom.jwtHeaderPre = g('jwtHeaderPre');
  dom.jwtPayloadPre = g('jwtPayloadPre');
  dom.copyJwtHeaderBtn = g('copyJwtHeaderBtn');
  dom.copyJwtPayloadBtn = g('copyJwtPayloadBtn');
  dom.copyRawJwtBtn = g('copyRawJwtBtn');

  dom.decryptModal = g('decryptModal');
  dom.decryptPasswordInput = g('decryptPasswordInput');
  dom.toggleDecryptPasswordBtn = g('toggleDecryptPasswordBtn');
  dom.executeDecryptBtn = g('executeDecryptBtn');

  dom.confirmModal = g('confirmModal');
  dom.confirmModalTitle = g('confirmModalTitle');
  dom.confirmModalMessage = g('confirmModalMessage');
  dom.confirmProceedBtn = g('confirmProceedBtn');

  dom.reloadModal = g('reloadModal');
  dom.reloadTargetDomain = g('reloadTargetDomain');
  dom.reloadContextText = g('reloadContextText');
  dom.countdownValue = g('countdownValue');
  dom.countdownReloadBtn = g('countdownReloadBtn');
  dom.countdownCancelBtn = g('countdownCancelBtn');

  dom.toastContainer = g('toastContainer');
}

/* ==========================================================================
   TEXT / CLIPBOARD HELPERS
   ========================================================================== */

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function showToast(message, type = 'info') {
  if (!dom.toastContainer) return;

  // Keep the stack small so toasts never bury the UI
  while (dom.toastContainer.children.length >= 4) {
    dom.toastContainer.removeChild(dom.toastContainer.firstChild);
  }

  const toast = document.createElement('div');
  toast.className = `toast-item toast-${type}`;
  const dot = document.createElement('span');
  dot.className = 'toast-dot';
  const text = document.createElement('span');
  text.textContent = message;
  toast.appendChild(dot);
  toast.appendChild(text);

  dom.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(6px)';
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 220);
  }, 3000);
}

export async function copyTextToClipboard(text, successMsg) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMsg || 'Copied', 'success');
    return true;
  } catch (err) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast(successMsg || 'Copied', 'success');
      return true;
    } catch (e) {
      showToast('Could not access the clipboard.', 'error');
      return false;
    }
  }
}

/**
 * Reading the clipboard needs the optional `clipboardRead` permission.
 * Requested on first use, from the user's own click.
 */
export async function ensureClipboardPermission() {
  if (!browserAPI || !browserAPI.permissions || !browserAPI.permissions.contains) return true;
  try {
    const has = await browserAPI.permissions.contains({ permissions: ['clipboardRead'] });
    if (has) return true;
    return await browserAPI.permissions.request({ permissions: ['clipboardRead'] });
  } catch (e) {
    // Browser may not model this permission as requestable - try the read anyway.
    return true;
  }
}

/* ==========================================================================
   MODALS
   ========================================================================== */

let lastFocused = null;

export function openModal(el) {
  if (!el) return;
  lastFocused = document.activeElement;
  el.classList.remove('hidden');
  const focusable = el.querySelector('input:not([type="hidden"]), textarea, select, button');
  if (focusable) {
    try { focusable.focus(); } catch (e) {}
  }
}

export function closeModal(el) {
  if (!el || el.classList.contains('hidden')) return;
  el.classList.add('hidden');
  if (lastFocused && typeof lastFocused.focus === 'function') {
    try { lastFocused.focus(); } catch (e) {}
  }
  lastFocused = null;
}

export function openConfirmModal(title, message, onProceed) {
  dom.confirmModalTitle.textContent = title;
  dom.confirmModalMessage.textContent = message;
  dom.confirmProceedBtn.onclick = () => {
    closeModal(dom.confirmModal);
    if (typeof onProceed === 'function') onProceed();
  };
  openModal(dom.confirmModal);
}

/**
 * Global modal behaviour: Escape closes, backdrop click closes,
 * tabs behave like tabs (arrow key navigation).
 */
export function bindModalChrome() {
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      closeModal(document.getElementById(btn.getAttribute('data-close-modal')));
    });
  });

  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('mousedown', e => {
      if (e.target === backdrop) {
        if (backdrop.id === 'reloadModal') cancelAutoReload();
        else closeModal(backdrop);
      }
    });
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const open = Array.from(document.querySelectorAll('.modal-backdrop:not(.hidden)'));
      if (!open.length) return;
      const top = open[open.length - 1];
      if (top.id === 'reloadModal') cancelAutoReload();
      else closeModal(top);
      return;
    }

    // Arrow-key navigation inside the tab bar
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && document.activeElement &&
        document.activeElement.classList.contains('nav-segment-tab')) {
      e.preventDefault();
      const tabs = Array.from(dom.navTabs);
      const idx = tabs.indexOf(document.activeElement);
      const next = e.key === 'ArrowRight'
        ? (idx + 1) % tabs.length
        : (idx - 1 + tabs.length) % tabs.length;
      tabs[next].focus();
      tabs[next].click();
    }
  });
}

/* ==========================================================================
   BULK OPERATIONS - never fail silently
   ========================================================================== */

/**
 * Runs `worker` over `items`, collecting successes and failures.
 * Failures are logged and reported back to the caller for a summary toast.
 */
export async function runBulk(items, worker, label = 'item') {
  let ok = 0;
  let fail = 0;
  let lastError = null;

  for (const item of items) {
    try {
      await worker(item);
      ok++;
    } catch (err) {
      fail++;
      lastError = err;
      console.warn(`[SessionClone] ${label} failed:`, err && err.message ? err.message : err);
    }
  }

  return { ok, fail, lastError, total: items.length };
}

export function reportBulk(prefix, result) {
  if (result.fail === 0) {
    showToast(`${prefix}: ${result.ok} ok`, 'success');
  } else {
    const detail = result.lastError && result.lastError.message ? ` (${result.lastError.message})` : '';
    showToast(`${prefix}: ${result.ok} succeeded, ${result.fail} failed${detail}`, 'warning');
  }
}

/* ==========================================================================
   CONFIGURABLE AUTO-RELOAD (instant / countdown / never)
   ========================================================================== */

let countdownTimerId = null;
let countdownRemaining = 0;
let countdownContext = '';

export function cancelAutoReload() {
  if (countdownTimerId) {
    clearInterval(countdownTimerId);
    countdownTimerId = null;
  }
  if (dom.reloadModal) closeModal(dom.reloadModal);
  if (countdownContext) {
    showToast('Auto-reload cancelled. Reload the tab manually when ready.', 'info');
    countdownContext = '';
  }
  refresh();
}

async function performReload() {
  if (countdownTimerId) {
    clearInterval(countdownTimerId);
    countdownTimerId = null;
  }
  if (dom.reloadModal) closeModal(dom.reloadModal);
  countdownContext = '';

  const tabId = state.activeTab && state.activeTab.id;
  if (tabId && browserAPI && browserAPI.tabs && browserAPI.tabs.reload) {
    try {
      await browserAPI.tabs.reload(tabId);
    } catch (err) {
      showToast('Could not reload the tab: ' + (err.message || ''), 'error');
      return;
    }
  }

  if (isPopupView()) {
    // Give the reload a moment to start, then release the popup.
    setTimeout(() => { try { window.close(); } catch (e) {} }, 250);
  } else {
    setTimeout(() => refresh(), 500);
  }
}

/**
 * Applies the user's reload preference after an injection or purge.
 * @param {string} context  e.g. 'import', 'profile', 'purge'
 */
export function requestAutoReload(context) {
  const mode = state.settings.refreshMode;

  if (mode === 'never') {
    showToast('Session updated. Reload the tab manually to see the changes.', 'info');
    refresh();
    return;
  }

  if (mode === 'instant') {
    performReload();
    return;
  }

  // countdown
  const total = Math.max(1, Math.min(30, Number(state.settings.refreshDelay) || 5));
  countdownRemaining = total;
  countdownContext = context;

  if (dom.reloadTargetDomain) {
    dom.reloadTargetDomain.textContent = state.activeTab ? (state.activeTab.domain || 'this site') : 'this site';
  }
  if (dom.reloadContextText) {
    const labels = {
      import: 'Session imported successfully.',
      profile: 'Profile switched.',
      purge: 'Site data erased.'
    };
    dom.reloadContextText.textContent = labels[context] || 'Changes applied.';
  }
  if (dom.countdownValue) dom.countdownValue.textContent = String(countdownRemaining);

  openModal(dom.reloadModal);

  countdownTimerId = setInterval(() => {
    countdownRemaining -= 1;
    if (countdownRemaining <= 0) {
      performReload();
      return;
    }
    if (dom.countdownValue) dom.countdownValue.textContent = String(countdownRemaining);
  }, 1000);
}

export function bindReloadModal() {
  if (dom.countdownReloadBtn) dom.countdownReloadBtn.addEventListener('click', performReload);
  if (dom.countdownCancelBtn) dom.countdownCancelBtn.addEventListener('click', cancelAutoReload);
}

/* ==========================================================================
   SMALL UTILITIES
   ========================================================================== */

export function debounce(fn, wait = 150) {
  let t = null;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

export function isJwtToken(str) {
  if (typeof str !== 'string') return false;
  const len = str.length;
  // A JWT is never shorter than 20 characters and practically never larger than 8KB.
  if (len < 20 || len > 8192) return false;
  const trimmed = str.trim();
  if (!trimmed.startsWith('ey') || trimmed.split('.').length !== 3) return false;
  return /^[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*$/.test(trimmed);
}

export function isJsonObject(str) {
  if (typeof str !== 'string') return false;
  const len = str.length;
  if (len < 2) return false;
  const trimmed = str.trim();
  const first = trimmed.charCodeAt(0);
  const last = trimmed.charCodeAt(trimmed.length - 1);
  const isObj = first === 123 && last === 125; // { ... }
  const isArr = first === 91 && last === 93;  // [ ... ]
  if (!isObj && !isArr) return false;

  // For very large blobs (> 100KB), { ... } or [ ... ] is sufficient for a badge.
  // Avoids synchronous parsing of multi-megabyte payloads in render loops.
  if (len > 100000) return true;

  try {
    JSON.parse(trimmed);
    return true;
  } catch (e) {
    return false;
  }
}

/** Decodes a base64url encoded JWT part into an object (UTF-8 safe). */
export function decodeJwtPart(part) {
  let base64 = part.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return JSON.parse(new TextDecoder('utf-8').decode(bytes));
}

/** Builds a download of `data` as `filename`. */
export function downloadTextFile(data, filename, mimeType) {
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** True when the active target is an internal browser page (chrome://, about:...). */
export function isInternalUrl(url) {
  if (!url) return true;
  const internal = ['chrome://', 'edge://', 'about:', 'chrome-extension://', 'moz-extension://', 'devtools://', 'view-source:', 'file://', 'ftp://'];
  return internal.some(p => url.startsWith(p));
}
