/**
 * SessionClone - Transfer engine (export / import / quick paste / purge)
 * Ports sessions between browsers in every format our parser understands,
 * and always reports what actually happened.
 */

import {
  browserAPI, state, dom, showToast, openModal, closeModal, openConfirmModal,
  refresh, runBulk, ensureClipboardPermission, requestAutoReload,
  downloadTextFile, copyTextToClipboard
} from './core.js';
import { ensureTargetReady } from './tab.js';
import { saveSettings } from './settings.js';

/* ==========================================================================
   EXPORT
   ========================================================================== */

export function generateSessionBundle() {
  return {
    type: 'SessionCloneBundle',
    version: '1.0',
    exportedAt: new Date().toISOString(),
    url: state.activeTab ? state.activeTab.url : '',
    domain: state.activeTab ? state.activeTab.domain : '',
    cookies: state.cookies,
    localStorage: state.localStorageData,
    sessionStorage: state.sessionStorageData
  };
}

export async function getExportString() {
  let payload = '';
  const format = state.exportFormat;

  if (format === 'bundle') {
    payload = JSON.stringify(generateSessionBundle(), null, 2);
  } else if (format === 'cookie_editor') {
    payload = JSON.stringify(state.cookies, null, 2);
  } else if (format === 'netscape') {
    payload = CookieUtils.exportToNetscape(state.cookies);
  } else if (format === 'header') {
    payload = CookieUtils.exportToHeaderString(state.cookies, true);
  }

  // Optional, off by default: the user chooses to protect an export.
  if (state.isEncryptedExport) {
    const password = dom.exportPasswordInput.value;
    if (!password) {
      throw new Error('Please set an encryption password.');
    }
    payload = await SessionCrypto.encrypt(payload, password);
  }

  return payload;
}

export async function handleQuickClone() {
  if (!state.activeTab || !state.activeTab.url || state.activeTab.isRestricted) {
    showToast('Open a website tab to clone its session.', 'warning');
    return;
  }
  try {
    const bundle = JSON.stringify(generateSessionBundle(), null, 2);
    await copyTextToClipboard(bundle, 'Session bundle copied - paste it in the other browser');
  } catch (err) {
    showToast('Quick Clone failed: ' + err.message, 'error');
  }
}

export async function handleExportCopy() {
  try {
    const data = await getExportString();
    await copyTextToClipboard(data, `Copied ${state.exportFormat.toUpperCase()} export`);
  } catch (err) {
    showToast('Export failed: ' + err.message, 'error');
  }
}

export async function handleExportDownload() {
  try {
    const data = await getExportString();
    const domain = (state.activeTab && state.activeTab.domain) || 'session';
    const isEnc = state.isEncryptedExport;
    let filename = '';
    let mimeType = 'application/json';

    if (state.exportFormat === 'bundle') {
      filename = `${domain}_session${isEnc ? '.enc' : ''}.sessionclone.json`;
    } else if (state.exportFormat === 'cookie_editor') {
      filename = `${domain}_cookies${isEnc ? '.enc' : ''}.json`;
    } else if (state.exportFormat === 'netscape') {
      filename = `${domain}_cookies${isEnc ? '.enc' : ''}.txt`;
      mimeType = 'text/plain';
    } else if (state.exportFormat === 'header') {
      filename = `${domain}_cookie_header${isEnc ? '.enc' : ''}.txt`;
      mimeType = 'text/plain';
    }

    downloadTextFile(data, filename, mimeType);
    showToast(`Downloaded ${filename}`, 'success');
  } catch (err) {
    showToast('Download failed: ' + err.message, 'error');
  }
}

/* ==========================================================================
   IMPORT DETECTION
   ========================================================================== */

const FORMAT_LABELS = {
  encrypted: '🔒 AES-256 Encrypted',
  bundle: '✨ Universal Bundle',
  cookie_editor: '✨ Cookie Array (JSON)',
  netscape: '✨ Netscape cookies.txt',
  header: '✨ Cookie Header',
  json_storage: '✨ Key-Value Storage JSON',
  empty: 'Waiting for content',
  unknown: '❓ Unrecognized'
};

