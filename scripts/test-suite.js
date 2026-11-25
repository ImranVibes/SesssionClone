/**
 * SessionClone - Automated Test Suite
 * Validates:
 * - Store-ready manifests (Chrome source + generated Chrome/Firefox builds)
 * - AES-GCM 256-bit + PBKDF2 crypto engine
 * - Multi-format parsers (Cookie-Editor, EditThisCookie, Quick Cookie Manager,
 *   Netscape #HttpOnly_, Set-Cookie headers, plain storage JSON)
 * - Domain-mismatch detection, sanitization, URL resolution
 * - Module structure (no dead files, popup entry present)
 *
 * Run: npm test  (builds first via pretest)
 */

const fs = require('fs');
const path = require('path');
const Crypto = require('./crypto.js');
const CookieUtils = require('./cookie-utils.js');

const ROOT = path.join(__dirname, '..');

async function runTests() {
  console.log('Running SessionClone test suite...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  PASS: ${message}`);
      passed++;
    } else {
      console.error(`  FAIL: ${message}`);
      failed++;
    }
  }

  /* ------------------------------------------------------------------ *
   * 1. Manifest (source = Chrome)
   * ------------------------------------------------------------------ */
  console.log('Category: Manifest V3 + store rules');
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  assert(manifest.manifest_version === 3, 'Manifest version is 3');
  assert(manifest.permissions.includes('cookies'), 'Has cookies permission');
  assert(manifest.permissions.includes('storage'), 'Has storage permission');
  assert(manifest.permissions.includes('scripting'), 'Has scripting permission');
  assert(manifest.permissions.includes('tabs'), 'Has tabs permission');
  assert(manifest.permissions.includes('activeTab'), 'Has activeTab permission');
  assert(!manifest.permissions.includes('browsingData'), 'Unused browsingData permission not shipped');
  assert(Array.isArray(manifest.optional_permissions) && manifest.optional_permissions.includes('clipboardRead'),
    'clipboardRead is requested on demand');
  assert(manifest.host_permissions.includes('<all_urls>'), 'Host permissions has <all_urls>');
  assert(manifest.description && manifest.description.length <= 132,
    `Description within the 132 char store limit (${manifest.description.length})`);
  assert(manifest.content_security_policy && manifest.content_security_policy.extension_pages.includes("script-src 'self'"),
    'Explicit extension page CSP present');
  assert(manifest.minimum_chrome_version, 'minimum_chrome_version declared');
  assert(!manifest.browser_specific_settings, 'Gecko settings live only in the Firefox build');

  /* ------------------------------------------------------------------ *
   * 2. Generated store builds
   * ------------------------------------------------------------------ */
  console.log('\nCategory: Store builds (Chrome version/ & Firefox version/)');
  const chromeDir = path.join(ROOT, 'Chrome version');
  const firefoxDir = path.join(ROOT, 'Firefox version');
  assert(fs.existsSync(path.join(chromeDir, 'manifest.json')), 'Chrome version/ built');
  assert(fs.existsSync(path.join(firefoxDir, 'manifest.json')), 'Firefox version/ built');

  if (fs.existsSync(path.join(firefoxDir, 'manifest.json'))) {
    const ff = JSON.parse(fs.readFileSync(path.join(firefoxDir, 'manifest.json'), 'utf8'));
    assert(ff.browser_specific_settings && ff.browser_specific_settings.gecko && ff.browser_specific_settings.gecko.id,
      'Firefox manifest carries a Gecko id');
    assert(
      ff.browser_specific_settings &&
      ff.browser_specific_settings.gecko &&
      ff.browser_specific_settings.gecko.data_collection_permissions &&
      Array.isArray(ff.browser_specific_settings.gecko.data_collection_permissions.required) &&
      ff.browser_specific_settings.gecko.data_collection_permissions.required.includes('none'),
      'Firefox manifest declares data_collection_permissions: { required: ["none"] }');
    assert(ff.background && Array.isArray(ff.background.scripts) && !ff.background.service_worker,
      'Firefox manifest uses background.scripts (MV3 Firefox requirement)');
    assert(!ff.minimum_chrome_version, 'Firefox manifest drops minimum_chrome_version');
  }

  const devFiles = ['test-suite.js', 'build.js', 'generate-icons.js', 'render-icons-headless.js', 'package.json', 'storage-bridge.js'];
  for (const dir of [chromeDir, firefoxDir]) {
    if (!fs.existsSync(dir)) continue;
    const names = [];
    const walk = d => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walk(path.join(d, e.name));
        else names.push(e.name);
      }
    };
    walk(dir);
    for (const dev of devFiles) {
      assert(!names.includes(dev), `${path.basename(dir)}: no dev file "${dev}"`);
    }
    for (const size of [16, 32, 48, 128]) {
      assert(names.includes(`icon${size}.png`), `${path.basename(dir)}: icon${size}.png present`);
    }
    const buildModules = ['core', 'settings', 'tab', 'modals', 'cookies', 'storage', 'transfer', 'vault'];
    for (const m of buildModules) {
      assert(fs.existsSync(path.join(dir, 'popup', 'modules', `${m}.js`)), `${path.basename(dir)}: popup/modules/${m}.js present`);
    }
  }

  /* ------------------------------------------------------------------ *
   * 3. Module structure
   * ------------------------------------------------------------------ */
  console.log('\nCategory: Code structure');
  const html = fs.readFileSync(path.join(ROOT, 'popup', 'popup.html'), 'utf8');
  assert(html.includes('type="module" src="./main.js"'), 'Popup boots through an ES module');
  assert(!fs.existsSync(path.join(ROOT, 'popup', 'popup.js')), 'Legacy 1900-line popup.js removed');
  assert(!fs.existsSync(path.join(ROOT, 'scripts', 'storage-bridge.js')), 'Dead storage-bridge.js removed');
  assert(!html.includes('permissionBanner'), 'Fake permission banner removed');
  assert(html.includes('sadiakhan6t9@gmail.com'), 'Support email link present');
  assert(html.includes('id="privacyModal"'), 'In-app privacy policy modal present');
  assert(html.includes('id="permHostBtn"') && html.includes('id="permClipBtn"'), 'Interactive permission buttons present');
  assert(html.includes('Bangabandhu'), 'Credit line present');
  assert(html.includes('id="reloadModal"'), 'Auto-reload countdown modal present');

  const modules = ['core', 'settings', 'tab', 'modals', 'cookies', 'storage', 'transfer', 'vault'];
  for (const m of modules) {
    assert(fs.existsSync(path.join(ROOT, 'popup', 'modules', `${m}.js`)), `Module popup/modules/${m}.js exists`);
  }

  /* ------------------------------------------------------------------ *
   * 4. Crypto round-trip & error handling
   * ------------------------------------------------------------------ */
  console.log('\nCategory: AES-GCM 256-bit + PBKDF2 crypto engine');
  const samplePayload = JSON.stringify({
    type: 'SessionCloneBundle',
    cookies: [{ name: 'auth_token', value: 'secret_jwt_value_123' }],
    localStorage: { user_profile: '{"id": 42}' },
    sessionStorage: { tab_state: 'open' }
  });
  const password = 'CorrectHorseBatteryStaple#2026';

  const encrypted = await Crypto.encrypt(samplePayload, password);
  assert(Crypto.isEncrypted(encrypted), 'Encrypted string recognized as encrypted');
  assert(encrypted.startsWith('SESSIONCLONE_ENC:v1:'), 'Encrypted string has correct version prefix');

  const decrypted = await Crypto.decrypt(encrypted, password);
  assert(decrypted === samplePayload, 'Decrypted string matches original payload exactly');

  let failedWrongPassword = false;
  try {
    await Crypto.decrypt(encrypted, 'WrongPassword123');
  } catch (e) {
    failedWrongPassword = true;
  }
  assert(failedWrongPassword, 'Decryption with incorrect password throws');

  /* ------------------------------------------------------------------ *
   * 5. Format compatibility
   * ------------------------------------------------------------------ */
  console.log('\nCategory: Cookie manager format compatibility');

  const cookieEditorJSON = JSON.stringify([{
    domain: '.example.com', expirationDate: 1780000000, hostOnly: false, httpOnly: true,
    name: 'ce_token', path: '/', sameSite: 'lax', secure: true, session: false, storeId: '0',
    value: 'cookie_editor_val'
  }]);
  const parsedCE = CookieUtils.parseUniversalPayload(cookieEditorJSON);
  assert(parsedCE.format === 'cookie_editor', 'Detects Cookie-Editor format');
  assert(parsedCE.cookies[0] && parsedCE.cookies[0].name === 'ce_token', 'Parsed Cookie-Editor token name');
  assert(parsedCE.cookies[0].httpOnly === true, 'Parsed Cookie-Editor httpOnly flag');

  const editThisCookieJSON = JSON.stringify([{
    domain: 'app.example.com', expirationDate: 1790000000, hostOnly: true, httpOnly: false,
    id: 1, name: 'etc_sess', path: '/dashboard', sameSite: 'strict', secure: true,
    session: false, storeId: '0', value: 'etc_value_123'
  }]);
  const parsedETC = CookieUtils.parseUniversalPayload(editThisCookieJSON);
  assert(parsedETC.format === 'cookie_editor', 'Detects EditThisCookie format');
  assert(parsedETC.cookies[0].hostOnly === true, 'Parsed EditThisCookie hostOnly');

  const quickCookieMgrJSON = JSON.stringify([{
    host: '.service.com', name: 'qcm_auth', value: 'qcm_val_999', path: '/',
    expires: 1800000000, isSecure: true, isHttpOnly: true, isSession: false
  }]);
  const parsedQCM = CookieUtils.parseUniversalPayload(quickCookieMgrJSON);
  assert(parsedQCM.format === 'cookie_editor', 'Detects Quick Cookie Manager JSON');
  assert(parsedQCM.cookies[0].domain === '.service.com', 'Mapped QCM host to domain');
  assert(parsedQCM.cookies[0].secure === true && parsedQCM.cookies[0].httpOnly === true,
    'Mapped QCM isSecure/isHttpOnly');

  const netscapeWithHttpOnly =
    '# Netscape HTTP Cookie File\n' +
    '#HttpOnly_.example.com\tTRUE\t/\tTRUE\t1800000000\tsecret_c\tsecret_v\n' +
    '.example.com\tTRUE\t/\tFALSE\t1800000000\tpublic_c\tpublic_v';
  const parsedNetscapeHO = CookieUtils.parseNetscape(netscapeWithHttpOnly);
  assert(parsedNetscapeHO.length === 2, 'Parsed 2 Netscape cookies');
  assert(parsedNetscapeHO[0].httpOnly === true, 'Netscape #HttpOnly_ prefix recognized');
  assert(parsedNetscapeHO[1].httpOnly === false, 'Standard Netscape cookie is not httpOnly');

  const storageDict = JSON.stringify({ firebase_token: 'xyz_firebase_123', supabase_auth: '{"user": "alex"}' });
  const parsedStorage = CookieUtils.parseUniversalPayload(storageDict);
  assert(parsedStorage.format === 'json_storage', 'Detects plain JSON storage dictionary');
  assert(parsedStorage.localStorage.firebase_token === 'xyz_firebase_123', 'Mapped localStorage key');

  const cookieWrapper = JSON.stringify({ cookies: [{ name: 'wrapped', value: 'v' }] });
  const parsedWrapper = CookieUtils.parseUniversalPayload(cookieWrapper);
  assert(parsedWrapper.format === 'bundle' && parsedWrapper.cookies.length === 1,
    'A { cookies: [...] } object is treated as a session, not as storage');

  assert(CookieUtils.detectFormat('# Netscape HTTP Cookie File\n.a\tTRUE\t/\tFALSE\t0\ta\tb') === 'netscape',
    'Detects Netscape format');
  assert(CookieUtils.detectFormat('Cookie: a=1; b=2') === 'header', 'Detects raw Cookie header');

  /* ------------------------------------------------------------------ *
   * 6. Data fidelity: Netscape round-trip & Set-Cookie attributes
   * ------------------------------------------------------------------ */
  console.log('\nCategory: Import/export data fidelity');

  const sessionCookie = { name: 'sid', value: 'abc', domain: '.example.com', path: '/', httpOnly: true, secure: true, session: true };
  const netscapeOut = CookieUtils.exportToNetscape([sessionCookie]);
  const sessionLine = netscapeOut.split('\n').find(l => l.includes('sid'));
  assert(sessionLine && sessionLine.split('\t')[4] === '0', 'Session cookies export with expiration 0 (stay session cookies)');
  const backFromNetscape = CookieUtils.parseNetscape(netscapeOut);
  assert(backFromNetscape[0].session === true, 'Round-trip keeps the cookie session-scoped');

  const persistentCookie = { name: 'lang', value: 'en', domain: 'example.com', path: '/', expirationDate: 1800000000 };
  const persistentBack = CookieUtils.parseNetscape(CookieUtils.exportToNetscape([persistentCookie]));
  assert(persistentBack[0].expirationDate === 1800000000, 'Persistent expiry survives the round-trip');

  const setCookie = CookieUtils.parseHeaderString(
    'Set-Cookie: token=xyz; Path=/app; Domain=.example.com; Secure; HttpOnly; SameSite=Strict; Max-Age=600',
    'https://example.com/'
  );
  assert(setCookie.length === 1 && setCookie[0].name === 'token', 'Parses one cookie from a Set-Cookie line');
  assert(setCookie[0].path === '/app', 'Preserves Path attribute');
  assert(setCookie[0].domain === '.example.com', 'Preserves Domain attribute');
  assert(setCookie[0].secure === true && setCookie[0].httpOnly === true, 'Preserves Secure and HttpOnly flags');
  assert(setCookie[0].sameSite === 'strict', 'Preserves SameSite attribute');
  assert(setCookie[0].session === false && setCookie[0].expirationDate > 0, 'Max-Age becomes a real expiration');

  const cookieHeader = CookieUtils.parseHeaderString('Cookie: a=1; b=2', 'https://site.test/');
  assert(cookieHeader.length === 2, 'Cookie header with several pairs yields several cookies');
  assert(cookieHeader[0].secure === true, 'Cookies parsed on an https origin default to secure');

  const multiLine = CookieUtils.parseHeaderString('a=1; Path=/\nb=2', 'http://plain.test/');
  assert(multiLine.length === 2, 'Multi-line header input handled');

  /* ------------------------------------------------------------------ *
   * 7. Sanitization & URL resolution
   * ------------------------------------------------------------------ */
  console.log('\nCategory: Cookie sanitization & URL resolver');
  const sanitized = CookieUtils.sanitizeCookieForSet({
    name: 'session_id', value: 'abc-xyz-789', domain: '.github.com', path: '/api', sameSite: 'no_restriction'
  }, 'https://github.com/settings');
  assert(sanitized.url === 'https://github.com/api', 'URL resolver removes leading dot and keeps path');
  assert(sanitized.domain === 'github.com', 'Domain leading dot is stripped for browser API compatibility');
  assert(sanitized.secure === true, 'Enforces secure=true when sameSite is no_restriction');
  assert(sanitized.sameSite === 'no_restriction', 'SameSite preserved');

  /* ------------------------------------------------------------------ *
   * 8. Domain mismatch warnings & candidate hierarchy
   * ------------------------------------------------------------------ */
  console.log('\nCategory: Domain mismatch detection');
  assert(CookieUtils.checkDomainMismatch('github.com', [{ domain: '.gitlab.com' }]).mismatch === true,
    'Different domain flagged as mismatch');
  assert(CookieUtils.checkDomainMismatch('github.com', [{ domain: '.github.com' }]).mismatch === false,
    'Same domain accepted');
  assert(CookieUtils.checkDomainMismatch('example.com', [{ domain: 'api.example.com' }]).mismatch === false,
    'Subdomain accepted');
  assert(CookieUtils.checkDomainMismatch('github.com', []).mismatch === false,
    'Storage-only payload never blocks the import');
  assert(CookieUtils.getCookieDomains([{ domain: '.a.com' }, { domain: 'a.com' }]).length === 1,
    'Domain list is de-duplicated and dot-stripped');

  // Multi-level candidate and matching tests
  const candidates = CookieUtils.getDomainCandidates('developer.microsoft.com');
  assert(candidates.includes('developer.microsoft.com') && candidates.includes('microsoft.com'),
    'getDomainCandidates decomposes subdomains');
  assert(CookieUtils.isCookieMatchingHost('.microsoft.com', 'developer.microsoft.com'),
    'Parent domain cookie (.microsoft.com) matches subdomain tab (developer.microsoft.com)');
  assert(CookieUtils.isCookieMatchingHost('developer.microsoft.com', 'developer.microsoft.com'),
    'Exact domain cookie matches tab');
  assert(CookieUtils.isCookieMatchingHost('sub.developer.microsoft.com', 'developer.microsoft.com'),
    'Child subdomain cookie matches tab');
  assert(!CookieUtils.isCookieMatchingHost('google.com', 'developer.microsoft.com'),
    'Unrelated domain cookie does not match tab');
  assert(!CookieUtils.isCookieMatchingHost('.com', 'developer.microsoft.com'),
    'Naked TLD is rejected from matching');

  /* ------------------------------------------------------------------ *
   * 9. Icon files
   * ------------------------------------------------------------------ */
  console.log('\nCategory: Icon assets');
  [16, 32, 48, 128].forEach(size => {
    const iconFile = path.join(ROOT, 'icons', `icon${size}.png`);
    assert(fs.existsSync(iconFile) && fs.statSync(iconFile).size > 0, `icon${size}.png exists and non-empty`);
  });
  assert(fs.existsSync(path.join(ROOT, 'icons', 'promo-440x280.png')), 'Store promo image exists');

  console.log('\n========================================');
  console.log(`Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
