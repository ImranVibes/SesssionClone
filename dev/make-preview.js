#!/usr/bin/env node
/**
 * Dev only: builds popup/preview.html from popup/popup.html with the Chrome API
 * mock injected, so the interface can be reviewed in a plain browser.
 * Run: node dev/make-preview.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'popup', 'popup.html'), 'utf8');

const tag = '  <script src="../dev/mock-chrome.js"></script>\n';
if (src.includes('../dev/mock-chrome.js')) {
  console.log('preview already has the mock');
  process.exit(0);
}

const out = src.replace(
  '  <script src="../scripts/crypto.js"></script>',
  tag + '  <script src="../scripts/crypto.js"></script>'
);

if (out === src) {
  console.error('Could not find the script anchor in popup.html');
  process.exit(1);
}

fs.writeFileSync(path.join(ROOT, 'popup', 'preview.html'), out);
console.log('popup/preview.html written');