export function handleImportTextChange() {
  const raw = dom.importTextarea.value.trim();
  if (!raw) {
    dom.detectedFormatBadge.classList.add('hidden');
    return;
  }
  const fmt = CookieUtils.detectFormat(raw);
  dom.detectedFormatBadge.classList.remove('hidden');
  dom.detectedFormatBadge.textContent = FORMAT_LABELS[fmt] || 'Detected';
}

export function updateQuickPasteBadge() {
  const raw = dom.modalQuickPasteTextarea.value.trim();
  const fmt = CookieUtils.detectFormat(raw);
  dom.quickPasteDetectedBadge.textContent = FORMAT_LABELS[fmt] || 'Auto-Detecting';
}

export function readFileIntoImport(file) {
  const reader = new FileReader();
  reader.onload = e => {
    dom.importTextarea.value = e.target.result;
    handleImportTextChange();
    showToast(`Loaded ${file.name}`, 'info');
  };
  reader.onerror = () => showToast(`Could not read ${file.name}`, 'error');
  reader.readAsText(file);
}

/* ==========================================================================
   INJECTION
   ========================================================================== */

/** Clears and writes localStorage/sessionStorage inside the target tab. */
export async function injectStorageIntoPage(localObj, sessionObj, wipe) {
  const [res] = await browserAPI.scripting.executeScript({
    target: { tabId: state.activeTab.id },
    func: (lData, sData, doWipe) => {
      let lInjected = 0;
      let sInjected = 0;
      if (doWipe) {
        try { window.localStorage.clear(); } catch (e) {}
        try { window.sessionStorage.clear(); } catch (e) {}
      }
      if (lData) {
        for (const [k, v] of Object.entries(lData)) {
          try {
            window.localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
            lInjected++;
          } catch (e) {}
        }
      }
      if (sData) {
        for (const [k, v] of Object.entries(sData)) {
          try {
            window.sessionStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
            sInjected++;
          } catch (e) {}
        }
      }
      return { lInjected, sInjected };
    },
    args: [localObj || {}, sessionObj || {}, Boolean(wipe)]
  });

  return res && res.result ? res.result : { lInjected: 0, sInjected: 0 };
}

/** Removes every cookie currently stored for the active domain. */
export async function wipeCurrentDomainCookies() {
  return runBulk(
    state.cookies,
    async c => {
      const url = CookieUtils.getCookieUrl(c, state.activeTab.url);
      const storeId = c.storeId || (state.activeTab && state.activeTab.cookieStoreId) || undefined;
      const removeDetails = { url, name: c.name };
      if (storeId) removeDetails.storeId = storeId;
      const removed = await browserAPI.cookies.remove(removeDetails);
      if (!removed) throw new Error(`could not remove ${c.name}`);
    },
    'cookie wipe'
  );
}

async function injectCookieList(cookies) {
  return runBulk(
    cookies,
    async c => {
      const sanitized = CookieUtils.sanitizeCookieForSet(c, state.activeTab.url);
      if (!sanitized.storeId && state.activeTab && state.activeTab.cookieStoreId) {
        sanitized.storeId = state.activeTab.cookieStoreId;
      }
      const set = await browserAPI.cookies.set(sanitized);
      if (!set) throw new Error(`rejected: ${c.name}`);
    },
    'cookie import'
  );
}

export async function executeUniversalImport() {
  const raw = dom.importTextarea.value.trim();
  if (!raw) {
    showToast('Please paste session data or choose a file.', 'warning');
    return;
  }

  if (SessionCrypto.isEncrypted(raw)) {
    state.pendingImportPayload = raw;
    dom.decryptPasswordInput.value = '';
    openModal(dom.decryptModal);
    return;
  }

  await processDecryptedImport(raw);
}

