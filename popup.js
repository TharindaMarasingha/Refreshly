// State
let state = {
  isRunning: false,
  mode: 'predefined',
  intervalSeconds: 30,
  customH: 0, customM: 0, customS: 30,
  randomMin: 10, randomMax: 60,
  activeTabOnly: false,
  autoStart: false,
  showBadge: true,
  hardRefresh: false,
  refreshLimitEnabled: false,
  refreshLimitCount: 10,
  refreshDoneCount: 0,
  focusTab: false,
  scrollTop: false,
  monitorEnabled: false,
  playSound: false,
  stopOnChange: true,
  monitorSelector: '',
  currentTab: 'interval',
  timerRunning: false,
  timerEnd: null,
  countdown: 0,
};

let timerInterval = null;

// Init
document.addEventListener('DOMContentLoaded', async () => {
  await loadState();
  renderAll();
  bindEvents();
  startCountdownDisplay();
});

// ─── Storage ────────────────────────────────────────────────────────────────

async function loadState() {
  return new Promise(resolve => {
    chrome.storage.local.get(['arState'], (result) => {
      if (result.arState) Object.assign(state, result.arState);
      resolve();
    });
  });
}

function saveState() {
  chrome.storage.local.set({ arState: state });
}

// ─── Render ─────────────────────────────────────────────────────────────────

function renderAll() {
  renderStartBtn();
  renderModeCards();
  renderPresets();
  renderSections();
  renderToggles();
  renderStatusBar();
  renderTabsList();
  renderRefreshCounter();
}

function renderStartBtn() {
  const btn = document.getElementById('startBtn');
  const icon = document.getElementById('startIcon');
  const label = document.getElementById('startLabel');
  if (state.isRunning) {
    btn.classList.add('running');
    label.textContent = 'Stop';
    icon.setAttribute('d', 'M3 3h3v8H3zM8 3h3v8H8z');
  } else {
    btn.classList.remove('running');
    label.textContent = 'Start';
    icon.setAttribute('d', 'M3 2l8 5-8 5V2z');
  }
}

function renderModeCards() {
  document.querySelectorAll('.mode-card').forEach(card => {
    card.classList.toggle('active', card.dataset.mode === state.mode);
  });
}

function renderPresets() {
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.seconds) === state.intervalSeconds);
  });
}

function renderSections() {
  document.getElementById('predefined-section').classList.toggle('hidden', state.mode !== 'predefined');
  document.getElementById('custom-section').classList.toggle('hidden', state.mode !== 'custom');
  document.getElementById('random-section').classList.toggle('hidden', state.mode !== 'random');

  document.getElementById('customHours').value = state.customH;
  document.getElementById('customMinutes').value = state.customM;
  document.getElementById('customSeconds').value = state.customS;
  document.getElementById('randomMin').value = state.randomMin;
  document.getElementById('randomMax').value = state.randomMax;
}

function renderToggles() {
  setToggle('activeTabToggle', state.activeTabOnly);
  setToggle('autoStartToggle', state.autoStart);
  setToggle('badgeToggle', state.showBadge);
  setToggle('hardRefreshToggle', state.hardRefresh);
  setToggle('refreshLimitToggle', state.refreshLimitEnabled);
  setToggle('focusTabToggle', state.focusTab);
  setToggle('scrollTopToggle', state.scrollTop);
  setToggle('monitorToggle', state.monitorEnabled);
  setToggle('soundToggle', state.playSound);
  setToggle('stopOnChangeToggle', state.stopOnChange);

  document.getElementById('monitorSelector').value = state.monitorSelector || '';
  document.getElementById('refreshLimitCount').value = state.refreshLimitCount || 10;

  // Show/hide refresh limit input
  document.getElementById('refreshLimitInput').classList.toggle('hidden', !state.refreshLimitEnabled);
}

function setToggle(id, value) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('active', !!value);
}

