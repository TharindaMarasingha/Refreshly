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
    focusTab, scrollTop, monitorEnabled, monitorSelector, stopOnChange
  } = opts;

  stopRefresh(tabId);

  const getInterval = () => {
    if (mode === 'random') {
      const min = randomMin || 10;
      const max = randomMax || 60;
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    return interval;
  };

  let currentInterval = getInterval();
  let countdown = currentInterval;
  let refreshDone = 0;

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
        if (hardRefresh) {
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

  timers[tabId] = {
    intervalId: tick,
    countdown,
    interval: currentInterval,
    refreshDone,
    options: opts,
  };
}

function stopRefresh(tabId) {
  if (timers[tabId]) {
    clearInterval(timers[tabId].intervalId);
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
