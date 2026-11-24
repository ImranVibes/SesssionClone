/**
 * SessionClone - Editor modals (cookie / storage / JWT)
 * Modals only depend on core + the global engines; after a save they ask
 * core.refresh() (wired by main.js) to re-render the lists.
 */

import {
  browserAPI, state, dom, showToast, openModal, closeModal,
  refresh, runBulk, isJwtToken, isJsonObject, decodeJwtPart, copyTextToClipboard
} from './core.js';
import { ensureTargetReady } from './tab.js';

/* ==========================================================================
   COOKIE MODAL
   ========================================================================== */

export function openCookieModal(cookie = null) {
  if (cookie) {
    dom.cookieModalTitle.textContent = 'Edit Cookie';
    dom.modalCookieName.value = cookie.name || '';
    dom.modalCookieName.disabled = true;
    dom.modalCookieValue.value = cookie.value || '';
    dom.modalCookieDomain.value = cookie.domain || (state.activeTab && state.activeTab.domain) || '';
    dom.modalCookiePath.value = cookie.path || '/';
    dom.modalCookieSameSite.value = cookie.sameSite || 'unspecified';
    dom.modalCookieSecure.checked = Boolean(cookie.secure);
    dom.modalCookieHttpOnly.checked = Boolean(cookie.httpOnly);
    dom.modalCookieHostOnly.checked = Boolean(cookie.hostOnly);
    dom.modalCookieSession.checked = Boolean(cookie.session);

    if (cookie.expirationDate) {
      const d = new Date(cookie.expirationDate * 1000);
      const pad = n => String(n).padStart(2, '0');
      dom.modalCookieExpiration.value =
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } else {
      dom.modalCookieExpiration.value = '';
    }
  } else {
    dom.cookieModalTitle.textContent = 'New Cookie';
    dom.modalCookieName.value = '';
    dom.modalCookieName.disabled = false;
    dom.modalCookieValue.value = '';
    dom.modalCookieDomain.value = (state.activeTab && state.activeTab.domain) || '';
    dom.modalCookiePath.value = '/';
    dom.modalCookieSameSite.value = 'lax';
    dom.modalCookieSecure.checked = state.activeTab && state.activeTab.protocol === 'https:';
    dom.modalCookieHttpOnly.checked = false;
    dom.modalCookieHostOnly.checked = false;
    dom.modalCookieSession.checked = true;
    dom.modalCookieExpiration.value = '';
  }

  openModal(dom.cookieModal);
}

export async function saveCookieFromModal() {
  if (!ensureTargetReady('Saving a cookie')) return;

  const name = dom.modalCookieName.value.trim();
  if (!name) {
    showToast('Cookie name is required.', 'warning');
    return;
  }

  const value = dom.modalCookieValue.value;
  const domain = dom.modalCookieDomain.value.trim();
  const path = dom.modalCookiePath.value.trim() || '/';
  const sameSite = dom.modalCookieSameSite.value;
  const secure = dom.modalCookieSecure.checked;
  const httpOnly = dom.modalCookieHttpOnly.checked;
  const hostOnly = dom.modalCookieHostOnly.checked;
  const isSession = dom.modalCookieSession.checked;
  const expVal = dom.modalCookieExpiration.value;

  let expirationDate;
  if (!isSession && expVal) {
    const parsedTime = new Date(expVal).getTime();
    if (!isNaN(parsedTime)) {
      expirationDate = Math.floor(parsedTime / 1000);
    } else {
      showToast('Invalid expiration date.', 'warning');
      return;
    }
  }

  const storeId = (state.activeTab && state.activeTab.cookieStoreId) || undefined;
  const cookieObj = { name, value, domain, path, sameSite, secure, httpOnly, hostOnly, session: isSession, expirationDate, storeId };

  try {
    const sanitized = CookieUtils.sanitizeCookieForSet(cookieObj, state.activeTab.url);
    await browserAPI.cookies.set(sanitized);
    showToast(`Saved "${name}"`, 'success');
    closeModal(dom.cookieModal);
    await refresh();
  } catch (err) {
    showToast('Failed to save cookie: ' + err.message, 'error');
  }
}

/* ==========================================================================
   STORAGE MODAL
   ========================================================================== */