function renderStatusBar() {
  const dot = document.querySelector('.status-info .status-dot');
  const info = document.querySelector('.status-info span');
  if (state.isRunning) {
    dot.className = 'status-dot active';
    const secs = getEffectiveInterval();
    let label = `Refreshing every ${formatSecs(secs)}`;
    if (state.hardRefresh) label += ' · Hard';
    info.textContent = label;
  } else {
    dot.className = 'status-dot inactive';
    info.textContent = 'Idle';
    document.getElementById('nextRefresh').textContent = '';
  }
}

function renderRefreshCounter() {
  const el = document.getElementById('refreshDoneCount');
  if (el) el.textContent = state.refreshDoneCount || 0;
}

function renderTabsList() {
  chrome.storage.local.get(['sessions'], (result) => {
    const sessions = result.sessions || {};
    const container = document.getElementById('tabsList');
    const keys = Object.keys(sessions);
    if (!keys.length) {
      container.innerHTML = '<div class="empty-state">No active refresh sessions.<br/>Start refreshing from the Interval tab.</div>';
      return;
    }
    container.innerHTML = keys.map(tabId => {
      const s = sessions[tabId];
      const badges = [];
      if (s.hardRefresh) badges.push('<span class="session-badge hard">Hard</span>');
      if (s.refreshLimit) badges.push(`<span class="session-badge limit">${s.refreshDone||0}/${s.refreshLimit}</span>`);
      return `
        <div class="tab-session">
          <div class="tab-session-info">
            <div class="tab-session-title">${escapeHtml(s.title || 'Tab #' + tabId)} ${badges.join('')}</div>
            <div class="tab-session-interval">Every ${formatSecs(s.interval)}</div>
          </div>
          <button class="tab-session-stop" data-tabid="${tabId}">Stop</button>
        </div>`;
    }).join('');
    container.querySelectorAll('.tab-session-stop').forEach(btn => {
      btn.addEventListener('click', () => stopSession(parseInt(btn.dataset.tabid)));
    });
  });
}

// ─── Events ─────────────────────────────────────────────────────────────────

function bindEvents() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.getElementById('startBtn').addEventListener('click', toggleRefresh);

  document.querySelectorAll('.mode-card').forEach(card => {
    card.addEventListener('click', () => {
      state.mode = card.dataset.mode;
      renderModeCards();
      renderSections();
      saveState();
    });
  });

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.intervalSeconds = parseInt(btn.dataset.seconds);
      renderPresets();
      saveState();
      if (state.isRunning) restartRefresh();
    });
  });

  ['customHours','customMinutes','customSeconds'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
      state.customH = parseInt(document.getElementById('customHours').value) || 0;
      state.customM = parseInt(document.getElementById('customMinutes').value) || 0;
      state.customS = parseInt(document.getElementById('customSeconds').value) || 0;
      saveState();
      if (state.isRunning) restartRefresh();
    });
  });

  document.getElementById('randomMin').addEventListener('change', e => {
    state.randomMin = parseInt(e.target.value) || 5;
    saveState();
  });
  document.getElementById('randomMax').addEventListener('change', e => {
    state.randomMax = parseInt(e.target.value) || 60;
    saveState();
  });

  // Toggles
  bindToggle('activeTabToggle', 'activeTabOnly');
  bindToggle('autoStartToggle', 'autoStart');
  bindToggle('badgeToggle', 'showBadge');
  bindToggle('focusTabToggle', 'focusTab');
  bindToggle('scrollTopToggle', 'scrollTop');
  bindToggle('monitorToggle', 'monitorEnabled');
  bindToggle('soundToggle', 'playSound');
  bindToggle('stopOnChangeToggle', 'stopOnChange');

  // Hard refresh toggle
  document.getElementById('hardRefreshToggle').addEventListener('click', () => {
    state.hardRefresh = !state.hardRefresh;
    setToggle('hardRefreshToggle', state.hardRefresh);
    saveState();
    if (state.isRunning) restartRefresh();
  });

  // Refresh limit toggle
  document.getElementById('refreshLimitToggle').addEventListener('click', () => {
    state.refreshLimitEnabled = !state.refreshLimitEnabled;
    setToggle('refreshLimitToggle', state.refreshLimitEnabled);
    document.getElementById('refreshLimitInput').classList.toggle('hidden', !state.refreshLimitEnabled);
    if (!state.refreshLimitEnabled) {
      state.refreshDoneCount = 0;
      renderRefreshCounter();
    }
    saveState();
  });

  document.getElementById('refreshLimitCount').addEventListener('change', e => {
    state.refreshLimitCount = parseInt(e.target.value) || 10;
    state.refreshDoneCount = 0;
    renderRefreshCounter();
    saveState();
  });

  document.getElementById('monitorSelector').addEventListener('change', e => {
    state.monitorSelector = e.target.value;
    saveState();
  });

  document.getElementById('timerStartBtn').addEventListener('click', toggleTimer);
  document.getElementById('stopAllBtn').addEventListener('click', stopAllSessions);
}

