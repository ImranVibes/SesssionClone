/**
 * SessionClone - LocalStorage & SessionStorage tab
 * Reads, renders, edits and clears site storage through scripting.executeScript.
 */

import {
  browserAPI, state, dom, showToast, escapeHtml, copyTextToClipboard,
  refresh, runBulk, reportBulk, debounce, openConfirmModal, isJwtToken, isJsonObject
} from './core.js';
import { ensureTargetReady } from './tab.js';
import { openStorageModal, openJwtModal } from './modals.js';

export async function fetchStorage() {
  if (!state.activeTab || !state.activeTab.id || state.activeTab.isRestricted) return;

  try {
    const [result] = await browserAPI.scripting.executeScript({
      target: { tabId: state.activeTab.id },
      func: () => {
        const local = {};
        const session = {};
        try {
          if (typeof window.localStorage !== 'undefined') {
            for (let i = 0; i < window.localStorage.length; i++) {
              const k = window.localStorage.key(i);
              if (k !== null) local[k] = window.localStorage.getItem(k);
            }
          }
        } catch (e) {}
        try {
          if (typeof window.sessionStorage !== 'undefined') {
            for (let i = 0; i < window.sessionStorage.length; i++) {
              const k = window.sessionStorage.key(i);
              if (k !== null) session[k] = window.sessionStorage.getItem(k);
            }
          }
        } catch (e) {}
        return { local, session };
      }
    });

    if (result && result.result) {
      state.localStorageData = result.result.local || {};
      state.sessionStorageData = result.result.session || {};
    } else {
      state.localStorageData = {};
      state.sessionStorageData = {};
    }

    renderLocalStorageList();
    renderSessionStorageList();
  } catch (err) {
    console.warn('[SessionClone] Error fetching storage:', err);
    state.localStorageData = {};
    state.sessionStorageData = {};
    renderLocalStorageList();
    renderSessionStorageList();
  }
}

export function renderLocalStorageList() {
  renderStorageContainer(
    dom.localListContainer,
    state.localStorageData,
    'localStorage',
    state.filters.local,
    'No localStorage keys stored.'
  );
}

export function renderSessionStorageList() {
  renderStorageContainer(
    dom.sessionListContainer,
    state.sessionStorageData,
    'sessionStorage',
    state.filters.session,
    'No sessionStorage keys stored.'
  );
}

const PREVIEW_LIMIT_COLLAPSED = 260;
const PREVIEW_LIMIT_EXPANDED = 1500;

function formatStoragePreview(valStr, sizeStr, isExpanded, isMasked) {
  if (!valStr || valStr.length === 0) return '<empty>';
  if (isMasked) return '••••••••••••';
  const limit = isExpanded ? PREVIEW_LIMIT_EXPANDED : PREVIEW_LIMIT_COLLAPSED;
  if (valStr.length <= limit) {
    return valStr;
  }
  return `${valStr.slice(0, limit)} … [${sizeStr} total - click Copy or Edit to view full]`;
}

