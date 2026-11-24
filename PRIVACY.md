# Privacy Policy for SessionClone

_Last updated: October 28, 2026_

SessionClone is a browser extension that helps you copy a website session (cookies,
localStorage and sessionStorage) between browsers so you do not have to log in again.

**The short version: SessionClone does not collect, transmit, sell or share any of your
data. Everything stays on your device.**

## What data SessionClone accesses

- **Cookies** of the website you are viewing, when you open the extension or use an
  action (clone, paste, export, import, purge, profile switch).
- **localStorage and sessionStorage** of the website you are viewing, read through the
  browser's scripting permission when you open the extension.
- **The clipboard**, only when you yourself click a "Paste" action and grant the
  optional clipboard permission.
- **Your extension settings and saved profiles**, stored through the browser's
  extension storage.

## Where data is stored

- Settings, saved Vault profiles and the last-used tab id are stored in your browser's
  extension storage (`chrome.storage.local` / `browser.storage.local`), which only this
  extension can read.
- Exported session files or copied text exist wherever you put them (clipboard, your
  downloads folder, a file you share yourself).
- Saved Vault profiles are **not encrypted at rest**. They contain full login sessions.
  Delete profiles you no longer need, and use the optional password protection when
  exporting if you plan to move a session over an untrusted channel.

## What SessionClone never does

- It never sends any cookie, token, storage value, URL or usage statistic to any
  server, analytics service or third party.
- It has no backend, no account system and no tracking of any kind.
- It does not read or modify data of websites you have not targeted with its actions
  beyond what the browser requires for the requested permissions.
- It never sells or shares data, because it never collects data.

## Permissions explanation

- **cookies** - to read, create, edit and delete the cookies of the site you manage.
- **storage** - to remember your settings and saved profiles inside your browser.
- **scripting** - to read and write localStorage/sessionStorage of the tab you target.
- **Host permission for all websites** - required because you can run SessionClone on
  any site you visit.
- **clipboardRead (optional)** - requested only when you use a paste action.

## Children's privacy

SessionClone is not directed at children under 13 and does not knowingly collect any
information from anyone, including children.

## Changes to this policy

If this policy changes, the updated version will be published together with the
extension and the "Last updated" date above will change.

## Contact

Questions or problems? Use the support links inside the extension (Settings →
About & Support) or open an issue on the project's GitHub repository.
