# Refreshly

> A lightweight Chrome extension that keeps your tabs fresh — automatically, intelligently, and on your schedule.

---

## Overview

**Refreshly** is a Manifest V3 Chrome extension built for power users who need precise control over page reloading. Whether you are monitoring a live dashboard, tracking stock prices, or staying active on a platform, Refreshly gives you the tools to automate page refreshes without ever touching the keyboard.

---

## Features

### Interval Modes
- **Predefined Intervals** — Choose from preset durations ranging from 5 seconds to 2 hours.
- **Custom Interval** — Set a precise refresh time using hours, minutes, and seconds.
- **Random Interval** — Refresh within a configurable min–max range for natural variation.

### Refresh Behaviour
- **Immediate First Refresh** — The page is reloaded the moment you press Start, with no waiting for the first interval to elapse.
- **Refresh Limit** — Stop automatically after a set number of refreshes.
- **Hard Refresh** — Bypass the browser cache on reload (`Cache-Control: no-cache`).
- **Scroll to Top** — Automatically scroll the page to the top after each reload.
- **Focus Tab on Refresh** — Bring the tab into focus before each reload.

### Stealth Mode
A dedicated mode designed for natural, human-like browsing patterns:
- Applies **±20% random jitter** to every interval, including fixed and custom durations.
- **Disables the hard-refresh header** — requests are indistinguishable from a normal user pressing F5.
- **Injects human activity simulation** after each reload: randomised mouse movements across the viewport, a subtle scroll gesture, and a harmless keyboard event.
- Runs an independent **activity heartbeat** every 55–75 seconds between refreshes to keep real-time connections (WebSockets, presence systems) alive.

### One-Shot Timer
Set a countdown after which the page refreshes exactly once — useful for scheduled reloads.

### Multi-Tab Session Management
- View all active refresh sessions across tabs in one place.
- Stop individual sessions or clear all at once.
- Manual page refreshes in **Random mode** automatically pick a new random interval.

### Page Change Monitor
- Detect when page content changes after a reload.
- Optionally stop refreshing automatically when a change is detected.
- Target specific elements using a CSS selector.

### Badge Countdown
A live countdown badge on the extension icon shows the seconds remaining until the next refresh.

---

## Installation

> **No technical knowledge required!** Just follow the steps below — it takes less than 2 minutes.

---

### Step 1 — Download Refreshly

1. Go to the Refreshly GitHub page: [github.com/TharindaMarasingha](https://github.com/TharindaMarasingha)
2. Find the **Refreshly** repository and open it.
3. Click the green **`< > Code`** button near the top-right of the page.
4. Select **Download ZIP** from the dropdown.
5. Save the ZIP file somewhere easy to find (e.g. your Desktop).

---

### Step 2 — Extract the ZIP

1. Find the downloaded ZIP file (e.g. `Refreshly-main.zip`).
2. **Right-click** it and choose **Extract All…** (Windows) or double-click it (Mac).
3. Choose a destination folder and click **Extract**.
4. You should now have a folder called `Refreshly-main` (or similar).

---

### Step 3 — Load into Chrome

1. Open **Google Chrome**.
2. In the address bar, type `chrome://extensions` and press **Enter**.
3. In the top-right corner of that page, turn on the **Developer mode** toggle.

   > ⚠️ Don't worry — this is safe! Developer mode simply allows you to install extensions from your own computer instead of the Chrome Web Store.

4. Click the **Load unpacked** button that appears on the left.
5. In the file picker, navigate to and select the **Refreshly-main** folder you extracted in Step 2.
6. Click **Select Folder**.

✅ **Done!** The Refreshly icon will appear in your Chrome toolbar. Click it to start auto-refreshing pages.

---

### Troubleshooting

| Problem | Fix |
|---|---|
| "Load unpacked" button not visible | Make sure **Developer mode** is turned **on** (top-right toggle) |
| Extension doesn't appear in toolbar | Click the 🧩 puzzle icon in Chrome's toolbar, then pin Refreshly |
| Nothing happens when I click Start | Make sure you are on a regular web page (not `chrome://` pages) |
| Extension disappeared after Chrome update | Go back to `chrome://extensions` and click the **reload ↺** icon on the Refreshly card |

---

### Permissions Explained

Chrome will ask for these permissions — here is exactly what each one does and why it is needed:

| Permission | Plain-English Meaning |
|---|---|
| `tabs` | Lets Refreshly see which tab you want to refresh |
| `storage` | Remembers your settings (interval, options) between sessions |
| `activeTab` | Lets Refreshly act on the tab you currently have open |
| `scripting` | Needed for Stealth Mode and page change detection |
| `alarms` | Keeps timers running reliably in the background |
| `<all_urls>` | Allows Refreshly to work on any website you visit |


---

## Project Structure

```
Refreshly/
├── manifest.json       # Extension manifest (MV3)
├── background.js       # Service worker — timer logic, stealth engine, session management
├── popup.html          # Extension popup UI
├── popup.js            # UI state, event binding, message passing
├── popup.css           # Styles
└── icons/              # Extension icons (16, 48, 128px)
```

---

## Configuration Reference

| Setting | Default | Description |
|---|---|---|
| Interval Mode | Predefined | How the refresh interval is determined |
| Interval | 30s | Duration between refreshes |
| Random Min / Max | 10s / 60s | Bounds for random interval mode |
| Hard Refresh | Off | Bypass browser cache on each reload |
| Stealth Mode | Off | Human-like jitter, activity simulation, soft reload |
| Refresh Limit | Off | Stop after N refreshes |
| Focus Tab | Off | Switch to the tab before refreshing |
| Scroll to Top | Off | Scroll to top after each reload |
| Show Badge | On | Display countdown on extension icon |
| Auto-start | Off | Resume refreshing when the popup opens |

---

## Development

This extension uses no build tools or external dependencies. All logic is written in vanilla JavaScript targeting the Chrome Extension Manifest V3 API.

To make changes:
1. Edit the relevant source file.
2. Go to `chrome://extensions` and click the **reload icon** on the **Refreshly** card.
3. Reopen the popup to see your changes.

---

## License

MIT — free to use, modify, and distribute.

---

## Developer

Built with ♥️ by **Tharinda Marasingha** — [tharinda.me](https://tharinda.me) · [GitHub](https://github.com/TharindaMarasingha)

