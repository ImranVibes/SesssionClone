/**
 * SessionClone - Settings, themes & about
 * All preferences persist in chrome.storage.local under one key.
 */

import { browserAPI, state, dom, showToast, openModal, closeModal, copyTextToClipboard, refresh } from './core.js';

const SETTINGS_KEY = 'sessionclone_settings';

/** Replaced by the richer reload settings; keeps old installs working. */
const DEFAULTS = {
  theme: 'zinc',
  wipeBeforeImport: true,
  refreshMode: 'countdown',
  refreshDelay: 5,
  deepPurge: true,
  blurValues: false
};

export async function loadSettings() {
  try {
    const res = await browserAPI.storage.local.get([SETTINGS_KEY]);
    if (res && res[SETTINGS_KEY]) {
      const stored = res[SETTINGS_KEY];
      const merged = { ...DEFAULTS, ...stored };

      // Migrate the old boolean "autoReload" preference
      if (stored.autoReload === false && stored.refreshMode === undefined) {
        merged.refreshMode = 'never';
      }
      delete merged.autoReload;

      state.settings = { ...DEFAULTS, ...merged };
    }
  } catch (e) {
    console.warn('[SessionClone] Could not load settings', e);
  }

  applyTheme(state.settings.theme || 'zinc');
  syncSettingsControls();
  updatePermissionsStatus();
}

export async function saveSettings() {
  try {
    await browserAPI.storage.local.set({ [SETTINGS_KEY]: state.settings });
  } catch (e) {
    console.warn('[SessionClone] Could not save settings', e);
  }
}

export function applyTheme(themeName) {
  state.settings.theme = themeName;
  document.documentElement.setAttribute('data-theme', themeName);

  if (dom.themeCards) {
    dom.themeCards.forEach(card => {
      const isMatch = card.getAttribute('data-theme-val') === themeName;
      card.classList.toggle('active', isMatch);
      const radio = card.querySelector('input');
      if (radio) radio.checked = isMatch;
    });
  }

  saveSettings();
}

export function syncSettingsControls() {
  const s = state.settings;

  if (dom.settingWipeBeforeImport) dom.settingWipeBeforeImport.checked = Boolean(s.wipeBeforeImport);
  if (dom.settingDeepPurge) dom.settingDeepPurge.checked = Boolean(s.deepPurge);
  if (dom.settingBlurValues) dom.settingBlurValues.checked = Boolean(s.blurValues);

  if (dom.refreshModeSelect) dom.refreshModeSelect.value = s.refreshMode;
  if (dom.refreshDelayInput) {
    dom.refreshDelayInput.value = String(Math.max(1, Math.min(30, Number(s.refreshDelay) || 5)));
  }
  if (dom.refreshDelayWrap) {
    dom.refreshDelayWrap.classList.toggle('hidden', s.refreshMode !== 'countdown');
  }
}

export function detectBrowserType() {
  const ua = (navigator.userAgent || '').toLowerCase();
  if (ua.includes('edg/')) return 'edge';
  if (ua.includes('firefox') || ua.includes('gecko/') || (typeof browser !== 'undefined' && browser.runtime && !ua.includes('chrome'))) return 'firefox';
  return 'chrome';
}

export function getManagerUrlForBrowser(browserType) {
  if (browserType === 'firefox') return 'about:addons';
  if (browserType === 'edge') return 'edge://extensions/';
  return 'chrome://extensions/';
}

export function switchPermBrowserTab(type) {
  const isFf = type === 'firefox';
  const isEdge = type === 'edge';
  const isChrome = type === 'chrome';

  if (dom.permTabFirefox) {
    dom.permTabFirefox.classList.toggle('active', isFf);
    dom.permTabFirefox.setAttribute('aria-selected', String(isFf));
  }
  if (dom.permTabChrome) {
    dom.permTabChrome.classList.toggle('active', isChrome);
    dom.permTabChrome.setAttribute('aria-selected', String(isChrome));
  }
  if (dom.permTabEdge) {
    dom.permTabEdge.classList.toggle('active', isEdge);
    dom.permTabEdge.setAttribute('aria-selected', String(isEdge));
  }

  if (dom.permGuideFirefox) dom.permGuideFirefox.classList.toggle('hidden', !isFf);
  if (dom.permGuideChrome) dom.permGuideChrome.classList.toggle('hidden', !isChrome);
  if (dom.permGuideEdge) dom.permGuideEdge.classList.toggle('hidden', !isEdge);

  const url = getManagerUrlForBrowser(type);
  if (dom.permManagerUrlInput) dom.permManagerUrlInput.value = url;
}

export function openPermissionsModal() {
  const bType = detectBrowserType();
  if (dom.detectedBrowserPill) {
    const labels = { firefox: 'Firefox / Floorp', edge: 'Microsoft Edge', chrome: 'Google Chrome' };
    dom.detectedBrowserPill.textContent = labels[bType] || 'Browser Add-ons';
  }
  switchPermBrowserTab(bType);
  openModal(dom.permissionsModal);
}

