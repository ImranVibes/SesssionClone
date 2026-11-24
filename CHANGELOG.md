# Changelog

## 1.0.0 - store release

- Session cloning between browsers: 1-click Clone & Paste with configurable
  reload behaviour (countdown / instant / never).
- Cookies, LocalStorage and sessionStorage management with search, editing and
  JWT inspection.
- Universal import/export: SessionClone bundle, Cookie-Editor, EditThisCookie,
  Quick Cookie Manager, Netscape cookies.txt, HTTP header strings and plain
  storage JSON. Optional AES-256-GCM password protection for exports.
- Multi-account Vault with colour tags and backup/restore.
- Site purge incl. optional deep purge (IndexedDB, caches, service workers).
- Full-tab view for large sites, 4 themes, masked values option.
- Firefox MV3 build with proper `background.scripts` manifest.
- Store-ready manifest: description within limits, explicit CSP, no unused
  permissions; all operations report failures instead of failing silently.
