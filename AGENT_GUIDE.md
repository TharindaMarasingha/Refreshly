# Refreshly — AI Agent & Developer Guide

This document is designed to give AI agents and new developers a comprehensive understanding of the **Refreshly** codebase, its architecture, and its technical nuances.

## 1. Project Overview

**Refreshly** is a Manifest V3 (MV3) Google Chrome extension that provides advanced auto-refresh functionality. 
- **Developer:** Tharinda Marasingha ([tharinda.me](https://tharinda.me) / [GitHub](https://github.com/TharindaMarasingha))
- **Tech Stack:** Vanilla JavaScript, HTML, CSS. No build tools (Webpack, Vite, etc.) are used. 
- **Architecture:** Standard MV3 pattern (Popup UI + Background Service Worker).

## 2. File Structure

| File | Purpose |
|---|---|
| `manifest.json` | MV3 configuration. Defines permissions (`tabs`, `scripting`, `storage`, `activeTab`), the service worker, and UI assets. |
| `background.js` | The core engine. Runs persistently (or wakes up) to manage timers, execute reloads, and inject scripts into tabs. |
| `popup.html` | The extension UI. Contains the HTML structure for all tabs (Interval, Timer, Tabs, Monitor). |
| `popup.css` | Styling for the UI. Uses a dark theme with CSS variables (e.g., `--bg-primary`, `--accent`). |
| `popup.js` | UI logic. Handles state management, DOM manipulation, and messaging with the background script. |
| `icons/` | Contains `icon16.png`, `icon48.png`, and `icon128.png`. |

## 3. Core Mechanics & Architecture

### 3.1. Timer Management (`background.js`)
- **State:** The background script maintains an in-memory `timers` object keyed by `tabId`.
- **Execution:** Uses `setInterval` to tick down the countdown every second.
- **Persistence:** Progress (`refreshDone`) is synced to `chrome.storage.local` under the `sessions` key so the popup can display active sessions across tabs.
- **Reliability:** In MV3, service workers can go to sleep. Currently, the extension relies on `setInterval` keeping the worker alive. If long-term reliability issues occur in the future, consider migrating to `chrome.alarms`.

### 3.2. Stealth Mode
A key differentiating feature designed to mimic human behavior and evade bot detection (e.g., Fiverr).
- **Jitter:** Applies a randomized `±20%` variance to the chosen interval time.
- **Cache Evasion:** Skips `bypassCache: true` (which sends a `Cache-Control: no-cache` header that servers can detect). Uses standard soft reloads instead.
- **Human Activity Injection (`injectHumanActivity`):** Uses `chrome.scripting.executeScript` to inject a function that fires realistic `MouseEvent` (mousemove), `window.scrollBy`, and `KeyboardEvent` (Shift key) events.
- **Heartbeat:** Runs a periodic activity heartbeat every 55–75 seconds between refreshes to keep real-time connections (WebSockets) alive.

### 3.3. Page Change Monitor
- Injects a content script via `chrome.scripting.executeScript` (`monitorPageChange`).
- Reads the text of a specific CSS selector (or `document.body.innerText`).
- Waits 1.5 seconds after load, compares current text to initial text.
- If changed, it sends a `pageChanged` message to the background script to optionally stop the timer.

### 3.4. Promise Handling & Chrome APIs
- **Critical Convention:** All Chrome APIs that return Promises in MV3 (e.g., `chrome.tabs.reload`, `chrome.tabs.update`, `chrome.action.setBadgeText`, `chrome.scripting.executeScript`) **must** be wrapped with `.catch(() => {})` or the `safePromise()` helper.
- **Why:** If a tab is closed by the user while a timer is running, Chrome immediately rejects any API calls targeting that tab. Unhandled rejections will crash the promise chain and throw `Uncaught (in promise)` errors in the service worker console.
- **Example:**
  ```javascript
  // BAD: Throws error if tab is closed
  chrome.action.setBadgeText({ text: '10', tabId });
  
  // GOOD: Swallows the rejection safely
  safePromise(chrome.action.setBadgeText({ text: '10', tabId }));
  ```

## 4. UI State Management (`popup.js`)

- Uses a global `state` object to hold all form inputs.
- `loadState()` retrieves saved settings from `chrome.storage.local`.
- `saveState()` writes changes back to storage immediately on interaction.
- `renderAll()` is called to sync the DOM with the `state` object.
- **Inter-script Communication:** The popup sends messages like `{ action: 'startRefresh', ...state, tabId }` to `background.js` to initiate timers. It also listens for `refreshDone` events to update its counters dynamically.

## 5. Development Guidelines for Agents

When assisting with this project, strictly adhere to these rules:
1. **No Build Tools:** Do not introduce npm, Webpack, Babel, TypeScript, or Tailwind. Keep it vanilla HTML/CSS/JS.
2. **MV3 Restrictions:** Remember that `background.js` is a Service Worker. There is no access to the `window` or `document` objects natively. All DOM manipulation must happen via `chrome.scripting.executeScript` or inside `popup.js`.
3. **Graceful Degradation:** Always check `chrome.runtime.lastError` in callbacks or handle rejected Promises. Tab states change rapidly (users close/switch tabs).
4. **CSS Naming:** The CSS uses simple, flat class names (BEM-ish but relaxed). Rely on CSS variables defined in `:root` for colors to maintain the dark theme consistency.

---
*Generated by Antigravity IDE Agent.*
