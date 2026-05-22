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

function safePromise(p) {
  if (p && typeof p.catch === 'function') {
    p.catch(() => {});
  }
}

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
  let isAutoRefresh = false;

  // Immediate first refresh on start
  try {
    chrome.tabs.get(tabId).then((tab) => {
      if (!tab) return;
      if (focusTab) safePromise(chrome.tabs.update(tabId, { active: true }));
      isAutoRefresh = true;
      if (hardRefresh && !stealthMode) {
        safePromise(chrome.tabs.reload(tabId, { bypassCache: true }));
      } else {
        safePromise(chrome.tabs.reload(tabId));
      }
      refreshDone++;
      if (scrollTop) {
        setTimeout(() => {
          safePromise(chrome.scripting.executeScript({
            target: { tabId },
            func: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
          }));
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
      safePromise(chrome.runtime.sendMessage({ action: 'refreshDone', count: refreshDone, limitReached }));
      if (limitReached) {
        stopRefresh(tabId);
        chrome.storage.local.get(['sessions'], (result) => {
          const sessions = result.sessions || {};
          delete sessions[tabId];
          chrome.storage.local.set({ sessions });
        });
      }
    }).catch(() => {});
  } catch (e) {}

  if (showBadge) updateBadge(tabId, countdown);

  const tick = setInterval(() => {
    countdown--;
    if (showBadge) updateBadge(tabId, countdown);

    if (countdown <= 0) {
      try {
        chrome.tabs.get(tabId).then((tab) => {
          if (!tab) {
            stopRefresh(tabId);
            return;
          }

          if (focusTab) {
            safePromise(chrome.tabs.update(tabId, { active: true }));
          }

          if (timers[tabId]) timers[tabId].isAutoRefresh = true;
          if (hardRefresh && !stealthMode) {
            safePromise(chrome.tabs.reload(tabId, { bypassCache: true }));
          } else {
            safePromise(chrome.tabs.reload(tabId));
          }

          refreshDone++;

          if (scrollTop) {
            setTimeout(() => {
              safePromise(chrome.scripting.executeScript({
                target: { tabId },
                func: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
              }));
            }, 1500);
          }

          if (monitorEnabled) {
            setTimeout(() => {
              injectMonitor(tabId, { monitorSelector, stopOnChange });
            }, 2000);
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
          safePromise(chrome.runtime.sendMessage({
            action: 'refreshDone',
            count: refreshDone,
            limitReached,
          }));

          if (limitReached) {
            stopRefresh(tabId);
            chrome.storage.local.get(['sessions'], (result) => {
              const sessions = result.sessions || {};
              delete sessions[tabId];
              chrome.storage.local.set({ sessions });
            });
            return;
          }
        }).catch(() => {
          stopRefresh(tabId);
        });
      } catch (e) {
        stopRefresh(tabId);
      }

      currentInterval = getInterval();
      countdown = currentInterval;
      if (timers[tabId]) timers[tabId].interval = currentInterval;
    }

    if (timers[tabId]) {
      timers[tabId].countdown = countdown;
      timers[tabId].refreshDone = refreshDone;
    }
  }, 1000);

  let activityHeartbeat = null;
  if (stealthMode) {
    activityHeartbeat = setInterval(() => {
      injectHumanActivity(tabId);
    }, 55000 + Math.floor(Math.random() * 20000));
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

function stopRefresh(tabId, isClosed = false) {
  if (timers[tabId]) {
    clearInterval(timers[tabId].intervalId);
    if (timers[tabId].activityHeartbeat) clearInterval(timers[tabId].activityHeartbeat);
    delete timers[tabId];
  }
  if (!isClosed && tabId) {
    try {
      safePromise(chrome.action.setBadgeText({ text: '', tabId }));
    } catch(e) {}
  }
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
  try {
    safePromise(chrome.action.setBadgeText({ text, tabId }));
    safePromise(chrome.action.setBadgeBackgroundColor({ color: '#00c896', tabId }));
  } catch(e) {}
}

function injectMonitor(tabId, opts) {
  try {
    safePromise(chrome.scripting.executeScript({
      target: { tabId },
      func: monitorPageChange,
      args: [opts.monitorSelector, opts.stopOnChange],
    }));
  } catch(e) {}
}

function injectHumanActivity(tabId) {
  try {
    safePromise(chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        try {
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
          setTimeout(() => {
            const amount = 40 + Math.floor(Math.random() * 80);
            window.scrollBy({ top: amount, behavior: 'smooth' });
            setTimeout(() => window.scrollBy({ top: -amount, behavior: 'smooth' }), 800);
          }, 1200);
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
    }));
  } catch(e) {}
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
      try {
        const p = chrome.runtime.sendMessage({
          action: 'pageChanged',
          tabId: null,
          options: { stopOnChange }
        });
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch(e) {}
    }
    window[key] = false;
  }, 1500);
}

function handlePageChange(tabId, options) {
  if (options && options.stopOnChange && tabId) {
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
  stopRefresh(tabId, true); // true = isClosed, do not update badge
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
    t.isAutoRefresh = false;
    return;
  }

  const newInterval = t.getInterval();
  t.countdown = newInterval;
  t.interval = newInterval;
  if (t.showBadge) updateBadge(tabId, newInterval);
});
