/**
 * SessionClone - Multi-account Vault
 * Saves whole sessions as named profiles and switches between them in one click.
 * Profiles are stored locally in chrome.storage.local.
 */

import {
  browserAPI, state, dom, showToast, escapeHtml, copyTextToClipboard,
  openConfirmModal, refresh, runBulk, debounce, downloadTextFile,
  requestAutoReload
} from './core.js';
import { ensureTargetReady } from './tab.js';
import { injectStorageIntoPage, wipeCurrentDomainCookies } from './transfer.js';

const PROFILES_KEY = 'session_profiles';
const MAX_PROFILES = 50;
/** Stay comfortably below the 10240 * 1024 byte chrome.storage.local quota. */
const MAX_BACKUP_BYTES = 6 * 1024 * 1024;

export async function loadVaultProfiles() {
  try {
    const data = await browserAPI.storage.local.get([PROFILES_KEY]);
    state.vaultProfiles = Array.isArray(data[PROFILES_KEY]) ? data[PROFILES_KEY] : [];
    renderVaultProfiles();
    if (dom.vaultCountBadge) dom.vaultCountBadge.textContent = String(state.vaultProfiles.length);
  } catch (e) {
    console.warn('[SessionClone] Could not load vault profiles', e);
    state.vaultProfiles = [];
    renderVaultProfiles();
  }
}

async function persistProfiles() {
  try {
    await browserAPI.storage.local.set({ [PROFILES_KEY]: state.vaultProfiles });
    return true;
  } catch (err) {
    const quota = err && /quota|QUOTA/i.test(err.message || '');
    showToast(
      quota
        ? 'Storage quota reached - delete old profiles or export them first.'
        : 'Could not save profiles: ' + (err.message || ''),
      'error'
    );
    return false;
  }
}

export async function saveVaultProfile() {
  if (!ensureTargetReady('Saving a profile')) return;

  const name = dom.newProfileNameInput.value.trim();
  if (!name) {
    showToast('Profile name is required.', 'warning');
    return;
  }

  if (state.vaultProfiles.length >= MAX_PROFILES) {
    showToast(`Profile limit reached (${MAX_PROFILES}). Delete an old profile first.`, 'warning');
    return;
  }

  const newProfile = {
    id: 'prof_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    name: name,
    color: state.selectedProfileColor || 'indigo',
    domain: state.activeTab.domain,
    url: state.activeTab.url,
    createdAt: new Date().toISOString(),
    cookies: state.cookies,
    localStorage: state.localStorageData,
    sessionStorage: state.sessionStorageData
  };

  const backup = state.vaultProfiles.slice();
  state.vaultProfiles.unshift(newProfile);

  if (JSON.stringify(state.vaultProfiles).length > MAX_BACKUP_BYTES) {
    state.vaultProfiles = backup;
    showToast('This session is too large to store. Export the profiles you need instead.', 'warning');
    return;
  }

  const saved = await persistProfiles();
  if (!saved) {
    state.vaultProfiles = backup;
    return;
  }

  dom.newProfileNameInput.value = '';
  showToast(`Profile "${name}" saved`, 'success');
  renderVaultProfiles();
  if (dom.vaultCountBadge) dom.vaultCountBadge.textContent = String(state.vaultProfiles.length);
}