export async function updatePermissionsStatus() {
  if (!browserAPI || !browserAPI.permissions) return;

  // 1. Host Permissions (<all_urls>)
  try {
    const hasHost = await browserAPI.permissions.contains({ origins: ['<all_urls>'] });
    if (dom.permHostBadge) {
      dom.permHostBadge.textContent = hasHost ? 'Granted' : 'Missing';
      dom.permHostBadge.className = `tag ${hasHost ? 'tag-green' : 'tag-rose'}`;
    }
    if (dom.permHostBtn) {
      dom.permHostBtn.textContent = hasHost ? 'Active' : 'Fix';
      dom.permHostBtn.className = `btn ${hasHost ? 'btn-secondary' : 'btn-primary'} btn-micro`;
    }
    if (dom.missingPermBanner) {
      dom.missingPermBanner.classList.toggle('hidden', Boolean(hasHost));
    }
  } catch (e) {}

  // 2. Clipboard Read (clipboardRead)
  try {
    const hasClip = await browserAPI.permissions.contains({ permissions: ['clipboardRead'] });
    if (dom.permClipBadge) {
      dom.permClipBadge.textContent = hasClip ? 'Granted' : 'On Request';
      dom.permClipBadge.className = `tag ${hasClip ? 'tag-green' : 'tag-amber'}`;
    }
    if (dom.permClipBtn) {
      dom.permClipBtn.textContent = hasClip ? 'Granted' : 'Grant';
      dom.permClipBtn.className = `btn ${hasClip ? 'btn-secondary' : 'btn-primary'} btn-micro`;
    }
  } catch (e) {}

  // 3. Core Permissions (cookies, storage, scripting)
  try {
    const hasCore = await browserAPI.permissions.contains({ permissions: ['cookies', 'storage', 'scripting'] });
    if (dom.permCoreBadge) {
      dom.permCoreBadge.textContent = hasCore ? 'Active' : 'Missing';
      dom.permCoreBadge.className = `tag ${hasCore ? 'tag-green' : 'tag-rose'}`;
    }
    if (dom.permCoreBtn) {
      dom.permCoreBtn.textContent = hasCore ? 'Active' : 'Grant';
      dom.permCoreBtn.className = `btn ${hasCore ? 'btn-secondary' : 'btn-primary'} btn-micro`;
    }
  } catch (e) {}
}

function renderAbout() {
  if (!dom.aboutVersion) return;
  let version = '1.0.0';
  try {
    version = browserAPI.runtime.getManifest().version;
  } catch (e) {}
  dom.aboutVersion.textContent = `v${version}`;
}