function renderStorageContainer(container, dataObj, type, filterQuery, emptyMsg) {
  if (!container) return;
  container.textContent = '';

  const blur = Boolean(state.settings.blurValues);
  const filter = (filterQuery || '').toLowerCase().trim();

  const keys = Object.keys(dataObj).sort();
  const filteredKeys = keys.filter(k => {
    if (!filter) return true;
    if (k.toLowerCase().includes(filter)) return true;
    const v = dataObj[k];
    if (typeof v !== 'string') return false;
    // For large strings, inspect first 30,000 characters to prevent memory exhaustion
    const searchChunk = v.length > 30000 ? v.slice(0, 30000) : v;
    return searchChunk.toLowerCase().includes(filter);
  });

  if (filteredKeys.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    const title = document.createElement('span');
    title.className = 'empty-title';
    title.textContent = keys.length === 0 ? 'Empty Storage' : 'No matching items';
    const desc = document.createElement('span');
    desc.className = 'empty-desc';

    const isPermMissing = dom.missingPermBanner && !dom.missingPermBanner.classList.contains('hidden');
    if (keys.length === 0 && isPermMissing) {
      desc.textContent = 'Website permission is disabled in your browser settings.';
    } else {
      desc.textContent = keys.length === 0 ? emptyMsg : 'Try adjusting your search filter.';
    }
    emptyState.appendChild(title);
    emptyState.appendChild(desc);

    if (keys.length === 0 && isPermMissing) {
      const fixBtn = document.createElement('button');
      fixBtn.className = 'btn btn-primary btn-micro';
      fixBtn.style.marginTop = '8px';
      fixBtn.textContent = 'Enable Website Access';
      fixBtn.addEventListener('click', () => {
        if (dom.bannerFixPermBtn) dom.bannerFixPermBtn.click();
      });
      emptyState.appendChild(fixBtn);
    }

    container.appendChild(emptyState);
    return;
  }

  const fragment = document.createDocumentFragment();

  filteredKeys.forEach(key => {
    const val = dataObj[key];
    const valStr = typeof val === 'string' ? val : (val === null || val === undefined ? '' : String(val));
    const row = document.createElement('div');
    row.className = 'data-row';

    const isJwt = isJwtToken(valStr);
    const isJson = !isJwt && isJsonObject(valStr);
    const sizeStr = CookieUtils.getStorageItemSize(key, valStr);

    // Header
    const header = document.createElement('div');
    header.className = 'row-header';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'row-title-group';

    const nameEl = document.createElement('span');
    nameEl.className = 'row-key-name';
    nameEl.textContent = key;
    nameEl.title = 'Click to copy value';
    nameEl.addEventListener('click', () => copyTextToClipboard(valStr, `Copied "${key}"`));
    titleGroup.appendChild(nameEl);
    header.appendChild(titleGroup);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'row-actions';

    if (isJwt) {
      const jwtBtn = document.createElement('button');
      jwtBtn.className = 'row-btn btn-accent';
      jwtBtn.textContent = 'JWT';
      jwtBtn.title = 'Decode JWT Claims';
      jwtBtn.setAttribute('aria-label', `Decode JWT token stored at ${key}`);
      jwtBtn.addEventListener('click', () => openJwtModal(valStr));
      actions.appendChild(jwtBtn);
    }

    if (isJson) {
      const jsonBtn = document.createElement('button');
      jsonBtn.className = 'row-btn btn-accent';
      jsonBtn.textContent = 'JSON';
      jsonBtn.title = 'View and format JSON';
      jsonBtn.setAttribute('aria-label', `View JSON at ${key}`);
      jsonBtn.addEventListener('click', () => openStorageModal(type, key, valStr, true));
      actions.appendChild(jsonBtn);
    }

    const copyBtn = document.createElement('button');
    copyBtn.className = 'row-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.title = 'Copy value';
    copyBtn.setAttribute('aria-label', `Copy value of ${key}`);
    copyBtn.addEventListener('click', () => copyTextToClipboard(valStr, `Copied "${key}"`));

    const editBtn = document.createElement('button');
    editBtn.className = 'row-btn';
    editBtn.textContent = 'Edit';
    editBtn.title = 'Edit item';
    editBtn.setAttribute('aria-label', `Edit ${key}`);
    editBtn.addEventListener('click', () => openStorageModal(type, key, valStr, false));

    const delBtn = document.createElement('button');
    delBtn.className = 'row-btn btn-del';
    delBtn.textContent = '✕';
    delBtn.title = 'Delete item';
    delBtn.setAttribute('aria-label', `Delete ${key}`);
    delBtn.addEventListener('click', () => deleteStorageItem(type, key));

    actions.appendChild(copyBtn);
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    header.appendChild(actions);
    row.appendChild(header);

    // Tags
    const tags = document.createElement('div');
    tags.className = 'meta-tags';
    const sizeTag = document.createElement('span');
    sizeTag.className = 'tag';
    sizeTag.textContent = sizeStr;
    tags.appendChild(sizeTag);

    if (isJwt) {
      const jwtTag = document.createElement('span');
      jwtTag.className = 'tag tag-highlight';
      jwtTag.textContent = 'JWT Token';
      tags.appendChild(jwtTag);
    }
    if (isJson) {
      const jsonTag = document.createElement('span');
      jsonTag.className = 'tag tag-highlight';
      jsonTag.textContent = 'JSON';
      tags.appendChild(jsonTag);
    }
    row.appendChild(tags);

    // Value preview (optionally masked until revealed)
    const valPreview = document.createElement('div');
    let isMasked = blur && valStr.length > 0;
    valPreview.className = 'row-val-preview' + (isMasked ? ' masked' : '');
    valPreview.textContent = formatStoragePreview(valStr, sizeStr, false, isMasked);
    valPreview.title = isMasked
      ? 'Click to reveal, then click again to expand'
      : 'Click to toggle preview size (or click Copy/Edit for full text)';

    valPreview.addEventListener('click', () => {
      if (isMasked) {
        isMasked = false;
        valPreview.classList.remove('masked');
        valPreview.textContent = formatStoragePreview(valStr, sizeStr, valPreview.classList.contains('expanded'), false);
        return;
      }
      valPreview.classList.toggle('expanded');
      const isExpanded = valPreview.classList.contains('expanded');
      valPreview.textContent = formatStoragePreview(valStr, sizeStr, isExpanded, false);
    });
    row.appendChild(valPreview);

    fragment.appendChild(row);
  });

  container.appendChild(fragment);
}