export function openStorageModal(type, key = '', val = '', prettyFormat = false) {
  dom.modalStorageType.value = type;
  dom.modalStorageOriginalKey.value = key;

  if (key) {
    dom.storageModalTitle.textContent = `Edit ${type === 'localStorage' ? 'LocalStorage' : 'SessionStorage'}`;
    dom.modalStorageKey.value = key;
    if (prettyFormat && isJsonObject(val)) {
      try {
        dom.modalStorageValue.value = JSON.stringify(JSON.parse(val), null, 2);
      } catch (e) {
        dom.modalStorageValue.value = val;
      }
    } else {
      dom.modalStorageValue.value = val;
    }
  } else {
    dom.storageModalTitle.textContent = `New ${type === 'localStorage' ? 'LocalStorage' : 'SessionStorage'} Key`;
    dom.modalStorageKey.value = '';
    dom.modalStorageValue.value = '';
  }

  openModal(dom.storageModal);
}

export async function saveStorageFromModal() {
  if (!ensureTargetReady('Saving a storage item')) return;

  const type = dom.modalStorageType.value;
  const origKey = dom.modalStorageOriginalKey.value;
  const newKey = dom.modalStorageKey.value.trim();
  const value = dom.modalStorageValue.value;

  if (!newKey) {
    showToast('Key name is required.', 'warning');
    return;
  }

  try {
    await browserAPI.scripting.executeScript({
      target: { tabId: state.activeTab.id },
      func: (storageType, oldK, newK, val) => {
        const store = storageType === 'sessionStorage' ? window.sessionStorage : window.localStorage;
        if (oldK && oldK !== newK) {
          store.removeItem(oldK);
        }
        store.setItem(newK, val);
      },
      args: [type, origKey, newKey, value]
    });

    showToast(`Saved "${newKey}"`, 'success');
    closeModal(dom.storageModal);
    await refresh();
  } catch (err) {
    showToast('Failed to save storage item: ' + err.message, 'error');
  }
}

/* ==========================================================================
   JWT INSPECTOR
   ========================================================================== */

export function openJwtModal(token) {
  if (!token || typeof token !== 'string') return;
  const parts = token.trim().split('.');
  if (parts.length < 2) return;

  try {
    const header = decodeJwtPart(parts[0]);
    const payload = decodeJwtPart(parts[1]);

    dom.jwtHeaderPre.textContent = JSON.stringify(header, null, 2);
    dom.jwtPayloadPre.textContent = JSON.stringify(payload, null, 2);
    dom.jwtAlgDisplay.textContent = header.alg || 'Unknown';

    if (payload.iat) {
      const d = new Date(payload.iat * 1000);
      dom.jwtIatDisplay.textContent = d.toLocaleString();
    } else {
      dom.jwtIatDisplay.textContent = 'None';
    }

    if (payload.exp) {
      const d = new Date(payload.exp * 1000);
      const isExp = d.getTime() < Date.now();
      dom.jwtExpDisplay.textContent = d.toLocaleString() + (isExp ? ' (Expired)' : ' (Active)');
      dom.jwtStatusBadge.textContent = isExp ? 'Expired' : 'Active';
      dom.jwtStatusBadge.className = isExp ? 'jwt-pill expired' : 'jwt-pill active';
    } else {
      dom.jwtExpDisplay.textContent = 'None';
      dom.jwtStatusBadge.textContent = 'Active';
      dom.jwtStatusBadge.className = 'jwt-pill active';
    }

    dom.copyRawJwtBtn.onclick = () => copyTextToClipboard(token, 'Raw JWT Token copied');
    dom.copyJwtHeaderBtn.onclick = () => copyTextToClipboard(JSON.stringify(header, null, 2), 'JWT Header copied');
    dom.copyJwtPayloadBtn.onclick = () => copyTextToClipboard(JSON.stringify(payload, null, 2), 'JWT Payload copied');

    openModal(dom.jwtModal);
  } catch (err) {
    showToast('Failed to decode JWT: ' + err.message, 'error');
  }
}

/* ==========================================================================
   BINDINGS
   ========================================================================== */

export function bindEditorModals() {
  if (dom.modalCookieSaveBtn) dom.modalCookieSaveBtn.addEventListener('click', saveCookieFromModal);

  if (dom.modalCookieSameSite) {
    dom.modalCookieSameSite.addEventListener('change', () => {
      if (dom.modalCookieSameSite.value === 'no_restriction') {
        dom.modalCookieSecure.checked = true;
      }
    });
  }

  if (dom.modalStorageSaveBtn) dom.modalStorageSaveBtn.addEventListener('click', saveStorageFromModal);

  if (dom.formatModalJsonBtn) {
    dom.formatModalJsonBtn.addEventListener('click', () => {
      const raw = dom.modalStorageValue.value.trim();
      try {
        const parsed = JSON.parse(raw);
        dom.modalStorageValue.value = JSON.stringify(parsed, null, 2);
        showToast('JSON Formatted', 'info');
      } catch (e) {
        showToast('Invalid JSON', 'warning');
      }
    });
  }
}

export { isJwtToken };
