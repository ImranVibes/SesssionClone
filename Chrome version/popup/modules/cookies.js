/**
 * SessionClone - Cookies tab
 * Fetches, renders and edits the cookies of the active target tab.
 */

import {
  browserAPI, state, dom, showToast, escapeHtml, copyTextToClipboard,
  refresh, runBulk, reportBulk, debounce, openConfirmModal
} from './core.js';
import { ensureTargetReady } from './tab.js';
import { openCookieModal } from './modals.js';

export async function fetchCookies() {
  if (!state.activeTab || !state.activeTab.url || state.activeTab.isRestricted) return;

  try {
    const filter = { url: state.activeTab.url };
    if (state.activeTab.cookieStoreId) {
      filter.storeId = state.activeTab.cookieStoreId;
    }
    let urlCookies = [];
    try {
      urlCookies = await browserAPI.cookies.getAll(filter);
    } catch (e) {
      urlCookies = await browserAPI.cookies.getAll({ url: state.activeTab.url });
    }

    let domainCookies = [];
    if (state.activeTab.domain) {
      try {
        const domainFilter = { domain: state.activeTab.domain };
        if (state.activeTab.cookieStoreId) {
          domainFilter.storeId = state.activeTab.cookieStoreId;
        }
        domainCookies = await browserAPI.cookies.getAll(domainFilter);
      } catch (e) {
        try {
          domainCookies = await browserAPI.cookies.getAll({ domain: state.activeTab.domain });
        } catch (e2) {}
      }
    }

    const cookieMap = new Map();
    [...urlCookies, ...domainCookies].forEach(c => {
      const key = `${c.name}#${c.domain}#${c.path}#${c.storeId || ''}`;
      cookieMap.set(key, c);
    });

    state.cookies = Array.from(cookieMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    renderCookiesList();
  } catch (err) {
    console.error('[SessionClone] Error fetching cookies:', err);
    showToast('Failed to fetch cookies: ' + err.message, 'error');
  }
}

function valueMask() {
  return '••••••••••••';
}

export function renderCookiesList() {
  const container = dom.cookiesListContainer;
  if (!container) return;
  container.textContent = '';

  const blur = Boolean(state.settings.blurValues);
  const filter = state.filters.cookies.toLowerCase().trim();
  const filtered = state.cookies.filter(c => {
    if (!filter) return true;
    return (
      (c.name && c.name.toLowerCase().includes(filter)) ||
      (c.value && c.value.toLowerCase().includes(filter)) ||
      (c.domain && c.domain.toLowerCase().includes(filter))
    );
  });

  if (filtered.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    const title = document.createElement('span');
    title.className = 'empty-title';
    title.textContent = state.cookies.length === 0 ? 'No cookies found' : 'No matching cookies';
    const desc = document.createElement('span');
    desc.className = 'empty-desc';
    desc.textContent = state.cookies.length === 0 ? 'This site has not stored any HTTP cookies.' : 'Try adjusting your search filter.';
    emptyState.appendChild(title);
    emptyState.appendChild(desc);
    container.appendChild(emptyState);
    return;
  }

  const fragment = document.createDocumentFragment();

  filtered.forEach(cookie => {
    const row = document.createElement('div');
    row.className = 'data-row';

    let expText = 'Session';
    let isExp = false;
    if (cookie.expirationDate) {
      const d = new Date(cookie.expirationDate * 1000);
      isExp = d.getTime() < Date.now();
      expText = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
    }

    const sizeStr = CookieUtils.getCookieSize(cookie);

    // Header
    const header = document.createElement('div');
    header.className = 'row-header';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'row-title-group';

    const nameEl = document.createElement('span');
    nameEl.className = 'row-key-name';
    nameEl.textContent = cookie.name;
    nameEl.title = 'Click to copy value';
    nameEl.addEventListener('click', () => copyTextToClipboard(cookie.value, `Copied "${cookie.name}"`));
    titleGroup.appendChild(nameEl);
    header.appendChild(titleGroup);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'row-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'row-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.title = 'Copy value';
    copyBtn.setAttribute('aria-label', `Copy value of cookie ${cookie.name}`);
    copyBtn.addEventListener('click', () => copyTextToClipboard(cookie.value, `Copied "${cookie.name}"`));

    const editBtn = document.createElement('button');
    editBtn.className = 'row-btn';
    editBtn.textContent = 'Edit';
    editBtn.title = 'Edit cookie';
    editBtn.setAttribute('aria-label', `Edit cookie ${cookie.name}`);
    editBtn.addEventListener('click', () => openCookieModal(cookie));

    const delBtn = document.createElement('button');
    delBtn.className = 'row-btn btn-del';
    delBtn.textContent = '✕';
    delBtn.title = 'Delete cookie';
    delBtn.setAttribute('aria-label', `Delete cookie ${cookie.name}`);
    delBtn.addEventListener('click', () => deleteSingleCookie(cookie));

    actions.appendChild(copyBtn);
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    header.appendChild(actions);
    row.appendChild(header);

    // Metadata tags
    const tags = document.createElement('div');
    tags.className = 'meta-tags';

    const addTag = (text, title, extraClass = '') => {
      const span = document.createElement('span');
      span.className = 'tag' + (extraClass ? ` ${extraClass}` : '');
      if (title) span.title = title;
      span.textContent = text;
      tags.appendChild(span);
    };

    addTag(cookie.domain || '', 'Domain');
    addTag(cookie.path || '/', 'Path');
    if (cookie.httpOnly) addTag('httpOnly', 'HttpOnly', 'tag-highlight');
    if (cookie.secure) addTag('secure', 'Secure', 'tag-highlight');
    if (cookie.sameSite && cookie.sameSite !== 'unspecified') addTag(cookie.sameSite, 'SameSite');
    addTag(expText, 'Expiration', cookie.session ? 'tag-green' : (isExp ? 'tag-rose' : 'tag-amber'));
    addTag(sizeStr, 'Size');

    row.appendChild(tags);

    // Value preview (optionally masked until revealed)
    const valPreview = document.createElement('div');
    valPreview.className = 'row-val-preview' + (blur ? ' masked' : '');
    valPreview.textContent = (blur && cookie.value) ? valueMask() : (cookie.value || '<empty>');
    valPreview.dataset.real = cookie.value || '';
    valPreview.title = blur ? 'Click to reveal, then click again to expand' : 'Click to toggle preview size';
    valPreview.addEventListener('click', () => {
      if (valPreview.classList.contains('masked')) {
        valPreview.classList.remove('masked');
        valPreview.textContent = valPreview.dataset.real || '<empty>';
        return;
      }
      valPreview.classList.toggle('expanded');
    });
    row.appendChild(valPreview);

    fragment.appendChild(row);
  });

  container.appendChild(fragment);
}

export async function deleteSingleCookie(cookie) {
  if (!ensureTargetReady('Deleting a cookie')) return;
  try {
    const url = CookieUtils.getCookieUrl(cookie, state.activeTab.url);
    const storeId = cookie.storeId || (state.activeTab && state.activeTab.cookieStoreId) || undefined;
    const removeDetails = { url, name: cookie.name };
    if (storeId) removeDetails.storeId = storeId;
    await browserAPI.cookies.remove(removeDetails);
    showToast(`Deleted "${cookie.name}"`, 'info');
    await refresh();
  } catch (err) {
    showToast('Failed to delete cookie: ' + err.message, 'error');
  }
}

export function clearAllDomainCookies() {
  if (!ensureTargetReady('Clearing cookies')) return;
  const count = state.cookies.length;
  if (count === 0) {
    showToast('There are no cookies to delete on this site.', 'info');
    return;
  }

  openConfirmModal(
    'Delete All Cookies',
    `Delete all ${count} cookies for ${state.activeTab.domain}?`,
    async () => {
      const result = await runBulk(
        state.cookies,
        async c => {
          const url = CookieUtils.getCookieUrl(c, state.activeTab.url);
          const storeId = c.storeId || (state.activeTab && state.activeTab.cookieStoreId) || undefined;
          const removeDetails = { url, name: c.name };
          if (storeId) removeDetails.storeId = storeId;
          const removed = await browserAPI.cookies.remove(removeDetails);
          if (!removed) throw new Error(`could not remove ${c.name}`);
        },
        'cookie delete'
      );
      reportBulk('Deleted cookies', result);
      await refresh();
    }
  );
}

export function bindCookiesEvents() {
  if (dom.cookieSearchInput) {
    dom.cookieSearchInput.addEventListener('input', debounce(e => {
      state.filters.cookies = e.target.value;
      if (dom.clearCookieSearchBtn) dom.clearCookieSearchBtn.classList.toggle('hidden', !e.target.value);
      renderCookiesList();
    }, 150));
  }

  if (dom.clearCookieSearchBtn) {
    dom.clearCookieSearchBtn.addEventListener('click', () => {
      dom.cookieSearchInput.value = '';
      state.filters.cookies = '';
      dom.clearCookieSearchBtn.classList.add('hidden');
      renderCookiesList();
      dom.cookieSearchInput.focus();
    });
  }

  if (dom.addCookieBtn) {
    dom.addCookieBtn.addEventListener('click', () => {
      if (!ensureTargetReady('Adding a cookie')) return;
      openCookieModal(null);
    });
  }

  if (dom.copyAllCookiesBtn) {
    dom.copyAllCookiesBtn.addEventListener('click', () => {
      if (!state.cookies.length) {
        showToast('No cookies to copy.', 'info');
        return;
      }
      const headerStr = CookieUtils.exportToHeaderString(state.cookies, true);
      copyTextToClipboard(headerStr, 'All cookies copied as HTTP header');
    });
  }

  if (dom.clearAllCookiesBtn) dom.clearAllCookiesBtn.addEventListener('click', clearAllDomainCookies);
}
