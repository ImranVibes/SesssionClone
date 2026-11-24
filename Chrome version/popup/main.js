/**
 * SessionClone - Popup entry point
 * Wires the feature modules together and boots the UI.
 */

import {
  cacheDomElements, bindModalChrome, bindReloadModal, hooks, viewMode, dom
} from './modules/core.js';
import * as settings from './modules/settings.js';
import * as tab from './modules/tab.js';
import * as modals from './modules/modals.js';
import * as cookies from './modules/cookies.js';
import * as storage from './modules/storage.js';
import * as transfer from './modules/transfer.js';
import * as vault from './modules/vault.js';

document.addEventListener('DOMContentLoaded', async () => {
  cacheDomElements();

  // Wire the data loaders so refresh() works from every module without cycles
  tab.wireDataLoaders({
    fetchCookies: cookies.fetchCookies,
    fetchStorage: storage.fetchStorage
  });
  hooks.refresh = tab.refreshAllData;

  // Full-tab view gets its own layout
  if (viewMode === 'tab') {
    document.documentElement.classList.add('tab-view');
  }

  await settings.loadSettings();

  bindModalChrome();
  bindReloadModal();
  modals.bindEditorModals();
  cookies.bindCookiesEvents();
  storage.bindStorageEvents();
  transfer.bindTransferEvents();
  vault.bindVaultEvents();
  settings.bindSettingsEvents({
    onRefreshChanged: () => {
      cookies.renderCookiesList();
      storage.renderLocalStorageList();
      storage.renderSessionStorageList();
    }
  });
  tab.bindHeaderActions({
    onClone: transfer.handleQuickClone,
    onPaste: transfer.handleQuickPaste,
    onWipe: transfer.executeZeroTracePurge,
    onOpenFullTab: tab.openFullTabView
  });

  await tab.initializeActiveTab();
  await vault.loadVaultProfiles();

  // First-run hint for the new reload behaviour
  if (dom.footerStatus) {
    dom.footerStatus.textContent = 'Ready';
  }
});