export function bindSettingsEvents({ onRefreshChanged }) {
  if (dom.settingWipeBeforeImport) {
    dom.settingWipeBeforeImport.addEventListener('change', e => {
      state.settings.wipeBeforeImport = e.target.checked;
      saveSettings();
      showToast(e.target.checked ? 'Clean wipe before import: on' : 'Clean wipe before import: off', 'info');
    });
  }

  if (dom.settingDeepPurge) {
    dom.settingDeepPurge.addEventListener('change', e => {
      state.settings.deepPurge = e.target.checked;
      saveSettings();
      showToast(e.target.checked ? 'Deep purge (IndexedDB, caches, workers): on' : 'Deep purge: off', 'info');
    });
  }

  if (dom.settingBlurValues) {
    dom.settingBlurValues.addEventListener('change', e => {
      state.settings.blurValues = e.target.checked;
      saveSettings();
      showToast(e.target.checked ? 'Values are now hidden by default' : 'Values are now visible', 'info');
      if (typeof onRefreshChanged === 'function') onRefreshChanged();
    });
  }

  if (dom.refreshModeSelect) {
    dom.refreshModeSelect.addEventListener('change', e => {
      state.settings.refreshMode = e.target.value;
      syncSettingsControls();
      saveSettings();
    });
  }

  if (dom.refreshDelayInput) {
    dom.refreshDelayInput.addEventListener('change', e => {
      let v = parseInt(e.target.value, 10);
      if (isNaN(v) || v < 1) v = 1;
      if (v > 30) v = 30;
      e.target.value = String(v);
      state.settings.refreshDelay = v;
      saveSettings();
    });
  }

  if (dom.themeCards) {
    dom.themeCards.forEach(card => {
      card.addEventListener('click', () => {
        const tVal = card.getAttribute('data-theme-val');
        applyTheme(tVal);
        showToast(`Theme: ${card.querySelector('.theme-name').textContent}`, 'info');
      });
    });
  }

  if (dom.refreshPermsBtn) {
    dom.refreshPermsBtn.addEventListener('click', async () => {
      await updatePermissionsStatus();
      showToast('Permissions checked', 'info');
    });
  }

  // Missing permission banner action
  if (dom.bannerFixPermBtn) {
    dom.bannerFixPermBtn.addEventListener('click', () => {
      openPermissionsModal();
    });
  }

  // Permission assistance modal tabs and actions
  if (dom.permTabFirefox) {
    dom.permTabFirefox.addEventListener('click', () => switchPermBrowserTab('firefox'));
  }
  if (dom.permTabChrome) {
    dom.permTabChrome.addEventListener('click', () => switchPermBrowserTab('chrome'));
  }
  if (dom.permTabEdge) {
    dom.permTabEdge.addEventListener('click', () => switchPermBrowserTab('edge'));
  }

  if (dom.copyPermUrlBtn) {
    dom.copyPermUrlBtn.addEventListener('click', () => {
      const url = (dom.permManagerUrlInput && dom.permManagerUrlInput.value) || 'about:addons';
      copyTextToClipboard(url, `Copied "${url}"`);
    });
  }

  if (dom.openExtManagerBtn) {
    dom.openExtManagerBtn.addEventListener('click', async () => {
      const url = (dom.permManagerUrlInput && dom.permManagerUrlInput.value) || 'about:addons';
      let opened = false;
      try {
        if (browserAPI && browserAPI.tabs && browserAPI.tabs.create) {
          await browserAPI.tabs.create({ url });
          opened = true;
        }
      } catch (e) {}

      if (!opened) {
        try {
          if (browserAPI && browserAPI.runtime && browserAPI.runtime.openOptionsPage) {
            await browserAPI.runtime.openOptionsPage();
            opened = true;
          }
        } catch (e) {}
      }

      if (!opened) {
        await copyTextToClipboard(url, `Copied "${url}" — paste into a new browser tab`);
      } else {
        showToast(`Opening ${url}...`, 'info');
      }
    });
  }

  if (dom.recheckPermsModalBtn) {
    dom.recheckPermsModalBtn.addEventListener('click', async () => {
      try {
        const has = await browserAPI.permissions.contains({ origins: ['<all_urls>'] });
        if (has) {
          showToast('Website access is now active!', 'success');
          closeModal(dom.permissionsModal);
          await updatePermissionsStatus();
          await refresh();
        } else {
          showToast('Access is still disabled. Turn ON "Access your data for all websites" in settings.', 'warning');
        }
      } catch (err) {
        showToast('Error checking permissions: ' + (err.message || ''), 'error');
      }
    });
  }

  if (dom.permHostBtn) {
    dom.permHostBtn.addEventListener('click', async () => {
      try {
        const has = await browserAPI.permissions.contains({ origins: ['<all_urls>'] });
        if (has) {
          showToast('Website access is already active.', 'info');
          await updatePermissionsStatus();
          return;
        }
        // If not granted, open the dedicated visual guide modal
        openPermissionsModal();
      } catch (err) {
        openPermissionsModal();
      }
    });
  }

  if (dom.permClipBtn) {
    dom.permClipBtn.addEventListener('click', async () => {
      try {
        const has = await browserAPI.permissions.contains({ permissions: ['clipboardRead'] });
        if (has) {
          showToast('Clipboard read permission is already active.', 'info');
          await updatePermissionsStatus();
          return;
        }
        const granted = await browserAPI.permissions.request({ permissions: ['clipboardRead'] });
        if (granted) {
          showToast('Clipboard permission granted!', 'success');
        } else {
          showToast('Clipboard permission was denied.', 'warning');
        }
        await updatePermissionsStatus();
      } catch (err) {
        showToast('Clipboard request: ' + (err.message || ''), 'info');
      }
    });
  }

  if (dom.permCoreBtn) {
    dom.permCoreBtn.addEventListener('click', async () => {
      try {
        const has = await browserAPI.permissions.contains({ permissions: ['cookies', 'storage', 'scripting'] });
        if (has) {
          showToast('Core permissions are already active.', 'info');
        } else {
          const granted = await browserAPI.permissions.request({ permissions: ['cookies', 'storage', 'scripting'] });
          if (granted) showToast('Core permissions granted!', 'success');
          else showToast('Core permissions denied.', 'warning');
        }
        await updatePermissionsStatus();
      } catch (err) {
        showToast('Core permissions: ' + (err.message || ''), 'info');
      }
    });
  }

  if (dom.privacyPolicyLink) {
    dom.privacyPolicyLink.addEventListener('click', e => {
      e.preventDefault();
      openModal(dom.privacyModal);
    });
  }

  if (browserAPI && browserAPI.permissions) {
    try {
      if (browserAPI.permissions.onAdded) browserAPI.permissions.onAdded.addListener(updatePermissionsStatus);
      if (browserAPI.permissions.onRemoved) browserAPI.permissions.onRemoved.addListener(updatePermissionsStatus);
    } catch (e) {}
  }

  renderAbout();
  updatePermissionsStatus();
}
