/**
 * SessionClone - dev-only Chrome API mock for visual preview in a normal browser.
 * NOT shipped: scripts/build.js copies an explicit file list that excludes this.
 */
(function () {
  'use strict';

  const cookies = [
    { name: 'logged_in', value: 'yes', domain: '.github.com', path: '/', secure: true, httpOnly: true, sameSite: 'lax', session: false, expirationDate: Math.floor(Date.now() / 1000) + 86400 * 120 },
    { name: '_gh_sess', value: 'hGh0c2Vzc2lvbi1kYXRhLXZlcnkgbG9uZyB2YWx1ZSB0aGF0IHNoZXdzIGV4cGFuZGVk', domain: 'github.com', path: '/', secure: true, httpOnly: true, sameSite: 'unspecified', session: true },
    { name: 'user_session', value: 'abc123-def456-ghi789', domain: '.github.com', path: '/', secure: true, httpOnly: true, sameSite: 'lax', session: false, expirationDate: Math.floor(Date.now() / 1000) - 86400 },
    { name: 'csrf_token', value: 'd8e9f0a1b2c3d4e5f60718293a4b5c6d', domain: 'github.com', path: '/', secure: false, httpOnly: false, sameSite: 'strict', session: true },
    { name: 'tz', value: 'Asia/Dhaka', domain: '.github.com', path: '/', secure: false, httpOnly: false, sameSite: 'unspecified', session: false, expirationDate: Math.floor(Date.now() / 1000) + 86400 * 400 },
    { name: 'device_id', value: 'mock-device-id-9f8e7d', domain: '.github.com', path: '/', secure: true, httpOnly: false, sameSite: 'lax', session: false, expirationDate: Math.floor(Date.now() / 1000) + 86400 * 730 }
  ];

  const siteStore = {
    local: {
      'session_token': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6Ik1vY2sgVXNlciIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoyMDAwMDAwMDAwfQ.mock-signature',
      'user_preferences': '{"theme":"dark","language":"en","notifications":true}',
      'last_login': '2026-10-28T09:15:00.000Z',
      'onboarding_done': 'true',
      'draft_message': 'Hey, this is a long draft value that should be truncated in the preview row so the layout keeps looking tidy across the card.'
    },
    session: {
      'tab_state': '{"open_panel":"files","scroll":420}',
      'flow_id': 'flow_9a8b7c6d'
    }
  };

  const storageBacking = {};

  const tabs = [
    { id: 1, title: 'GitHub', url: 'https://github.com/settings/profile', active: true, windowId: 1 }
  ];

  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  const mock = {
    runtime: {
      getManifest: () => ({ version: '1.0.0', name: 'SessionClone' }),
      getURL: p => '/' + p,
      onInstalled: { addListener: () => {} },
      onMessage: { addListener: () => {} }
    },
    storage: {
      local: {
        get: async keys => {
          const out = {};
          const list = Array.isArray(keys) ? keys : Object.keys(keys || {});
          for (const k of list) if (k in storageBacking) out[k] = clone(storageBacking[k]);
          return out;
        },
        set: async obj => {
          for (const k of Object.keys(obj)) storageBacking[k] = clone(obj[k]);
          return undefined;
        },
        remove: async keys => {
          for (const k of (Array.isArray(keys) ? keys : [keys])) delete storageBacking[k];
        }
      }
    },
    tabs: {
      query: async () => tabs.map(t => ({ ...t })),
      get: async id => {
        const t = tabs.find(x => x.id === id);
        if (!t) throw new Error('No tab with id: ' + id);
        return { ...t };
      },
      reload: async id => console.log('[mock] tabs.reload', id),
      create: async ({ url }) => {
        console.log('[mock] tabs.create', url);
        return { id: 99, url };
      },
      onActivated: { addListener: () => {} },
      onUpdated: { addListener: () => {} },
      onRemoved: { addListener: () => {} }
    },
    cookies: {
      getAll: async () => clone(cookies),
      set: async c => {
        const idx = cookies.findIndex(x => x.name === c.name && x.domain === c.domain);
        const entry = { ...c, session: !c.expirationDate };
        if (idx >= 0) cookies[idx] = entry; else cookies.push(entry);
        return entry;
      },
      remove: async ({ name }) => {
        const idx = cookies.findIndex(x => x.name === name);
        if (idx >= 0) cookies.splice(idx, 1);
        return { name };
      },
      onChanged: { addListener: () => {} }
    },
    scripting: {
      executeScript: async ({ func, args = [] }) => {
        const src = typeof func === 'function' ? func.toString() : String(func);

        // Plain read (fetch storage)
        if (args.length === 0) {
          return [{ result: { local: clone(siteStore.local), session: clone(siteStore.session) } }];
        }

        if (src.includes('setItem') && args.length === 4) {
          const [type, oldK, newK, val] = args;
          const bag = type === 'sessionStorage' ? siteStore.session : siteStore.local;
          if (oldK && oldK !== newK) delete bag[oldK];
          bag[newK] = val;
          return [{ result: undefined }];
        }

        if (src.includes('setItem') && args.length === 3) {
          const [lData, sData, wipe] = args;
          if (wipe) {
            if (lData !== null && lData !== undefined) { for (const k of Object.keys(siteStore.local)) delete siteStore.local[k]; }
            if (sData !== null && sData !== undefined) { for (const k of Object.keys(siteStore.session)) delete siteStore.session[k]; }
          }
          let l = 0, s = 0;
          for (const [k, v] of Object.entries(lData || {})) { siteStore.local[k] = typeof v === 'string' ? v : JSON.stringify(v); l++; }
          for (const [k, v] of Object.entries(sData || {})) { siteStore.session[k] = typeof v === 'string' ? v : JSON.stringify(v); s++; }
          return [{ result: { lInjected: l, sInjected: s } }];
        }

        if (src.includes('removeItem') && args.length === 2) {
          const [type, key] = args;
          const bag = type === 'sessionStorage' ? siteStore.session : siteStore.local;
          delete bag[key];
          return [{ result: undefined }];
        }

        if (src.includes('clear') && args.length === 1) {
          const bag = args[0] === 'sessionStorage' ? siteStore.session : siteStore.local;
          for (const k of Object.keys(bag)) delete bag[k];
          return [{ result: undefined }];
        }

        // Deep purge (async) - resolve with zeros
        return [{ result: { indexedDb: 0, caches: 0, workers: 0 } }];
      }
    },
    action: {
      setBadgeText: async () => {},
      setBadgeBackgroundColor: async () => {}
    },
    permissions: {
      contains: async () => true,
      request: async () => true,
      onRequestAdded: { addListener: () => {} }
    }
  };

  // Report cookie.remove/set failures loudly so the summary toasts are honest
  window.chrome = mock;
  window.__mockStore = { siteStore, cookies };
  console.log('[mock] Chrome API mock installed for local preview');
})();