export function renderVaultProfiles() {
  const container = dom.vaultProfilesContainer;
  if (!container) return;
  container.innerHTML = '';

  const filter = state.filters.vault.toLowerCase().trim();
  const domainOnly = state.filters.vaultDomainOnly;

  const filtered = state.vaultProfiles.filter(p => {
    if (domainOnly && state.activeTab && state.activeTab.domain && p.domain !== state.activeTab.domain) {
      return false;
    }
    if (!filter) return true;
    return (
      (p.name && p.name.toLowerCase().includes(filter)) ||
      (p.domain && p.domain.toLowerCase().includes(filter))
    );
  });

  if (filtered.length === 0) {
    const hidden = domainOnly && state.vaultProfiles.length > 0;
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-title">${hidden ? 'No profiles for this domain' : 'Vault is empty'}</span>
        <span class="empty-desc">${hidden
          ? 'Turn off "Active Domain Only" to see your other saved profiles.'
          : 'Save your active session above to switch between accounts with 1 click.'}</span>
      </div>
    `;
    return;
  }

  const colorMap = {
    indigo: '#6366f1',
    cyan: '#0ea5e9',
    emerald: '#10b981',
    amber: '#f59e0b',
    rose: '#f43f5e',
    zinc: '#71717a'
  };

  filtered.forEach(prof => {
    const card = document.createElement('div');
    card.className = 'profile-card';
    card.style.setProperty('--card-color', colorMap[prof.color] || '#6366f1');

    const dateStr = new Date(prof.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const cCount = prof.cookies ? prof.cookies.length : 0;
    const lCount = prof.localStorage ? Object.keys(prof.localStorage).length : 0;
    const sCount = prof.sessionStorage ? Object.keys(prof.sessionStorage).length : 0;

    const top = document.createElement('div');
    top.className = 'profile-card-top';
    top.innerHTML = `
      <span class="profile-card-name">${escapeHtml(prof.name)}</span>
      <span class="tag">${escapeHtml(prof.domain || '')}</span>
    `;

    const meta = document.createElement('div');
    meta.className = 'profile-card-meta';
    meta.innerHTML = `
      <span>${cCount} cookies • ${lCount + sCount} storage</span>
      <span>${escapeHtml(dateStr)}</span>
    `;

    card.appendChild(top);
    card.appendChild(meta);

    const btnRow = document.createElement('div');
    btnRow.className = 'profile-btn-row';

    const activateBtn = document.createElement('button');
    activateBtn.className = 'btn btn-primary btn-sm btn-flex';
    activateBtn.textContent = 'Activate';
    activateBtn.title = 'Switch to this profile and reload';
    activateBtn.setAttribute('aria-label', `Activate profile ${prof.name}`);
    activateBtn.onclick = () => activateProfile(prof);

    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn btn-secondary btn-sm';
    exportBtn.textContent = 'Export';
    exportBtn.title = 'Copy profile JSON';
    exportBtn.setAttribute('aria-label', `Export profile ${prof.name}`);
    exportBtn.onclick = () => copyTextToClipboard(JSON.stringify(prof, null, 2), `Profile "${prof.name}" JSON copied`);

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-ghost-danger btn-sm';
    delBtn.textContent = '✕';
    delBtn.title = 'Delete profile';
    delBtn.setAttribute('aria-label', `Delete profile ${prof.name}`);
    delBtn.onclick = () => deleteProfile(prof.id, prof.name);

    btnRow.appendChild(activateBtn);
    btnRow.appendChild(exportBtn);
    btnRow.appendChild(delBtn);
    card.appendChild(btnRow);

    container.appendChild(card);
  });
}

export function activateProfile(prof) {
  if (!ensureTargetReady('Switching profiles')) return;

  openConfirmModal(
    `Switch to "${prof.name}"?`,
    `Activating will replace the session on ${state.activeTab.domain} and reload the tab.`,
    async () => {
      try {
        const wipeResult = await wipeCurrentDomainCookies();

        let cookieResult = { ok: 0, fail: 0, lastError: null };
        if (prof.cookies && prof.cookies.length) {
          cookieResult = await runBulk(
            prof.cookies,
            async c => {
              const sanitized = CookieUtils.sanitizeCookieForSet(c, state.activeTab.url);
              const set = await browserAPI.cookies.set(sanitized);
              if (!set) throw new Error(`rejected: ${c.name}`);
            },
            'profile cookie'
          );
        }

        let lCount = 0;
        let sCount = 0;
        try {
          const counts = await injectStorageIntoPage(prof.localStorage, prof.sessionStorage, true);
          lCount = counts.lInjected;
          sCount = counts.sInjected;
        } catch (e) {
          console.warn('[SessionClone] Profile storage injection failed', e);
        }

        if (cookieResult.fail > 0) {
          showToast(
            `Switched with warnings: ${cookieResult.ok} cookies, ${lCount + sCount} keys - ` +
            `${cookieResult.fail} cookies failed`,
            'warning'
          );
        } else {
          showToast(`Switched to "${prof.name}" (${cookieResult.ok} cookies, ${lCount + sCount} keys, replaced ${wipeResult.ok})`, 'success');
        }

        await refresh();
        requestAutoReload('profile');
      } catch (err) {
        console.error('[SessionClone] Profile switch failed:', err);
        showToast('Failed to switch profile: ' + (err.message || ''), 'error');
      }
    }
  );
}

export function deleteProfile(id, name) {
  openConfirmModal(
    'Delete Profile',
    `Delete the saved profile "${name}"? This cannot be undone.`,
    async () => {
      const backup = state.vaultProfiles.slice();
      state.vaultProfiles = state.vaultProfiles.filter(p => p.id !== id);
      const saved = await persistProfiles();
      if (!saved) {
        state.vaultProfiles = backup;
        return;
      }
      showToast('Profile deleted', 'info');
      renderVaultProfiles();
      if (dom.vaultCountBadge) dom.vaultCountBadge.textContent = String(state.vaultProfiles.length);
    }
  );
}

/* ==========================================================================
   VAULT BACKUP (all profiles in one file)
   ========================================================================== */

export function exportVaultBackup() {
  if (!state.vaultProfiles.length) {
    showToast('The vault is empty - nothing to back up.', 'info');
    return;
  }
  const payload = {
    type: 'SessionCloneVaultBackup',
    version: 1,
    exportedAt: new Date().toISOString(),
    profiles: state.vaultProfiles
  };
  downloadTextFile(JSON.stringify(payload, null, 2), 'sessionclone_vault_backup.json', 'application/json');
  showToast(`Backed up ${state.vaultProfiles.length} profiles`, 'success');
}

export function importVaultBackup(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const parsed = JSON.parse(e.target.result);
      const incoming = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.profiles) ? parsed.profiles : null);
      if (!incoming || !incoming.length) {
        showToast('No profiles found in that file.', 'warning');
        return;
      }

      const existingIds = new Set(state.vaultProfiles.map(p => p.id));
      const valid = incoming.filter(p => p && typeof p === 'object' && p.name && !existingIds.has(p.id));
      if (!valid.length) {
        showToast('All profiles in that file are already in the vault.', 'info');
        return;
      }

      const backup = state.vaultProfiles.slice();
      state.vaultProfiles = valid.concat(state.vaultProfiles).slice(0, MAX_PROFILES);

      persistProfiles().then(saved => {
        if (!saved) {
          state.vaultProfiles = backup;
          return;
        }
        showToast(`Imported ${valid.length} profiles`, 'success');
        renderVaultProfiles();
        if (dom.vaultCountBadge) dom.vaultCountBadge.textContent = String(state.vaultProfiles.length);
      });
    } catch (err) {
      showToast('That file is not a valid SessionClone backup.', 'error');
    }
  };
  reader.onerror = () => showToast('Could not read the file.', 'error');
  reader.readAsText(file);
}

/* ==========================================================================
   BINDINGS
   ========================================================================== */

export function bindVaultEvents() {
  if (dom.profileColorDots) {
    dom.profileColorDots.querySelectorAll('.c-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        dom.profileColorDots.querySelectorAll('.c-dot').forEach(d => {
          d.classList.remove('active');
          d.setAttribute('aria-pressed', 'false');
        });
        dot.classList.add('active');
        dot.setAttribute('aria-pressed', 'true');
        state.selectedProfileColor = dot.getAttribute('data-color');
      });
    });
  }

  if (dom.saveProfileBtn) dom.saveProfileBtn.addEventListener('click', saveVaultProfile);

  if (dom.newProfileNameInput) {
    dom.newProfileNameInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') saveVaultProfile();
    });
  }

  if (dom.vaultSearchInput) {
    dom.vaultSearchInput.addEventListener('input', debounce(e => {
      state.filters.vault = e.target.value;
      renderVaultProfiles();
    }, 150));
  }

  if (dom.vaultDomainOnlyCheckbox) {
    dom.vaultDomainOnlyCheckbox.checked = state.filters.vaultDomainOnly;
    dom.vaultDomainOnlyCheckbox.addEventListener('change', e => {
      state.filters.vaultDomainOnly = e.target.checked;
      renderVaultProfiles();
    });
  }

  if (dom.vaultBackupExportBtn) dom.vaultBackupExportBtn.addEventListener('click', exportVaultBackup);
  if (dom.vaultBackupImportBtn) dom.vaultBackupImportBtn.addEventListener('click', () => dom.vaultBackupFileInput.click());
  if (dom.vaultBackupFileInput) {
    dom.vaultBackupFileInput.addEventListener('change', e => {
      if (e.target.files && e.target.files.length) {
        importVaultBackup(e.target.files[0]);
        e.target.value = '';
      }
    });
  }
}
