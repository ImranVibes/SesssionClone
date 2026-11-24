/**
 * SessionClone - Settings, themes & about
 * All preferences persist in chrome.storage.local under one key.
 */

import { browserAPI, state, dom, showToast, openModal, closeModal } from './core.js';

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
      dom.permHostBtn.textContent = hasHost ? 'Re-check' : 'Grant';
      dom.permHostBtn.className = `btn ${hasHost ? 'btn-secondary' : 'btn-primary'} btn-micro`;
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

  if (dom.permHostBtn) {
    dom.permHostBtn.addEventListener('click', async () => {
      try {
        const has = await browserAPI.permissions.contains({ origins: ['<all_urls>'] });
        if (has) {
          showToast('Website access is already active.', 'info');
          await updatePermissionsStatus();
          return;
        }
        const granted = await browserAPI.permissions.request({ origins: ['<all_urls>'] });
        if (granted) {
          showToast('All websites permission granted!', 'success');
        } else {
          showToast('Permission request was denied.', 'warning');
        }
        await updatePermissionsStatus();
      } catch (err) {
        showToast('Permission check: ' + (err.message || ''), 'info');
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
