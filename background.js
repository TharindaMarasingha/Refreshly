// Background Service Worker
const timers = {}; // tabId -> { intervalId, countdown, interval, options, refreshDone }

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'startRefresh') {
    startRefresh(msg);
    sendResponse({ ok: true });
  }
  else if (msg.action === 'stopRefresh') {
    stopRefresh(msg.tabId);
    sendResponse({ ok: true });
  }
  else if (msg.action === 'stopAll') {
    stopAll();
    sendResponse({ ok: true });
  }
  else if (msg.action === 'getCountdown') {
    const t = timers[msg.tabId];
    sendResponse({ countdown: t ? t.countdown : 0 });
  }
  else if (msg.action === 'pageChanged') {
    handlePageChange(msg.tabId, msg.options);
    sendResponse({ ok: true });
  }
  return true;
});

function startRefresh(opts) {
  const {
    tabId, interval, showBadge, mode, randomMin, randomMax,
    hardRefresh, refreshLimitEnabled, refreshLimitCount,
    focusTab, scrollTop, monitorEnabled, monitorSelector, stopOnChange,
    stealthMode
  } = opts;

  stopRefresh(tabId);

  const getInterval = () => {
    let base;
    if (mode === 'random') {
      const min = randomMin || 10;
      const max = randomMax || 60;
      base = Math.floor(Math.random() * (max - min + 1)) + min;
    } else {
      base = interval;
    }
    // Stealth: add ±20% human-like jitter to every interval
    if (stealthMode) {
      const jitter = base * 0.2;
      base = Math.round(base + (Math.random() * jitter * 2 - jitter));
    }
    return Math.max(base, 1);
  };

  let currentInterval = getInterval();
  let countdown = currentInterval;
  let refreshDone = 0;
  let isAutoRefresh = false; // flag to distinguish extension reloads from manual ones

  // Immediate first refresh on start
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) return;
    if (focusTab) chrome.tabs.update(tabId, { active: true });
    isAutoRefresh = true;
    // Stealth: never send Cache-Control: no-cache header (hard refresh is detectable)
    if (hardRefresh && !stealthMode) {
      chrome.tabs.reload(tabId, { bypassCache: true });
    } else {
      chrome.tabs.reload(tabId);
    }
    refreshDone++;
    if (scrollTop) {
      setTimeout(() => {
        chrome.scripting.executeScript({
          target: { tabId },
          func: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
        }).catch(() => {});
      }, 1500);
    }
    if (monitorEnabled) {
      setTimeout(() => injectMonitor(tabId, { monitorSelector, stopOnChange }), 2000);
    }
    if (stealthMode) {
      setTimeout(() => injectHumanActivity(tabId), 2500);
    }
    chrome.storage.local.get(['sessions'], (result) => {
      const sessions = result.sessions || {};
      if (sessions[tabId]) {
        sessions[tabId].refreshDone = refreshDone;
        chrome.storage.local.set({ sessions });
      }
    });
    const limitReached = refreshLimitEnabled && refreshDone >= refreshLimitCount;
    chrome.runtime.sendMessage({ action: 'refreshDone', count: refreshDone, limitReached }).catch(() => {});
    if (limitReached) {
      stopRefresh(tabId);
      chrome.storage.local.get(['sessions'], (result) => {
        const sessions = result.sessions || {};
        delete sessions[tabId];
        chrome.storage.local.set({ sessions });
      });
    }
  });

  if (showBadge) updateBadge(tabId, countdown);

  const tick = setInterval(() => {
    countdown--;
    if (showBadge) updateBadge(tabId, countdown);

    if (countdown <= 0) {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError || !tab) {
          stopRefresh(tabId);
          return;
        }

        // Focus tab if enabled
        if (focusTab) {
          chrome.tabs.update(tabId, { active: true });
        }

        // Hard Refresh (bypass cache) or normal refresh
        // Stealth: skip bypassCache — the no-cache header is detectable by servers
        if (timers[tabId]) timers[tabId].isAutoRefresh = true;
        if (hardRefresh && !stealthMode) {
          chrome.tabs.reload(tabId, { bypassCache: true });
        } else {
          chrome.tabs.reload(tabId);
        }

        refreshDone++;

        // Scroll to top after reload
        if (scrollTop) {
          setTimeout(() => {
            chrome.scripting.executeScript({
              target: { tabId },
              func: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
            }).catch(() => {});
          }, 1500);
        }

        // Monitor injection
        if (monitorEnabled) {
          setTimeout(() => {
            injectMonitor(tabId, { monitorSelector, stopOnChange });
          }, 2000);
        }
        // Stealth: simulate human activity after each reload
        if (stealthMode) {
          setTimeout(() => injectHumanActivity(tabId), 2500);
        }

        // Update session in storage
        chrome.storage.local.get(['sessions'], (result) => {
          const sessions = result.sessions || {};
          if (sessions[tabId]) {
            sessions[tabId].refreshDone = refreshDone;
            chrome.storage.local.set({ sessions });
          }
        });

        // Notify popup of refresh count
        const limitReached = refreshLimitEnabled && refreshDone >= refreshLimitCount;
        chrome.runtime.sendMessage({
          action: 'refreshDone',
          count: refreshDone,
          limitReached,
        }).catch(() => {});

        // Stop if limit reached
        if (limitReached) {
          stopRefresh(tabId);
          chrome.storage.local.get(['sessions'], (result) => {
            const sessions = result.sessions || {};
            delete sessions[tabId];
            chrome.storage.local.set({ sessions });
          });
          return;
        }
      });

      currentInterval = getInterval();
      countdown = currentInterval;
      if (timers[tabId]) timers[tabId].interval = currentInterval;
    }

    if (timers[tabId]) {
      timers[tabId].countdown = countdown;
      timers[tabId].refreshDone = refreshDone;
    }
  }, 1000);

  // Stealth: periodic activity heartbeat between refreshes (every ~60s)
  let activityHeartbeat = null;
  if (stealthMode) {
    activityHeartbeat = setInterval(() => {
      injectHumanActivity(tabId);
    }, 55000 + Math.floor(Math.random() * 20000)); // 55–75s, randomised
  }

  timers[tabId] = {
    intervalId: tick,
    activityHeartbeat,
    countdown,
    interval: currentInterval,
    refreshDone,
    isAutoRefresh,
    getInterval,
    showBadge,
    options: opts,
  };
}

