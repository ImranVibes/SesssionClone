# SessionClone

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-success.svg)](manifest.json)
[![Chrome & Firefox](https://img.shields.io/badge/Platform-Chrome%20%7C%20Firefox%20%7C%20Edge-orange.svg)](#cross-browser-support)
[![Tests Passing](https://img.shields.io/badge/Tests-116%20Passed-brightgreen.svg)](#automated-testing)
[![Privacy First](https://img.shields.io/badge/Privacy-100%25%20Local%20%7C%20Zero%20Telemetry-purple.svg)](#transparency--privacy-guarantee)

> **Clone sessions like never before.** Transfer cookies, edit local storage, and backup login sessions with AES-256 encryption. Copy cookies and site storage on one browser, paste on another, and you are logged in seamlessly — no email, no password re-entry.

---

## Transparency & Privacy Guarantee

SessionClone is designed from the ground up as a **zero-knowledge, 100% client-side privacy tool**. Because session tokens and cookies represent authenticated access, complete architectural transparency is non-negotiable.

### Core Guarantees:
- **Zero Remote Telemetry & Tracking**: The extension does not contact any analytics services, external tracking endpoints, or telemetry servers. There is no background network communication.
- **100% Local Execution**: All cookie operations, local storage serialization, and formatting routines execute strictly on your device's local CPU.
- **Zero Data Monetization**: No user data, site history, browsing habits, tokens, or identifiers are ever recorded, collected, sold, or transmitted off your machine.
- **Client-Side AES-256-GCM Encryption**: Encrypted vault profiles and exported backups are encrypted locally via the browser's native Web Crypto API (`AES-256-GCM` with `PBKDF2` key derivation, 100,000 iterations). Your password is never stored or transmitted.
- **Fully Auditable & Open Source**: The complete codebase is open for public inspection, reproducible builds, and independent security audits.

---

## Permission Transparency Matrix

SessionClone adheres strictly to the Principle of Least Privilege (PoLP). Every declared permission in [manifest.json](manifest.json) serves a distinct, user-directed functional purpose:

| Permission | Scope | Exact Purpose & Justification |
| :--- | :--- | :--- |
| `cookies` | Active Browser | Required to read, set, and delete HTTP cookies for the active domain when cloning, pasting, or managing sessions. |
| `storage` | Local Extension Sandbox | Stores user interface preferences (theme, reload countdown timer) and local multi-account Vault profiles inside the browser's isolated extension storage. |
| `scripting` | Explicit Tab Context | Injects lightweight, isolated scripts into the active tab to read and write `window.localStorage` and `window.sessionStorage` upon user command. |
| `<all_urls>` | User-Targeted Domain | Required because the user can choose to clone or restore sessions on any legitimate web application they visit. Scripts and cookie lookups are *never* triggered in the background; they only fire when the user opens the popup and clicks an action. |
| `clipboardRead` *(Optional)* | On-Demand | Only requested if the user explicitly utilizes the one-click clipboard paste shortcut. |

---

## Key Features

- **1-Click Session Clone & Paste**: Clone the full state (cookies + `localStorage` + `sessionStorage`) of any active tab with one click, and seamlessly inject it into another browser or window.
- **Comprehensive Cookie Manager**: Inspect, search, filter, add, edit, and delete cookies with full attribute visibility (Domain, Path, SameSite, Secure, HttpOnly, Expiration, Size).
- **High-Performance Storage Engine**: Virtualized preview engine capable of rendering multi-megabyte `localStorage` caches (such as Duolingo offline stores and Redux state trees) with zero frame drops or interface freezing.
- **Multi-Account Encrypted Vault**: Save active sessions as named, color-coded profiles. Switch between multiple accounts instantly with optional password-based AES-256-GCM encryption.
- **Universal Multi-Format Interoperability**:
  - *SessionClone Universal Bundle* (All cookies + LocalStorage + SessionStorage)
  - *Cookie-Editor & EditThisCookie* (Standard JSON array)
  - *Netscape / curl / wget `cookies.txt`* (Including `#HttpOnly_` prefix support)
  - *Raw HTTP Headers* (`Cookie:` and `Set-Cookie:` headers with attribute preservation)
  - *Key-Value Storage JSON* (Dictionary export)
- **Built-in JWT & JSON Inspector**: Automatically detects JWT tokens in storage/cookies, validates signatures, decodes payload claims, and formats complex JSON structures with syntax highlighting.
- **Firefox Multi-Account Containers Support**: Native compatibility with Firefox Container Tabs (`cookieStoreId`), allowing distinct isolation across personal, work, and banking containers.
- **Site Zero-Trace Purge**: Safely clear all cookies, local storage, session storage, and optionally IndexedDB, cache storage, and service workers for the active origin.
- **Customizable Themes**: High-contrast, accessibility-tested themes including Zinc Dark, Pitch Black, Midnight Slate, and Clean Light.

---

## Security Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Browser Tab                           │
│  [ Cookies ]   [ window.localStorage ]   [ sessionStorage ] │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
       (chrome.cookies API)       (chrome.scripting API)
               │                              │
┌──────────────▼──────────────────────────────▼───────────────┐
│               SessionClone Sandboxed Runtime                │
│                                                             │
│  • Memory-only processing (Zero persistence of session data)│
│  • Native Web Crypto API (SubtleCrypto)                     │
│    - PBKDF2 (SHA-256, 100,000 iterations, 16-byte salt)    │
│    - AES-GCM 256-bit authenticated cipher                   │
│  • Strict Content Security Policy (No eval, no remote code) │
└──────────────────────────────┬──────────────────────────────┘
                               │
               (User Export / Local Vault Storage)
                               ▼
            [ Encrypted AES-256 Backup / Clipboard ]
```

---

## Repository Structure

```
├── manifest.json            # Base Manifest V3 configuration
├── popup/                   # Main extension UI and modules
│   ├── popup.html           # Accessible markup, dialogs, and modals
│   ├── popup.css            # Responsive CSS theme system
│   ├── main.js              # Application bootstrapper
│   └── modules/             # Modular ES runtime architecture
│       ├── core.js          # State management, DOM caching, helpers
│       ├── cookies.js       # Cookie querying, rendering, and CRUD
│       ├── storage.js       # Virtualized storage engine & JWT inspector
│       ├── transfer.js      # Universal format import/export/purge engine
│       ├── vault.js         # Multi-account encrypted profile manager
│       ├── modals.js        # Editor, JSON, and confirmation modals
│       ├── settings.js      # User preferences and permissions manager
│       └── tab.js           # Tab inspection and navigation controller
├── scripts/                 # Core utilities and build pipeline
│   ├── background.js        # Service worker for badge counters
│   ├── cookie-utils.js      # Universal multi-format parser & serialiser
│   ├── crypto.js            # Web Crypto AES-256-GCM implementation
│   ├── build.js             # Automated distribution builder (Chrome/Firefox)
│   └── test-suite.js        # Comprehensive 116-test automated verification
├── icons/                   # High-DPI application icons and promo assets
├── PRIVACY.md               # Complete legal privacy policy document
├── LICENSE                  # MIT open-source license
└── package.json             # Build and test lifecycle configuration
```

> **Note**: Do not modify `Chrome version/` or `Firefox version/` directly. They are clean, distribution-ready packages compiled automatically by `npm run build`.

---

## Local Development & Verification

### Prerequisites
- Node.js 18+ (no third-party runtime dependencies required; runs entirely on native Node standard library)

### Build and Test
```bash
# Compile upload-ready Chrome and Firefox distributions
npm run build

# Run the complete test suite (116 automated checks)
npm test
```

### Loading in Browsers for Local Testing

- **Google Chrome / Chromium / Brave / Edge**:
  1. Navigate to `chrome://extensions`.
  2. Toggle **Developer mode** in the upper-right corner.
  3. Click **Load unpacked** and select the `Chrome version` folder.

- **Mozilla Firefox**:
  1. Navigate to `about:debugging#/runtime/this-firefox`.
  2. Click **Load Temporary Add-on...**
  3. Select the `manifest.json` file inside the `Firefox version` folder.

---

## Automated Testing

SessionClone features an automated test runner (`scripts/test-suite.js`) covering:
- **Manifest V3 & Store Compliance**: Validates strict CSP declarations, icon dimensions, host permission declarations, description length bounds, and Gecko settings.
- **Crypto Engine Verification**: Tests PBKDF2 key derivation, 256-bit AES-GCM round-trip encryption/decryption, corrupted payload handling, and wrong-password rejection.
- **Format Interoperability**: Tests Cookie-Editor JSON, EditThisCookie arrays, Quick Cookie Manager formats, Netscape `cookies.txt` with `#HttpOnly_` flags, raw HTTP headers, and key-value storage payloads.
- **Data Integrity**: Asserts that session-scoped cookies remain session cookies, expiration timestamps survive round-tripping, and domain dot-stripping maintains cross-browser compatibility.
- **Leak Prevention**: Asserts that internal development tooling, mock servers, and test scripts never package into release builds.

```
Running SessionClone test suite...
========================================
Test Summary: 116 Passed, 0 Failed
========================================
```

---

## Privacy Policy & In-App Transparency

The complete Privacy Policy is available in [PRIVACY.md](PRIVACY.md) and is directly embedded inside the extension's Settings modal for offline user access at any time.

- **Support & Inquiries**: [sadiakhan6t9@gmail.com](mailto:sadiakhan6t9@gmail.com)
- **Author Credits**: Made with precision by **Bangabandhu Sheikh Mujibur Rahman**.
- **Community & Links**: [Support Portal](https://dub.sh/cha) • [Telegram](https://dub.sh/mrsheikh)

---

## License

SessionClone is distributed under the permissive [MIT License](LICENSE). You are free to inspect, modify, and distribute the code in accordance with the license conditions.