export async function handleDecryptAndImport() {
  const password = dom.decryptPasswordInput.value;
  if (!password) {
    showToast('Please enter password.', 'warning');
    return;
  }
  if (!state.pendingImportPayload) {
    showToast('Nothing to decrypt.', 'warning');
    closeModal(dom.decryptModal);
    return;
  }

  try {
    const decrypted = await SessionCrypto.decrypt(state.pendingImportPayload, password);
    closeModal(dom.decryptModal);
    state.pendingImportPayload = null;
    showToast('Session decrypted successfully', 'success');
    await processDecryptedImport(decrypted);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

/**
 * Parses any supported payload and ports it into the active tab.
 * Warns first when the payload clearly belongs to a different site.
 */
export async function processDecryptedImport(payloadText) {
  if (!ensureTargetReady('Importing a session')) return;

  const parsedData = CookieUtils.parseUniversalPayload(payloadText, state.activeTab.domain || '');

  if (parsedData.format === 'unknown' || parsedData.format === 'empty') {
    showToast('Could not parse input. Unsupported format.', 'error');
    return;
  }
  if (parsedData.format === 'encrypted') {
    state.pendingImportPayload = payloadText;
    dom.decryptPasswordInput.value = '';
    openModal(dom.decryptModal);
    return;
  }

  const mismatch = CookieUtils.checkDomainMismatch(state.activeTab.domain, parsedData.cookies);
  if (mismatch.mismatch) {
    const list = mismatch.imported.slice(0, 4).join(', ') + (mismatch.imported.length > 4 ? '…' : '');
    openConfirmModal(
      'Different site detected',
      `This session belongs to ${list}, but the active tab is ${mismatch.active}. ` +
      'Injecting it here will not log you in and may overwrite local data. Continue anyway?',
      () => runImport(parsedData)
    );
    return;
  }

  await runImport(parsedData);
}

async function runImport(parsedData) {
  const clearFirst = Boolean(dom.clearBeforeImportCheckbox
    ? dom.clearBeforeImportCheckbox.checked
    : state.settings.wipeBeforeImport);

  try {
    // 1. Optional clean switch
    let wiped = 0;
    if (clearFirst) {
      const wipeResult = await wipeCurrentDomainCookies();
      wiped = wipeResult.ok;
      if (wipeResult.fail > 0) {
        console.warn(`[SessionClone] ${wipeResult.fail} old cookies could not be removed`);
      }
    }

    // 2. Cookies
    let cookieResult = { ok: 0, fail: 0, lastError: null };
    if (parsedData.cookies && parsedData.cookies.length > 0) {
      cookieResult = await injectCookieList(parsedData.cookies);
    }

    // 3. Storage
    let localCount = 0;
    let sessionCount = 0;
    const hasLocal = parsedData.localStorage && Object.keys(parsedData.localStorage).length > 0;
    const hasSession = parsedData.sessionStorage && Object.keys(parsedData.sessionStorage).length > 0;

    if ((hasLocal || hasSession || clearFirst) && state.activeTab.id) {
      try {
        const counts = await injectStorageIntoPage(parsedData.localStorage, parsedData.sessionStorage, clearFirst);
        localCount = counts.lInjected;
        sessionCount = counts.sInjected;
      } catch (e) {
        console.warn('[SessionClone] Storage injection failed:', e);
        showToast('Storage injection failed: ' + (e.message || ''), 'error');
      }
    }

    // 4. Honest summary
    const parts = [`${cookieResult.ok} cookies`];
    if (localCount) parts.push(`${localCount} local keys`);
    if (sessionCount) parts.push(`${sessionCount} session keys`);

    if (cookieResult.fail > 0) {
      const detail = cookieResult.lastError ? ` (${cookieResult.lastError.message})` : '';
      showToast(`Imported ${parts.join(', ')} - ${cookieResult.fail} cookies failed${detail}`, 'warning');
    } else if (cookieResult.ok === 0 && localCount === 0 && sessionCount === 0) {
      showToast('Nothing was imported - the payload had no usable data.', 'warning');
    } else {
      showToast(`Imported ${parts.join(', ')}${clearFirst ? ` (replaced ${wiped} old cookies)` : ''}`, 'success');
    }

    if (dom.importTextarea) dom.importTextarea.value = '';
    if (dom.detectedFormatBadge) dom.detectedFormatBadge.classList.add('hidden');
    if (dom.quickPasteModal) closeModal(dom.quickPasteModal);

    await refresh();
    requestAutoReload('import');
  } catch (err) {
    console.error('[SessionClone] Import failed:', err);
    showToast('Import failed: ' + (err.message || ''), 'error');
  }
}

/* ==========================================================================
   QUICK PASTE (1-click)
   ========================================================================== */

export async function handleQuickPaste() {
  if (!ensureTargetReady('Quick Paste')) return;

  try {
    let clipText = '';
    const allowed = await ensureClipboardPermission();
    if (allowed && navigator.clipboard && navigator.clipboard.readText) {
      try {
        clipText = await navigator.clipboard.readText();
      } catch (e) {
        console.warn('[SessionClone] Clipboard read denied', e);
      }
    }

    if (clipText && clipText.trim().length > 0) {
      const detected = CookieUtils.detectFormat(clipText);
      if (detected !== 'unknown' && detected !== 'empty') {
        if (SessionCrypto.isEncrypted(clipText)) {
          state.pendingImportPayload = clipText;
          dom.decryptPasswordInput.value = '';
          openModal(dom.decryptModal);
          return;
        }
        await processDecryptedImport(clipText);
        return;
      }
    }

    // Nothing usable in the clipboard: fall back to the paste dialog
    dom.modalQuickPasteTextarea.value = clipText || '';
    updateQuickPasteBadge();
    openModal(dom.quickPasteModal);
    dom.modalQuickPasteTextarea.focus();
  } catch (err) {
    console.warn('[SessionClone] Quick paste failed', err);
    openModal(dom.quickPasteModal);
  }
}

/* ==========================================================================
   ZERO-TRACE PURGE
   ========================================================================== */

export function executeZeroTracePurge() {
  if (!ensureTargetReady('Purging site data')) return;

  const deep = Boolean(state.settings.deepPurge);
  openConfirmModal(
    'Site Data Purge',
    deep
      ? `Erase ALL traces (cookies, localStorage, sessionStorage, IndexedDB, caches & service workers) for ${state.activeTab.domain}?`
      : `Erase cookies, localStorage and sessionStorage for ${state.activeTab.domain}?`,
    async () => {
      try {
        const wipeResult = await wipeCurrentDomainCookies();

        let report = { indexedDb: 0, caches: 0, workers: 0 };
        if (state.activeTab.id && !state.activeTab.isRestricted) {
          try {
            const [res] = await browserAPI.scripting.executeScript({
              target: { tabId: state.activeTab.id },
              func: async (deepPurge) => {
                const out = { indexedDb: 0, caches: 0, workers: 0 };
                try {
                  window.localStorage.clear();
                  window.sessionStorage.clear();
                } catch (e) {}
                if (!deepPurge) return out;

                try {
                  if (window.indexedDB && window.indexedDB.databases) {
                    const dbs = await window.indexedDB.databases();
                    for (const db of dbs) {
                      if (db.name) {
                        window.indexedDB.deleteDatabase(db.name);
                        out.indexedDb++;
                      }
                    }
                  }
                } catch (e) {}

                try {
                  if (window.caches && window.caches.keys) {
                    const keys = await window.caches.keys();
                    for (const k of keys) {
                      await window.caches.delete(k);
                      out.caches++;
                    }
                  }
                } catch (e) {}

                try {
                  if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
                    const regs = await navigator.serviceWorker.getRegistrations();
                    for (const r of regs) {
                      await r.unregister();
                      out.workers++;
                    }
                  }
                } catch (e) {}

                return out;
              },
              args: [deep]
            });
            if (res && res.result) report = res.result;
          } catch (e) {
            console.warn('[SessionClone] Deep purge step failed', e);
          }
        }

        let summary = `Purged ${wipeResult.ok} cookies, site storage`;
        if (deep) {
          summary += `, ${report.indexedDb} IndexedDB, ${report.caches} caches, ${report.workers} workers`;
        }
        if (wipeResult.fail > 0) {
          summary += ` - ${wipeResult.fail} cookies could not be removed`;
        }
        showToast(summary, wipeResult.fail > 0 ? 'warning' : 'success');

        await refresh();
        requestAutoReload('purge');
      } catch (err) {
        console.error('[SessionClone] Purge failed:', err);
        showToast('Purge failed: ' + (err.message || ''), 'error');
      }
    }
  );
}

/* ==========================================================================
   BINDINGS
   ========================================================================== */

export function bindTransferEvents() {
  // Export / Import sub-tabs
  dom.exportModeBtn.addEventListener('click', () => {
    dom.exportModeBtn.classList.add('active');
    dom.exportModeBtn.setAttribute('aria-selected', 'true');
    dom.importModeBtn.classList.remove('active');
    dom.importModeBtn.setAttribute('aria-selected', 'false');
    dom.exportViewSection.classList.remove('hidden');
    dom.importViewSection.classList.add('hidden');
  });
  dom.importModeBtn.addEventListener('click', () => {
    dom.importModeBtn.classList.add('active');
    dom.importModeBtn.setAttribute('aria-selected', 'true');
    dom.exportModeBtn.classList.remove('active');
    dom.exportModeBtn.setAttribute('aria-selected', 'false');
    dom.importViewSection.classList.remove('hidden');
    dom.exportViewSection.classList.add('hidden');
  });

  // Export format cards
  dom.formatOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      dom.formatOptions.forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      const radio = opt.querySelector('input[type="radio"]');
      if (radio) {
        radio.checked = true;
        state.exportFormat = radio.value;
      }
    });
  });

  // Optional encryption (advanced, off by default)
  dom.enableEncryptionCheckbox.addEventListener('change', e => {
    state.isEncryptedExport = e.target.checked;
    dom.encryptionPasswordFields.classList.toggle('hidden', !e.target.checked);
    if (e.target.checked) dom.exportPasswordInput.focus();
  });

  dom.toggleExportPasswordBtn.addEventListener('click', () => {
    const isPwd = dom.exportPasswordInput.type === 'password';
    dom.exportPasswordInput.type = isPwd ? 'text' : 'password';
    dom.toggleExportPasswordBtn.setAttribute('aria-pressed', String(isPwd));
  });

  dom.copyExportBtn.addEventListener('click', handleExportCopy);
  dom.downloadExportBtn.addEventListener('click', handleExportDownload);

  // Import textarea & helpers
  dom.importTextarea.addEventListener('input', handleImportTextChange);

  dom.pasteFromClipboardBtn.addEventListener('click', async () => {
    try {
      const allowed = await ensureClipboardPermission();
      if (!allowed) {
        showToast('Clipboard permission was not granted.', 'warning');
        return;
      }
      const txt = await navigator.clipboard.readText();
      dom.importTextarea.value = txt;
      handleImportTextChange();
      showToast('Pasted from clipboard', 'info');
    } catch (e) {
      showToast('Clipboard access denied or unavailable', 'warning');
    }
  });

  dom.importDropzone.addEventListener('dragover', e => {
    e.preventDefault();
    dom.importTextarea.classList.add('dragover');
  });
  dom.importDropzone.addEventListener('dragleave', () => {
    dom.importTextarea.classList.remove('dragover');
  });
  dom.importDropzone.addEventListener('drop', e => {
    e.preventDefault();
    dom.importTextarea.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      readFileIntoImport(e.dataTransfer.files[0]);
    }
  });

  dom.importFileInput.addEventListener('change', e => {
    if (e.target.files && e.target.files.length > 0) {
      readFileIntoImport(e.target.files[0]);
    }
  });

  if (dom.clearBeforeImportCheckbox) {
    dom.clearBeforeImportCheckbox.checked = state.settings.wipeBeforeImport;
    dom.clearBeforeImportCheckbox.addEventListener('change', e => {
      state.settings.wipeBeforeImport = e.target.checked;
      saveSettings();
    });
  }

  dom.executeImportBtn.addEventListener('click', executeUniversalImport);

  // Quick paste modal
  dom.modalQuickPasteTextarea.addEventListener('input', updateQuickPasteBadge);
  dom.modalQuickPasteInjectBtn.addEventListener('click', () => {
    const raw = dom.modalQuickPasteTextarea.value.trim();
    if (!raw) {
      showToast('Please enter session data to inject.', 'warning');
      return;
    }
    if (SessionCrypto.isEncrypted(raw)) {
      closeModal(dom.quickPasteModal);
      state.pendingImportPayload = raw;
      dom.decryptPasswordInput.value = '';
      openModal(dom.decryptModal);
      return;
    }
    processDecryptedImport(raw);
  });

  // Decrypt modal
  dom.toggleDecryptPasswordBtn.addEventListener('click', () => {
    const isPwd = dom.decryptPasswordInput.type === 'password';
    dom.decryptPasswordInput.type = isPwd ? 'text' : 'password';
    dom.toggleDecryptPasswordBtn.setAttribute('aria-pressed', String(isPwd));
  });
  dom.executeDecryptBtn.addEventListener('click', handleDecryptAndImport);
  dom.decryptPasswordInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleDecryptAndImport();
  });
}