function stopRefresh(tabId) {
  if (timers[tabId]) {
    clearInterval(timers[tabId].intervalId);
    if (timers[tabId].activityHeartbeat) clearInterval(timers[tabId].activityHeartbeat);
    delete timers[tabId];
  }
  try { chrome.action.setBadgeText({ text: '', tabId }); } catch(e) {}
}

function stopAll() {
  Object.keys(timers).forEach(tabId => stopRefresh(parseInt(tabId)));
}

function updateBadge(tabId, seconds) {
  let text = '';
  if (seconds <= 0) {
    text = '↻';
  } else if (seconds < 60) {
    text = String(seconds);
  } else {
    text = Math.ceil(seconds / 60) + 'm';
  }
  chrome.action.setBadgeText({ text, tabId });
  chrome.action.setBadgeBackgroundColor({ color: '#00c896', tabId });
}

function injectMonitor(tabId, opts) {
  chrome.scripting.executeScript({
    target: { tabId },
    func: monitorPageChange,
    args: [opts.monitorSelector, opts.stopOnChange],
  }).catch(() => {});
}

// Stealth Mode: inject realistic human activity events into the page
function injectHumanActivity(tabId) {
  chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      try {
        // Random mouse positions across the visible viewport
        const moves = 4 + Math.floor(Math.random() * 4);
        for (let i = 0; i < moves; i++) {
          setTimeout(() => {
            const x = Math.floor(Math.random() * window.innerWidth);
            const y = Math.floor(Math.random() * window.innerHeight);
            document.dispatchEvent(new MouseEvent('mousemove', {
              bubbles: true, cancelable: true,
              clientX: x, clientY: y,
              screenX: x + window.screenX, screenY: y + window.screenY
            }));
          }, i * (300 + Math.floor(Math.random() * 400)));
        }
        // Subtle scroll — small random amount, then back
        setTimeout(() => {
          const amount = 40 + Math.floor(Math.random() * 80);
          window.scrollBy({ top: amount, behavior: 'smooth' });
          setTimeout(() => window.scrollBy({ top: -amount, behavior: 'smooth' }), 800);
        }, 1200);
        // Fire a non-destructive keydown (Shift) to signal keyboard presence
        setTimeout(() => {
          document.dispatchEvent(new KeyboardEvent('keydown', {
            bubbles: true, cancelable: true, key: 'Shift', code: 'ShiftLeft', shiftKey: true
          }));
          document.dispatchEvent(new KeyboardEvent('keyup', {
            bubbles: true, cancelable: true, key: 'Shift', code: 'ShiftLeft', shiftKey: false
          }));
        }, 2000);
      } catch(e) {}
    },
  }).catch(() => {});
}

function monitorPageChange(selector, stopOnChange) {
  const key = '__arProMonitor__';
  if (window[key]) return;
  window[key] = true;

  const getContent = () => {
    if (selector) {
      const el = document.querySelector(selector);
      return el ? el.innerText + el.innerHTML : '';
    }
    return document.body ? document.body.innerText.substring(0, 2000) : '';
  };

  const initial = getContent();
  setTimeout(() => {
    const current = getContent();
    if (current !== initial) {
      chrome.runtime.sendMessage({
        action: 'pageChanged',
        tabId: null,
        options: { stopOnChange }
      });
    }
    window[key] = false;
  }, 1500);
}

function handlePageChange(tabId, options) {
  if (options && options.stopOnChange) {
    stopRefresh(tabId);
    chrome.storage.local.get(['sessions'], (result) => {
      const sessions = result.sessions || {};
      delete sessions[tabId];
      chrome.storage.local.set({ sessions });
    });
  }
}

// Cleanup on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  stopRefresh(tabId);
  chrome.storage.local.get(['sessions'], (result) => {
    const sessions = result.sessions || {};
    if (sessions[tabId]) {
      delete sessions[tabId];
      chrome.storage.local.set({ sessions });
    }
  });
});

// Detect manual refreshes: pick a new random interval and reset countdown
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'loading') return;
  const t = timers[tabId];
  if (!t) return;

  if (t.isAutoRefresh) {
    // This was triggered by the extension — clear the flag and ignore
    t.isAutoRefresh = false;
    return;
  }

  // Manual refresh detected — pick a new random interval and reset countdown
  const newInterval = t.getInterval();
  t.countdown = newInterval;
  t.interval = newInterval;
  if (t.showBadge) updateBadge(tabId, newInterval);
});