function bindToggle(id, stateKey) {
  document.getElementById(id).addEventListener('click', () => {
    state[stateKey] = !state[stateKey];
    setToggle(id, state[stateKey]);
    saveState();
  });
}

function switchTab(tabName) {
  state.currentTab = tabName;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
  document.querySelectorAll('.tab-panel').forEach(p => {
    p.classList.toggle('hidden', p.id !== 'tab-' + tabName);
  });
  if (tabName === 'tabs') renderTabsList();
}

// ─── Core Refresh Logic ──────────────────────────────────────────────────────

async function toggleRefresh() {
  if (state.isRunning) {
    await stopRefresh();
  } else {
    await startRefresh();
  }
}

async function startRefresh() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  const interval = getEffectiveInterval();
  state.isRunning = true;
  state.countdown = interval;
  state.refreshDoneCount = 0;
  saveState();
  renderRefreshCounter();

  chrome.storage.local.get(['sessions'], (result) => {
    const sessions = result.sessions || {};
    sessions[tab.id] = {
      title: tab.title,
      url: tab.url,
      interval: interval,
      tabId: tab.id,
      startedAt: Date.now(),
      hardRefresh: state.hardRefresh,
      refreshLimit: state.refreshLimitEnabled ? state.refreshLimitCount : 0,
      refreshDone: 0,
    };
    chrome.storage.local.set({ sessions });
  });

  chrome.runtime.sendMessage({
    action: 'startRefresh',
    tabId: tab.id,
    interval: interval,
    hardRefresh: state.hardRefresh,
    refreshLimitEnabled: state.refreshLimitEnabled,
    refreshLimitCount: state.refreshLimitCount,
    focusTab: state.focusTab,
    scrollTop: state.scrollTop,
    monitorEnabled: state.monitorEnabled,
    monitorSelector: state.monitorSelector,
    stopOnChange: state.stopOnChange,
    showBadge: state.showBadge,
    mode: state.mode,
    randomMin: state.randomMin,
    randomMax: state.randomMax,
  });

  renderStartBtn();
  renderStatusBar();
}

async function stopRefresh() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  state.isRunning = false;
  state.countdown = 0;
  saveState();

  if (tab) {
    chrome.runtime.sendMessage({ action: 'stopRefresh', tabId: tab.id });
    chrome.storage.local.get(['sessions'], (result) => {
      const sessions = result.sessions || {};
      delete sessions[tab.id];
      chrome.storage.local.set({ sessions });
    });
    chrome.action.setBadgeText({ text: '', tabId: tab.id });
  }

  renderStartBtn();
  renderStatusBar();
  document.getElementById('nextRefresh').textContent = '';
}

async function restartRefresh() {
  await stopRefresh();
  await startRefresh();
}