export async function deleteStorageItem(type, key) {
  if (!ensureTargetReady('Deleting a storage item')) return;
  try {
    await browserAPI.scripting.executeScript({
      target: { tabId: state.activeTab.id },
      func: (storageType, k) => {
        const store = storageType === 'sessionStorage' ? window.sessionStorage : window.localStorage;
        store.removeItem(k);
      },
      args: [type, key]
    });

    showToast(`Deleted "${key}"`, 'info');
    await refresh();
  } catch (err) {
    showToast('Failed to delete storage item: ' + err.message, 'error');
  }
}

export function clearStorageType(type) {
  if (!ensureTargetReady('Clearing storage')) return;
  const label = type === 'localStorage' ? 'LocalStorage' : 'SessionStorage';

  openConfirmModal(
    `Clear ${label}`,
    `Clear all ${label} keys for this page origin?`,
    async () => {
      try {
        await browserAPI.scripting.executeScript({
          target: { tabId: state.activeTab.id },
          func: (storageType) => {
            const store = storageType === 'sessionStorage' ? window.sessionStorage : window.localStorage;
            store.clear();
          },
          args: [type]
        });

        showToast(`Cleared ${label}`, 'success');
        await refresh();
      } catch (err) {
        showToast(`Failed to clear ${label}: ` + err.message, 'error');
      }
    }
  );
}

export function bindStorageEvents() {
  if (dom.localSearchInput) {
    dom.localSearchInput.addEventListener('input', debounce(e => {
      state.filters.local = e.target.value;
      if (dom.clearLocalSearchBtn) dom.clearLocalSearchBtn.classList.toggle('hidden', !e.target.value);
      renderLocalStorageList();
    }, 150));
  }

  if (dom.clearLocalSearchBtn) {
    dom.clearLocalSearchBtn.addEventListener('click', () => {
      dom.localSearchInput.value = '';
      state.filters.local = '';
      dom.clearLocalSearchBtn.classList.add('hidden');
      renderLocalStorageList();
      dom.localSearchInput.focus();
    });
  }

  if (dom.sessionSearchInput) {
    dom.sessionSearchInput.addEventListener('input', debounce(e => {
      state.filters.session = e.target.value;
      if (dom.clearSessionSearchBtn) dom.clearSessionSearchBtn.classList.toggle('hidden', !e.target.value);
      renderSessionStorageList();
    }, 150));
  }

  if (dom.clearSessionSearchBtn) {
    dom.clearSessionSearchBtn.addEventListener('click', () => {
      dom.sessionSearchInput.value = '';
      state.filters.session = '';
      dom.clearSessionSearchBtn.classList.add('hidden');
      renderSessionStorageList();
      dom.sessionSearchInput.focus();
    });
  }

  if (dom.addLocalBtn) {
    dom.addLocalBtn.addEventListener('click', () => {
      if (!ensureTargetReady('Adding a key')) return;
      openStorageModal('localStorage');
    });
  }
  if (dom.addSessionBtn) {
    dom.addSessionBtn.addEventListener('click', () => {
      if (!ensureTargetReady('Adding a key')) return;
      openStorageModal('sessionStorage');
    });
  }

  if (dom.copyAllLocalBtn) {
    dom.copyAllLocalBtn.addEventListener('click', () => {
      if (!Object.keys(state.localStorageData).length) {
        showToast('localStorage is empty.', 'info');
        return;
      }
      copyTextToClipboard(JSON.stringify(state.localStorageData, null, 2), 'LocalStorage copied as JSON');
    });
  }
  if (dom.copyAllSessionBtn) {
    dom.copyAllSessionBtn.addEventListener('click', () => {
      if (!Object.keys(state.sessionStorageData).length) {
        showToast('sessionStorage is empty.', 'info');
        return;
      }
      copyTextToClipboard(JSON.stringify(state.sessionStorageData, null, 2), 'SessionStorage copied as JSON');
    });
  }

  if (dom.clearAllLocalBtn) dom.clearAllLocalBtn.addEventListener('click', () => clearStorageType('localStorage'));
  if (dom.clearAllSessionBtn) dom.clearAllSessionBtn.addEventListener('click', () => clearStorageType('sessionStorage'));
}
