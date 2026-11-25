#!/usr/bin/env node
/**
 * SessionClone - Store build script (no dependencies)
 *
 * Creates two upload-ready folders next to this repo:
 *   Chrome version/   -> zip its *contents* and upload to the Chrome Web Store
 *   Firefox version/  -> zip its *contents* and upload to addons.mozilla.org
 *
 * Only runtime files are copied: no tests, no icon tooling, no docs.
 *
 * Usage:  npm run build
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MAX_DESCRIPTION_LENGTH = 132; // Chrome Web Store limit

const MODULE_FILES = fs.existsSync(path.join(ROOT, 'popup', 'modules'))
  ? fs.readdirSync(path.join(ROOT, 'popup', 'modules'))
      .filter(f => f.endsWith('.js'))
      .map(f => `popup/modules/${f}`)
  : [];

const RUNTIME_FILES = [
  'popup/popup.html',
  'popup/popup.css',
  'popup/main.js',
  ...MODULE_FILES,
  'scripts/background.js',
  'scripts/cookie-utils.js',
  'scripts/crypto.js',
  'icons/icon16.png',
  'icons/icon32.png',
  'icons/icon48.png',
  'icons/icon128.png'
];

const ICON_SIZES = [16, 32, 48, 128];

function fail(message) {
  console.error(`\n✖ BUILD FAILED: ${message}\n`);
  process.exit(1);
}

function copyInto(targetDir, files) {
  for (const rel of files) {
    const src = path.join(ROOT, rel);
    if (!fs.existsSync(src)) fail(`Missing source file: ${rel}`);
    const dest = path.join(targetDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function validateManifest(manifest, label) {
  if (manifest.manifest_version !== 3) fail(`${label}: manifest_version must be 3`);
  if (!manifest.description || manifest.description.length > MAX_DESCRIPTION_LENGTH) {
    fail(`${label}: description must be <= ${MAX_DESCRIPTION_LENGTH} characters (now ${manifest.description ? manifest.description.length : 0})`);
  }
  if (manifest.permissions && manifest.permissions.includes('browsingData')) {
    fail(`${label}: unused browsingData permission must not ship`);
  }
  if (manifest.permissions && manifest.permissions.includes('activeTab')) {
    fail(`${label}: activeTab is redundant with <all_urls> host permissions`);
  }
  if (!manifest.host_permissions || !manifest.host_permissions.includes('<all_urls>')) {
    fail(`${label}: <all_urls> host permission is required`);
  }
  if (!manifest.content_security_policy) fail(`${label}: explicit CSP missing`);
  if (label === 'Firefox') {
    const gecko = manifest.browser_specific_settings && manifest.browser_specific_settings.gecko;
    if (!gecko || !gecko.data_collection_permissions || !Array.isArray(gecko.data_collection_permissions.required)) {
      fail(`${label}: data_collection_permissions property is required in browser_specific_settings.gecko`);
    }
  }
  for (const size of [16, 32, 48, 128]) {
    if (!manifest.icons || !manifest.icons[String(size)]) fail(`${label}: missing icon ${size}`);
  }
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    for (const file of fs.readdirSync(dir)) {
      const full = path.join(dir, file);
      try {
        fs.rmSync(full, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      } catch (e) {}
    }
  } else {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function main() {
  // --- Read & validate the source manifest (Chrome) --------------------
  const manifestPath = path.join(ROOT, 'manifest.json');
  const chromeManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  validateManifest(chromeManifest, 'Chrome');

  // Check that the privacy policy is accessible (in-app modal or hosted URL)
  const html = fs.readFileSync(path.join(ROOT, 'popup', 'popup.html'), 'utf8');
  if (!html.includes('id="privacyModal"')) {
    const privacyMatch = html.match(/id="privacyPolicyLink"[^>]*href="([^"]+)"/);
    if (!privacyMatch || privacyMatch[1] === 'https://github.com/') {
      console.warn('⚠ Remember to set the real PRIVACY.md URL or in-app modal on #privacyPolicyLink in popup/popup.html');
    }
  }

  // --- Chrome build ----------------------------------------------------
  const chromeDir = path.join(ROOT, 'Chrome version');
  cleanDir(chromeDir);
  copyInto(chromeDir, RUNTIME_FILES);
  fs.writeFileSync(path.join(chromeDir, 'manifest.json'), JSON.stringify(chromeManifest, null, 2) + '\n');

  // --- Firefox build ---------------------------------------------------
  const firefoxManifest = JSON.parse(JSON.stringify(chromeManifest));
  firefoxManifest.background = { scripts: ['scripts/background.js'] };
  firefoxManifest.browser_specific_settings = {
    gecko: {
      id: 'sessionclone@universal.extension',
      strict_min_version: '109.0',
      data_collection_permissions: {
        required: ['none']
      }
    }
  };
  delete firefoxManifest.minimum_chrome_version;
  validateManifest(firefoxManifest, 'Firefox');

  const firefoxDir = path.join(ROOT, 'Firefox version');
  cleanDir(firefoxDir);
  copyInto(firefoxDir, RUNTIME_FILES);
  fs.writeFileSync(path.join(firefoxDir, 'manifest.json'), JSON.stringify(firefoxManifest, null, 2) + '\n');

  // --- Sanity: no development files leaked -----------------------------
  const forbidden = ['test-suite.js', 'build.js', 'generate-icons.js', 'render-icons-headless.js', 'package.json', 'storage-bridge.js'];
  for (const dir of [chromeDir, firefoxDir]) {
    const walk = d => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (forbidden.includes(entry.name)) fail(`${path.basename(dir)}: development file leaked into the package: ${entry.name}`);
      }
    };
    walk(dir);
  }

  for (const size of ICON_SIZES) {
    for (const dir of [chromeDir, firefoxDir]) {
      if (!fs.existsSync(path.join(dir, 'icons', `icon${size}.png`))) {
        fail(`${path.basename(dir)}: icons/icon${size}.png missing`);
      }
    }
  }

  const count = dir => {
    let n = 0;
    const walk = d => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(path.join(d, entry.name));
        else n++;
      }
    };
    walk(dir);
    return n;
  };

  // --- Package Firefox version.zip for 1-click loading / store submission
  try {
    const { execSync } = require('child_process');
    execSync(`tar -a -cf "${path.join(firefoxDir, 'Firefox version.zip')}" -C "${firefoxDir}" manifest.json icons popup scripts`);
  } catch (e) {
    // If tar is unavailable, the unpacked folder is ready
  }

  console.log('✔ Chrome version/  ready (' + count(chromeDir) + ' files) - zip its contents for the Chrome Web Store');
  console.log('✔ Firefox version/ ready (' + count(firefoxDir) + ' files) - Firefox version.zip generated for addons.mozilla.org');
  console.log('✔ description length: ' + chromeManifest.description.length + '/' + MAX_DESCRIPTION_LENGTH);
}

main();