function stopSession(tabId) {
  chrome.runtime.sendMessage({ action: 'stopRefresh', tabId });
  chrome.storage.local.get(['sessions'], (result) => {
    const sessions = result.sessions || {};
    delete sessions[tabId];
    chrome.storage.local.set({ sessions }, () => renderTabsList());
  });
  try { chrome.action.setBadgeText({ text: '', tabId }); } catch(e) {}
}

async function stopAllSessions() {
  chrome.runtime.sendMessage({ action: 'stopAll' });
  chrome.storage.local.set({ sessions: {} }, () => renderTabsList());
  state.isRunning = false;
  saveState();
  renderStartBtn();
  renderStatusBar();
}

// ─── Refresh done callback from background ────────────────────────────────

chrome.runtime.onMessage && chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'refreshDone') {
    state.refreshDoneCount = msg.count;
    renderRefreshCounter();
    if (msg.limitReached) {
      state.isRunning = false;
      saveState();
      renderStartBtn();
      renderStatusBar();
    }
  }
});

// ─── Timer ───────────────────────────────────────────────────────────────────

function toggleTimer() {
  const btn = document.getElementById('timerStartBtn');
  if (state.timerRunning) {
    clearInterval(timerInterval);
    state.timerRunning = false;
    state.timerEnd = null;
    document.getElementById('timerDisplay').textContent = 'Ready';
    btn.textContent = 'Start Timer';
    saveState();
    return;
  }

  const h = parseInt(document.getElementById('timerHours').value) || 0;
  const m = parseInt(document.getElementById('timerMinutes').value) || 0;
  const s = parseInt(document.getElementById('timerSeconds').value) || 0;
  const totalSecs = h * 3600 + m * 60 + s;
  if (!totalSecs) return;

  state.timerRunning = true;
  state.timerEnd = Date.now() + totalSecs * 1000;
  btn.textContent = 'Cancel Timer';
  saveState();

  timerInterval = setInterval(async () => {
    const remaining = Math.ceil((state.timerEnd - Date.now()) / 1000);
    if (remaining <= 0) {
      clearInterval(timerInterval);
      state.timerRunning = false;
      document.getElementById('timerDisplay').textContent = 'Refreshing!';
      btn.textContent = 'Start Timer';
      saveState();
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        if (state.hardRefresh) {
          chrome.tabs.reload(tab.id, { bypassCache: true });
        } else {
          chrome.tabs.reload(tab.id);
        }
      }
      setTimeout(() => document.getElementById('timerDisplay').textContent = 'Ready', 2000);
    } else {
      document.getElementById('timerDisplay').textContent = formatCountdown(remaining);
    }
  }, 500);
}

// ─── Countdown Display ───────────────────────────────────────────────────────

function startCountdownDisplay() {
  setInterval(async () => {
    if (!state.isRunning) return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    chrome.runtime.sendMessage({ action: 'getCountdown', tabId: tab.id }, (response) => {
      if (chrome.runtime.lastError) return;
      if (response && response.countdown !== undefined) {
        const t = response.countdown;
        document.getElementById('nextRefresh').textContent = t > 0 ? `Next: ${formatCountdown(t)}` : '';
      }
    });
  }, 1000);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getEffectiveInterval() {
  if (state.mode === 'custom') {
    return (state.customH * 3600) + (state.customM * 60) + (state.customS || 1);
  }
  if (state.mode === 'random') {
    const min = state.randomMin || 10;
    const max = state.randomMax || 60;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  return state.intervalSeconds || 30;
}

function formatSecs(s) {
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm ' + (s % 60 ? (s % 60) + 's' : '');
  return Math.floor(s / 3600) + 'h ' + (Math.floor((s % 3600) / 60) ? Math.floor((s % 3600) / 60) + 'm' : '');
}

function formatCountdown(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

function pad(n) { return String(n).padStart(2, '0'); }
function escapeHtml(s) { return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
