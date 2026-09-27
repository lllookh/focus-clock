(function () {
  'use strict';

  const STORAGE_KEY = 'focusClockData_v1';
  const SETTINGS_KEY = 'focusClockSettings_v1';
  const CUSTOM_AUDIO_KEY = 'focusClockCustomAudio_v1';
  const GITHUB_ACCOUNT_KEY = 'focusClockGitHub_v1';

  const defaultSettings = {
    duration: 90,
    loopDuration: 5,
    interval: '5-7',
    customIntervalMin: 5,
    customIntervalMax: 7,
    volume: 70,
    sound: 'ding',
    customAudioName: null,
    brightness: 100
  };

  let state = {
    view: 'home',
    duration: 90,
    remaining: 90 * 60,
    totalSeconds: 90 * 60,
    isRunning: false,
    isPaused: false,
    lastTick: 0,
    nextIntervalMark: 0,
    audioCtx: null,
    timerId: null,
    records: [],
    restDuration: 5,
    restRemaining: 5 * 60,
    restTotalSeconds: 5 * 60,
    isRestRunning: false,
    isRestPaused: false,
    restTimerId: null
  };

  let pendingEndSound = false;
  let pendingIntervalSound = false;

  let githubAccount = null; // { token, login, avatar_url }

  let settings = { ...defaultSettings };
  let customAudioBase64 = null;

  // DOM refs
  const views = {
    home: document.getElementById('view-home'),
    focus: document.getElementById('view-focus'),
    'rest-setup': document.getElementById('view-rest-setup'),
    rest: document.getElementById('view-rest'),
    settings: document.getElementById('view-settings')
  };

  const els = {
    homeTodayMinutes: document.getElementById('home-today-minutes'),
    todayRecords: document.getElementById('today-records'),
    currentTime: document.getElementById('current-time'),
    currentDate: document.getElementById('current-date'),
    durationInput: document.getElementById('duration-input'),
    presetButtons: document.querySelectorAll('.preset-btn'),
    focusTime: document.getElementById('focus-time'),
    focusStatus: document.getElementById('focus-status'),
    ringProgress: document.getElementById('ring-progress'),
    timerBall: document.getElementById('timer-ball'),
    iconPause: document.getElementById('icon-pause'),
    iconResume: document.getElementById('icon-resume'),
    btnPauseText: document.getElementById('btn-pause-text'),
    volumeValue: document.getElementById('volume-value'),
    brightnessValue: document.getElementById('brightness-value'),
    toast: document.getElementById('toast'),
    customIntervalRow: document.getElementById('custom-interval-row'),
    customIntervalMin: document.getElementById('custom-interval-min'),
    customIntervalMax: document.getElementById('custom-interval-max'),
    customAudioInfo: document.getElementById('custom-audio-info'),
    customAudioName: document.getElementById('custom-audio-name'),
    restTime: document.getElementById('rest-time'),
    restStatus: document.getElementById('rest-status'),
    restRingProgress: document.getElementById('rest-ring-progress'),
    restBall: document.getElementById('rest-ball'),
    iconRestPause: document.getElementById('icon-rest-pause'),
    iconRestResume: document.getElementById('icon-rest-resume'),
    btnRestPauseText: document.getElementById('btn-rest-pause-text'),
    restDurationInput: document.getElementById('rest-duration-input'),
    encouragementOverlay: document.getElementById('encouragement-overlay'),
    encouragementText: document.querySelector('.encouragement-text'),
    recordsList: document.getElementById('records-list'),
    accountInfo: document.getElementById('account-info'),
    accountLogin: document.getElementById('account-login'),
    accountAvatar: document.getElementById('account-avatar'),
    accountName: document.getElementById('account-name'),
    githubToken: document.getElementById('github-token'),
    btnLogin: document.getElementById('btn-login'),
    btnLogout: document.getElementById('btn-logout'),
    btnSync: document.getElementById('btn-sync'),
    syncStatus: document.getElementById('sync-status')
  };

  const settingEls = {
    duration: document.getElementById('setting-duration'),
    loop: document.getElementById('setting-loop'),
    interval: document.getElementById('setting-interval'),
    volume: document.getElementById('setting-volume'),
    sound: document.getElementById('setting-sound'),
    brightness: document.getElementById('setting-brightness'),
    customAudio: document.getElementById('setting-custom-audio')
  };

  const statEls = {
    today: document.getElementById('stats-today'),
    week: document.getElementById('stats-week'),
    total: document.getElementById('stats-total'),
    minutes: document.getElementById('stats-minutes')
  };

  // Helpers
  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function formatTime(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${pad(m)}:${pad(s)}`;
  }

  function getTodayKey(date = new Date()) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function getWeekStart(date = new Date()) {
    const d = new Date(date);
    const day = d.getDay() || 7;
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - day + 1);
    return d;
  }

  function showToast(message) {
    const t = els.toast;
    t.textContent = message;
    t.hidden = false;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => { t.hidden = true; }, 200);
    }, 2200);
  }

  // Persistence
  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.records)) state.records = parsed.records;
      }
    } catch (e) {
      console.warn('读取数据失败', e);
    }
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        settings = { ...defaultSettings, ...parsed };
      }
    } catch (e) {
      console.warn('读取设置失败', e);
    }
    try {
      customAudioBase64 = localStorage.getItem(CUSTOM_AUDIO_KEY) || null;
    } catch (e) {
      console.warn('读取自定义音频失败', e);
    }
    try {
      const raw = localStorage.getItem(GITHUB_ACCOUNT_KEY);
      if (raw) githubAccount = JSON.parse(raw);
    } catch (e) {
      console.warn('读取 GitHub 账号失败', e);
    }
  }

  function saveGitHubAccount() {
    try {
      if (githubAccount) {
        localStorage.setItem(GITHUB_ACCOUNT_KEY, JSON.stringify(githubAccount));
      } else {
        localStorage.removeItem(GITHUB_ACCOUNT_KEY);
      }
    } catch (e) {
      console.warn('保存 GitHub 账号失败', e);
    }
  }

  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ records: state.records }));
    } catch (e) {
      console.warn('保存数据失败', e);
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn('保存设置失败', e);
    }
  }

  // Stats
  function countForDay(key) {
    return state.records.filter(r => r.date === key).length;
  }

  function countForWeek() {
    const start = getWeekStart();
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return state.records.filter(r => {
      const d = new Date(r.timestamp);
      return d >= start && d <= end;
    }).length;
  }

  function getTodayMinutes() {
    const todayKey = getTodayKey();
    return state.records
      .filter(r => r.date === todayKey)
      .reduce((sum, r) => sum + (r.actualMinutes || r.plannedMinutes || 0), 0);
  }

  function renderTodayRecords() {
    const todayKey = getTodayKey();
    const todayRecords = state.records
      .filter(r => r.date === todayKey)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    els.homeTodayMinutes.textContent = todayRecords.reduce((sum, r) => sum + (r.actualMinutes || r.plannedMinutes || 0), 0);
    els.todayRecords.innerHTML = '';

    if (todayRecords.length === 0) return;

    todayRecords.forEach((record, index) => {
      const item = document.createElement('div');
      item.className = 'today-record';
      // 只有最新一条播放入场动画，其余直接可见
      if (index > 0) {
        item.style.opacity = '1';
        item.style.transform = 'translateX(0)';
        item.style.animation = 'none';
      }
      const d = new Date(record.timestamp);
      const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      const minutes = record.actualMinutes || record.plannedMinutes || 0;
      const status = record.endedEarly ? ' · 提前结束' : '';
      item.innerHTML = `
        <time>${timeStr}</time>
        <span class="record-duration">${minutes} 分钟</span>
        <span>${status}</span>
      `;
      els.todayRecords.appendChild(item);
    });
  }

  function updateStats() {
    const todayKey = getTodayKey();
    const todayCount = countForDay(todayKey);
    const weekCount = countForWeek();
    const totalCount = state.records.length;
    const totalMinutes = Math.floor(state.records.reduce((sum, r) => sum + (r.actualMinutes || r.plannedMinutes || 0), 0));

    statEls.today.textContent = todayCount;
    statEls.week.textContent = weekCount;
    statEls.total.textContent = totalCount;
    statEls.minutes.textContent = totalMinutes;
    renderTodayRecords();
  }

  function renderRecordsList() {
    const list = els.recordsList;
    list.innerHTML = '';
    const sorted = [...state.records].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 50);
    if (sorted.length === 0) {
      list.innerHTML = '<div class="records-empty">暂无专注记录</div>';
      return;
    }
    sorted.forEach(record => {
      const item = document.createElement('div');
      item.className = 'record-item';
      const d = new Date(record.timestamp);
      const dateStr = `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      const minutes = record.actualMinutes || record.plannedMinutes || 0;
      const status = record.endedEarly ? '提前结束' : '已完成';
      item.innerHTML = `
        <div class="record-info">
          <span class="record-date">${dateStr}</span>
          <span class="record-meta">${minutes} 分钟 · ${status}</span>
        </div>
        <button class="btn btn-ghost record-delete" data-id="${record.id}" aria-label="删除这条记录">删除</button>
      `;
      list.appendChild(item);
    });
    list.querySelectorAll('.record-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id, 10);
        if (confirm('确定删除这条专注记录吗？')) {
          deleteRecord(id);
        }
      });
    });
  }

  function addRecord(endedEarly = false) {
    const now = new Date();
    const elapsedSeconds = state.totalSeconds - state.remaining;
    const actualMinutes = Math.max(1, Math.round(elapsedSeconds / 60));
    state.records.push({
      id: now.getTime(),
      timestamp: now.toISOString(),
      date: getTodayKey(now),
      plannedMinutes: state.duration,
      actualMinutes,
      endedEarly
    });
    saveData();
    updateStats();
    renderRecordsList();
    renderTodayRecords();
    if (githubAccount) syncToGist();
  }

  function deleteRecord(id) {
    state.records = state.records.filter(r => r.id !== id);
    saveData();
    updateStats();
    renderRecordsList();
    renderTodayRecords();
    if (githubAccount) syncToGist();
  }

  // GitHub Account & Gist Sync
  async function githubApi(path, options = {}) {
    const res = await fetch(`https://api.github.com${path}`, {
      ...options,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${githubAccount.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.headers || {})
      }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `GitHub API ${res.status}`);
    }
    return res.json();
  }

  async function fetchGitHubUser(token) {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    if (!res.ok) throw new Error('Token 无效或网络错误');
    return res.json();
  }

  async function loginWithToken(token) {
    try {
      const user = await fetchGitHubUser(token);
      githubAccount = { token, login: user.login, avatar_url: user.avatar_url };
      saveGitHubAccount();
      updateAccountUI();
      showToast(`已登录 GitHub：${user.login}`);
      await syncFromGist();
    } catch (e) {
      showToast(`登录失败：${e.message}`);
    }
  }

  function logout() {
    githubAccount = null;
    saveGitHubAccount();
    updateAccountUI();
    showToast('已退出登录');
  }

  function updateAccountUI() {
    if (githubAccount) {
      els.accountInfo.hidden = false;
      els.accountLogin.hidden = true;
      els.accountAvatar.src = githubAccount.avatar_url;
      els.accountAvatar.alt = githubAccount.login;
      els.accountName.textContent = githubAccount.login;
      els.btnSync.disabled = false;
    } else {
      els.accountInfo.hidden = true;
      els.accountLogin.hidden = false;
      els.accountAvatar.src = '';
      els.accountAvatar.alt = '';
      els.accountName.textContent = '';
      els.btnSync.disabled = true;
      els.syncStatus.textContent = '';
      els.githubToken.value = '';
    }
  }

  function buildSyncPayload() {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      records: state.records,
      settings: {
        duration: settings.duration,
        loopDuration: settings.loopDuration,
        interval: settings.interval,
        customIntervalMin: settings.customIntervalMin,
        customIntervalMax: settings.customIntervalMax,
        volume: settings.volume,
        sound: settings.sound,
        brightness: settings.brightness
      }
    };
  }

  async function findSyncGist() {
    const gists = await githubApi('/gists');
    return gists.find(g => g.description === '专注时钟数据同步' && g.files['focus-clock-data.json']);
  }

  async function syncToGist() {
    if (!githubAccount) return;
    els.syncStatus.textContent = '正在同步...';
    try {
      const payload = buildSyncPayload();
      const existing = await findSyncGist();
      if (existing) {
        await githubApi(`/gists/${existing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: '专注时钟数据同步',
            files: {
              'focus-clock-data.json': {
                content: JSON.stringify(payload, null, 2)
              }
            }
          })
        });
      } else {
        await githubApi('/gists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: '专注时钟数据同步',
            public: false,
            files: {
              'focus-clock-data.json': {
                content: JSON.stringify(payload, null, 2)
              }
            }
          })
        });
      }
      els.syncStatus.textContent = `上次同步：${new Date().toLocaleTimeString()}`;
      showToast('已同步到 GitHub Gist');
    } catch (e) {
      els.syncStatus.textContent = `同步失败：${e.message}`;
      showToast(`同步失败：${e.message}`);
    }
  }

  async function syncFromGist() {
    if (!githubAccount) return;
    els.syncStatus.textContent = '正在拉取云端数据...';
    try {
      const existing = await findSyncGist();
      if (!existing) {
        els.syncStatus.textContent = '未找到云端数据，将自动创建';
        await syncToGist();
        return;
      }
      const file = existing.files['focus-clock-data.json'];
      const content = await fetch(file.raw_url).then(r => r.text());
      const data = JSON.parse(content);
      if (Array.isArray(data.records)) {
        state.records = mergeRecords(state.records, data.records);
        saveData();
        updateStats();
        renderRecordsList();
        renderTodayRecords();
      }
      if (data.settings) {
        settings = { ...defaultSettings, ...data.settings };
        saveSettings();
        applySettingsToUI();
      }
      els.syncStatus.textContent = `已同步：${new Date().toLocaleTimeString()}`;
      showToast('已从 GitHub Gist 同步');
    } catch (e) {
      els.syncStatus.textContent = `拉取失败：${e.message}`;
      showToast(`拉取失败：${e.message}`);
    }
  }

  function mergeRecords(local, remote) {
    const map = new Map();
    local.forEach(r => map.set(r.id, r));
    remote.forEach(r => map.set(r.id, r));
    return Array.from(map.values()).sort((a, b) => a.id - b.id);
  }

  function applySettingsToUI() {
    settingEls.duration.value = settings.duration;
    settingEls.loop.value = settings.loopDuration;
    settingEls.interval.value = settings.interval;
    settingEls.volume.value = settings.volume;
    settingEls.sound.value = settings.sound;
    settingEls.brightness.value = settings.brightness;
    els.customIntervalMin.value = settings.customIntervalMin;
    els.customIntervalMax.value = settings.customIntervalMax;
    els.durationInput.value = settings.duration;
    els.volumeValue.textContent = `${settings.volume}%`;
    els.brightnessValue.textContent = `${settings.brightness}%`;
    applyBrightness();
  }

  // Audio
  function initAudio() {
    if (!state.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) state.audioCtx = new AudioContext();
    }
    if (state.audioCtx && state.audioCtx.state === 'suspended') {
      state.audioCtx.resume();
    }
  }

  function playTone({ freq1, freq2, duration, delay = 0, type = 'sine', vol }) {
    if (!state.audioCtx) return;
    const t = state.audioCtx.currentTime + delay;
    const osc1 = state.audioCtx.createOscillator();
    const osc2 = freq2 ? state.audioCtx.createOscillator() : null;
    const gain = state.audioCtx.createGain();
    const master = state.audioCtx.createGain();

    master.gain.value = Math.max(0, Math.min(1, vol));

    osc1.type = type;
    osc1.frequency.setValueAtTime(freq1, t);
    osc1.connect(gain);

    if (osc2) {
      osc2.type = type;
      osc2.frequency.setValueAtTime(freq2, t);
      osc2.connect(gain);
    }

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.5, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    gain.connect(master);
    master.connect(state.audioCtx.destination);

    osc1.start(t);
    osc1.stop(t + duration + 0.05);
    if (osc2) {
      osc2.start(t);
      osc2.stop(t + duration + 0.05);
    }
  }

  function playCustomAudio() {
    if (!customAudioBase64) return false;
    try {
      const audio = new Audio(customAudioBase64);
      audio.volume = Math.max(0, Math.min(1, settings.volume / 100));
      audio.play().catch(() => {});
      return true;
    } catch (e) {
      return false;
    }
  }

  function playIntervalSound() {
    if (playCustomAudio()) return;
    const vol = settings.volume / 100;
    switch (settings.sound) {
      case 'bell':
        playTone({ freq1: 880, duration: 0.9, vol, type: 'sine' });
        setTimeout(() => playTone({ freq1: 1109, duration: 0.9, vol, type: 'sine' }), 5000);
        break;
      case 'chime':
        playTone({ freq1: 523.25, freq2: 659.25, duration: 1.2, vol, type: 'sine' });
        setTimeout(() => playTone({ freq1: 659.25, freq2: 783.99, duration: 1.2, vol, type: 'sine' }), 5000);
        break;
      case 'digital':
        playTone({ freq1: 1200, duration: 0.15, vol, type: 'square' });
        setTimeout(() => playTone({ freq1: 1200, duration: 0.15, vol, type: 'square' }), 5000);
        break;
      case 'ding':
      default:
        playTone({ freq1: 1109, duration: 0.18, vol, type: 'sine' });
        setTimeout(() => playTone({ freq1: 1760, duration: 0.35, vol, type: 'sine' }), 5000);
        break;
    }
  }

  function playEndSound() {
    if (playCustomAudio()) return;
    const vol = settings.volume / 100;
    switch (settings.sound) {
      case 'bell':
        playTone({ freq1: 880, duration: 1.2, vol, type: 'sine' });
        setTimeout(() => playTone({ freq1: 1109, duration: 1.5, vol, type: 'sine' }), 400);
        break;
      case 'chime':
        playTone({ freq1: 523.25, freq2: 659.25, duration: 1.4, vol, type: 'sine' });
        setTimeout(() => playTone({ freq1: 659.25, freq2: 783.99, duration: 1.8, vol, type: 'sine' }), 500);
        break;
      case 'digital':
        playTone({ freq1: 1200, duration: 0.15, vol, type: 'square' });
        setTimeout(() => playTone({ freq1: 1200, duration: 0.15, vol, type: 'square' }), 180);
        setTimeout(() => playTone({ freq1: 1600, duration: 0.4, vol, type: 'square' }), 400);
        break;
      case 'ding':
      default:
        playTone({ freq1: 880, duration: 0.35, vol, type: 'sine' });
        setTimeout(() => playTone({ freq1: 1109, duration: 0.35, vol, type: 'sine' }), 250);
        setTimeout(() => playTone({ freq1: 1760, duration: 0.8, vol, type: 'sine' }), 550);
        break;
    }
  }

  function playOceanSound() {
    if (!state.audioCtx) return;
    const master = state.audioCtx.createGain();
    master.gain.setValueAtTime(0, state.audioCtx.currentTime);
    master.gain.linearRampToValueAtTime(settings.volume / 100 * 0.6, state.audioCtx.currentTime + 1.5);
    master.gain.setValueAtTime(settings.volume / 100 * 0.6, state.audioCtx.currentTime + 4);
    master.gain.linearRampToValueAtTime(0, state.audioCtx.currentTime + 6);
    master.connect(state.audioCtx.destination);

    const bufferSize = state.audioCtx.sampleRate * 6;
    const buffer = state.audioCtx.createBuffer(1, bufferSize, state.audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = state.audioCtx.createBufferSource();
    noise.buffer = buffer;

    const filter = state.audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.6;

    const lfo = state.audioCtx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.18;
    const lfoGain = state.audioCtx.createGain();
    lfoGain.gain.value = 250;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    filter.frequency.setValueAtTime(420, state.audioCtx.currentTime);

    noise.connect(filter);
    filter.connect(master);
    noise.start();
    lfo.start();
    noise.stop(state.audioCtx.currentTime + 6.2);
    lfo.stop(state.audioCtx.currentTime + 6.2);
  }

  // Timer
  function getRingRadius() {
    const radius = parseFloat(getComputedStyle(els.timerBall).getPropertyValue('--ring-radius'));
    return isNaN(radius) ? 100 : radius;
  }

  function updateTimerDisplay() {
    els.focusTime.textContent = formatTime(Math.max(0, state.remaining));

    const progress = state.totalSeconds > 0 ? state.remaining / state.totalSeconds : 0;
    const r = getRingRadius();
    const circumference = 2 * Math.PI * r;
    els.ringProgress.style.strokeDasharray = circumference;
    const offset = circumference * (1 - progress);
    els.ringProgress.style.strokeDashoffset = offset;

    const angle = 360 * (1 - progress);
    els.timerBall.style.transform = `rotate(${angle - 90}deg) translate(${r}px) rotate(${90 - angle}deg)`;
  }

  function parseIntervalRange() {
    if (settings.interval === '0' || settings.interval === 0) return null;
    if (settings.interval === 'custom') {
      const min = Math.min(settings.customIntervalMin, settings.customIntervalMax);
      const max = Math.max(settings.customIntervalMin, settings.customIntervalMax);
      return { min: Math.max(1, min), max: Math.max(1, max) };
    }
    const parts = String(settings.interval).split('-');
    if (parts.length === 2) {
      const min = parseInt(parts[0], 10);
      const max = parseInt(parts[1], 10);
      if (!isNaN(min) && !isNaN(max)) return { min, max };
    }
    return null;
  }

  function randomIntervalSeconds() {
    const range = parseIntervalRange();
    if (!range) return null;
    const minSec = range.min * 60;
    const maxSec = range.max * 60;
    return Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec;
  }

  function checkIntervalAlert() {
    if (!settings.interval || settings.interval === '0') return;
    const elapsed = state.totalSeconds - state.remaining;
    if (elapsed >= state.nextIntervalMark) {
      if (document.hidden) {
        pendingIntervalSound = true;
      } else {
        playIntervalSound();
      }
      const next = randomIntervalSeconds();
      state.nextIntervalMark = next ? elapsed + next : Number.MAX_SAFE_INTEGER;
    }
  }

  function tick() {
    if (!state.isRunning || state.isPaused) return;
    const now = Date.now();
    const delta = Math.floor((now - state.lastTick) / 1000);
    if (delta <= 0) return;

    state.lastTick = now;
    state.remaining = Math.max(0, state.remaining - delta);
    checkIntervalAlert();
    updateTimerDisplay();

    if (state.remaining <= 0) {
      completeFocus(false);
    }
  }

  function startTimer() {
    if (state.isRunning) return;
    state.isRunning = true;
    state.isPaused = false;
    state.lastTick = Date.now();
    const first = randomIntervalSeconds();
    state.nextIntervalMark = first || Number.MAX_SAFE_INTEGER;
    updatePauseUI();
    state.timerId = setInterval(tick, 250);
  }

  function stopTimer() {
    state.isRunning = false;
    state.isPaused = false;
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  // Rest Timer
  function prepareRestSetup() {
    els.restDurationInput.value = settings.loopDuration || 5;
    updateRestPresetButtons(settings.loopDuration || 5);
  }

  function updateRestPresetButtons(val) {
    document.querySelectorAll('.rest-presets .preset-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.min, 10) === val);
    });
  }

  function updateRestDisplay() {
    els.restTime.textContent = formatTime(Math.max(0, state.restRemaining));
    const progress = state.restTotalSeconds > 0 ? state.restRemaining / state.restTotalSeconds : 0;
    const r = getRingRadius();
    const circumference = 2 * Math.PI * r;
    els.restRingProgress.style.strokeDasharray = circumference;
    els.restRingProgress.style.strokeDashoffset = circumference * (1 - progress);
    const angle = 360 * (1 - progress);
    els.restBall.style.transform = `rotate(${angle - 90}deg) translate(${r}px) rotate(${90 - angle}deg)`;
  }

  function restTick() {
    if (!state.isRestRunning || state.isRestPaused) return;
    const now = Date.now();
    const delta = Math.floor((now - state.lastTick) / 1000);
    if (delta <= 0) return;
    state.lastTick = now;
    state.restRemaining = Math.max(0, state.restRemaining - delta);
    updateRestDisplay();
    if (state.restRemaining <= 0) {
      completeRest();
    }
  }

  function startRestTimer() {
    if (state.isRestRunning) return;
    state.isRestRunning = true;
    state.isRestPaused = false;
    state.lastTick = Date.now();
    updateRestPauseUI();
    state.restTimerId = setInterval(restTick, 250);
  }

  function stopRestTimer() {
    state.isRestRunning = false;
    state.isRestPaused = false;
    if (state.restTimerId) {
      clearInterval(state.restTimerId);
      state.restTimerId = null;
    }
  }

  function toggleRestPause() {
    if (!state.isRestRunning) return;
    state.isRestPaused = !state.isRestPaused;
    if (!state.isRestPaused) state.lastTick = Date.now();
    updateRestPauseUI();
  }

  function updateRestPauseUI() {
    if (state.isRestPaused) {
      els.restStatus.textContent = '已暂停';
      els.restStatus.classList.add('paused');
      els.btnRestPauseText.textContent = '继续';
      els.iconRestPause.hidden = true;
      els.iconRestResume.hidden = false;
    } else {
      els.restStatus.textContent = state.isRestRunning ? '休息中' : '准备开始';
      els.restStatus.classList.remove('paused');
      els.btnRestPauseText.textContent = '暂停';
      els.iconRestPause.hidden = false;
      els.iconRestResume.hidden = true;
    }
  }

  function resetRest(minutes) {
    state.restDuration = minutes;
    state.restTotalSeconds = minutes * 60;
    state.restRemaining = state.restTotalSeconds;
    stopRestTimer();
    updateRestDisplay();
    updateRestPauseUI();
  }

  function completeRest() {
    stopRestTimer();
    if (document.hidden) {
      pendingEndSound = true;
    } else {
      playOceanSound();
    }
    showEncouragement();
  }

  function showEncouragement() {
    els.encouragementOverlay.hidden = false;
    els.encouragementOverlay.classList.add('show');
    requestAnimationFrame(() => {
      els.encouragementText.classList.add('reveal');
    });
    setTimeout(() => {
      els.encouragementText.classList.remove('reveal');
      els.encouragementOverlay.classList.remove('show');
      els.encouragementOverlay.classList.add('hide');
      setTimeout(() => {
        els.encouragementOverlay.classList.remove('hide');
        els.encouragementOverlay.hidden = true;
        switchView('home');
      }, 600);
    }, 4800);
  }

  function togglePause() {
    if (!state.isRunning) return;
    state.isPaused = !state.isPaused;
    if (!state.isPaused) {
      state.lastTick = Date.now();
    }
    updatePauseUI();
  }

  function updatePauseUI() {
    if (state.isPaused) {
      els.focusStatus.textContent = '已暂停';
      els.focusStatus.classList.add('paused');
      els.btnPauseText.textContent = '继续';
      els.iconPause.hidden = true;
      els.iconResume.hidden = false;
    } else {
      els.focusStatus.textContent = state.isRunning ? '专注中' : '准备开始';
      els.focusStatus.classList.remove('paused');
      els.btnPauseText.textContent = '暂停';
      els.iconPause.hidden = false;
      els.iconResume.hidden = true;
    }
  }

  function completeFocus(endedEarly = false) {
    stopTimer();
    addRecord(endedEarly);
    if (document.hidden) {
      pendingEndSound = true;
    } else {
      playEndSound();
    }
    showToast(endedEarly ? '已结束本轮专注' : '恭喜完成本轮专注！');
    if (!endedEarly) {
      setTimeout(() => {
        prepareRestSetup();
        switchView('rest-setup');
      }, 1200);
    } else {
      setTimeout(() => switchView('home'), 1200);
    }
  }

  function resetFocus(minutes) {
    state.duration = minutes;
    state.totalSeconds = minutes * 60;
    state.remaining = state.totalSeconds;
    state.isRunning = false;
    state.isPaused = false;
    stopTimer();
    updateTimerDisplay();
    updatePauseUI();
  }

  // Views
  function switchView(name) {
    state.view = name;
    Object.values(views).forEach(el => el.hidden = true);
    views[name].hidden = false;
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    if (name === 'settings') {
      updateSettingsUI();
      renderRecordsList();
      updateAccountUI();
    }
  }

  function updateSettingsUI() {
    settingEls.duration.value = settings.duration;
    settingEls.loop.value = settings.loopDuration;
    settingEls.interval.value = settings.interval;
    settingEls.volume.value = settings.volume;
    settingEls.sound.value = settings.sound;
    settingEls.brightness.value = settings.brightness;
    els.customIntervalMin.value = settings.customIntervalMin;
    els.customIntervalMax.value = settings.customIntervalMax;
    els.volumeValue.textContent = `${settings.volume}%`;
    els.brightnessValue.textContent = `${settings.brightness}%`;
    els.customIntervalRow.hidden = settings.interval !== 'custom';
    if (settings.customAudioName && customAudioBase64) {
      els.customAudioName.textContent = settings.customAudioName;
      els.customAudioInfo.hidden = false;
    } else {
      els.customAudioInfo.hidden = true;
    }
    applyBrightness();
    updateStats();
  }

  function applyBrightness() {
    document.querySelector('.app-shell').style.filter = `brightness(${settings.brightness}%)`;
  }

  // Clock
  function updateClock() {
    const now = new Date();
    els.currentTime.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    els.currentDate.textContent = `${now.getMonth() + 1}月${now.getDate()}日`;
  }

  // Import / Export
  function exportData() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      records: state.records,
      settings
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `focus-clock-backup-${getTodayKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('数据已导出');
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (Array.isArray(data.records)) {
          state.records = data.records;
        }
        if (data.settings) {
          settings = { ...defaultSettings, ...data.settings };
        }
        saveData();
        saveSettings();
        updateStats();
        updateSettingsUI();
        renderTodayRecords();
        els.durationInput.value = settings.duration;
        showToast('数据导入成功');
      } catch (e) {
        showToast('导入失败：文件格式错误');
      }
    };
    reader.readAsText(file);
  }

  // Event bindings
  function bindEvents() {
    // Home
    document.getElementById('btn-start').addEventListener('click', () => {
      initAudio();
      const minutes = parseInt(els.durationInput.value, 10) || settings.duration;
      resetFocus(minutes);
      switchView('focus');
      startTimer();
    });

    document.getElementById('btn-home-settings').addEventListener('click', () => {
      switchView('settings');
    });

    els.presetButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        els.presetButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const min = parseInt(btn.dataset.min, 10);
        els.durationInput.value = min;
      });
    });

    els.durationInput.addEventListener('input', () => {
      const val = parseInt(els.durationInput.value, 10);
      els.presetButtons.forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.min, 10) === val);
      });
    });

    // Focus
    document.getElementById('btn-focus-settings').addEventListener('click', () => {
      switchView('settings');
    });

    document.getElementById('btn-pause').addEventListener('click', () => {
      initAudio();
      togglePause();
    });

    document.getElementById('btn-end').addEventListener('click', () => {
      if (confirm('确定要提前结束本轮专注吗？')) {
        stopTimer();
        completeFocus(true);
      }
    });

    document.getElementById('btn-end-now').addEventListener('click', () => {
      stopTimer();
      completeFocus(true);
    });

    // Rest Setup
    document.querySelectorAll('.rest-presets .preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.rest-presets .preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        els.restDurationInput.value = btn.dataset.min;
      });
    });

    els.restDurationInput.addEventListener('input', () => {
      const val = parseInt(els.restDurationInput.value, 10);
      updateRestPresetButtons(val);
    });

    document.getElementById('btn-start-rest').addEventListener('click', () => {
      initAudio();
      const minutes = parseInt(els.restDurationInput.value, 10) || 5;
      resetRest(minutes);
      switchView('rest');
      startRestTimer();
    });

    document.getElementById('btn-skip-rest').addEventListener('click', () => {
      switchView('home');
    });

    // Rest Timer
    document.getElementById('btn-rest-settings').addEventListener('click', () => {
      switchView('settings');
    });

    document.getElementById('btn-rest-pause').addEventListener('click', () => {
      initAudio();
      toggleRestPause();
    });

    document.getElementById('btn-rest-end').addEventListener('click', () => {
      stopRestTimer();
      switchView('home');
    });

    // Settings
    document.getElementById('btn-settings-back').addEventListener('click', () => {
      if (state.isRunning) switchView('focus');
      else if (state.isRestRunning) switchView('rest');
      else switchView('home');
    });

    settingEls.duration.addEventListener('change', () => {
      settings.duration = clamp(settingEls.duration.value, 1, 180);
      saveSettings();
      els.durationInput.value = settings.duration;
    });

    settingEls.loop.addEventListener('change', () => {
      settings.loopDuration = clamp(settingEls.loop.value, 0, 60);
      saveSettings();
    });

    settingEls.interval.addEventListener('change', () => {
      settings.interval = settingEls.interval.value;
      els.customIntervalRow.hidden = settings.interval !== 'custom';
      saveSettings();
    });

    els.customIntervalMin.addEventListener('change', () => {
      settings.customIntervalMin = clamp(els.customIntervalMin.value, 1, 180);
      saveSettings();
    });

    els.customIntervalMax.addEventListener('change', () => {
      settings.customIntervalMax = clamp(els.customIntervalMax.value, 1, 180);
      saveSettings();
    });

    settingEls.volume.addEventListener('input', () => {
      settings.volume = parseInt(settingEls.volume.value, 10);
      els.volumeValue.textContent = `${settings.volume}%`;
      saveSettings();
    });

    settingEls.sound.addEventListener('change', () => {
      settings.sound = settingEls.sound.value;
      saveSettings();
    });

    settingEls.brightness.addEventListener('input', () => {
      settings.brightness = parseInt(settingEls.brightness.value, 10);
      els.brightnessValue.textContent = `${settings.brightness}%`;
      applyBrightness();
      saveSettings();
    });

    document.getElementById('btn-test-sound').addEventListener('click', () => {
      initAudio();
      playIntervalSound();
    });

    settingEls.customAudio.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        showToast('音频文件过大，请上传 2MB 以内的文件');
        e.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        customAudioBase64 = reader.result;
        settings.customAudioName = file.name;
        try {
          localStorage.setItem(CUSTOM_AUDIO_KEY, customAudioBase64);
        } catch (err) {
          showToast('存储空间不足，无法保存自定义音频');
          customAudioBase64 = null;
          settings.customAudioName = null;
        }
        saveSettings();
        updateSettingsUI();
        showToast('自定义提示音已保存');
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    });

    document.getElementById('btn-clear-audio').addEventListener('click', () => {
      customAudioBase64 = null;
      settings.customAudioName = null;
      localStorage.removeItem(CUSTOM_AUDIO_KEY);
      saveSettings();
      updateSettingsUI();
      showToast('已恢复默认提示音');
    });

    document.getElementById('btn-export').addEventListener('click', exportData);

    document.getElementById('btn-import').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) importData(file);
      e.target.value = '';
    });

    document.getElementById('btn-clear').addEventListener('click', () => {
      if (confirm('确定要清除所有专注记录吗？此操作不可恢复。')) {
        state.records = [];
        saveData();
        updateStats();
        renderRecordsList();
        renderTodayRecords();
        if (githubAccount) syncToGist();
        showToast('数据已清除');
      }
    });

    // Account
    els.btnLogin.addEventListener('click', () => {
      const token = els.githubToken.value.trim();
      if (!token) {
        showToast('请输入 GitHub Token');
        return;
      }
      loginWithToken(token);
    });

    els.btnLogout.addEventListener('click', logout);
    els.btnSync.addEventListener('click', syncFromGist);

    // 切回页面时恢复音频并补发遗漏的提示音
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      initAudio();
      if (state.isRunning && !state.isPaused) {
        tick();
      }
      if (state.isRestRunning && !state.isRestPaused) {
        restTick();
      }
      if (pendingEndSound) {
        pendingEndSound = false;
        playEndSound();
      }
      if (pendingIntervalSound) {
        pendingIntervalSound = false;
        playIntervalSound();
      }
    });
  }

  function clamp(val, min, max) {
    const n = parseInt(val, 10) || min;
    return Math.max(min, Math.min(max, n));
  }

  // Init
  function init() {
    loadData();
    bindEvents();
    updateStats();
    renderRecordsList();
    updateAccountUI();
    updateClock();
    setInterval(updateClock, 1000);
    els.durationInput.value = settings.duration;
    applyBrightness();
    updateTimerDisplay();
    updatePauseUI();
    resetRest(settings.loopDuration || 5);
    updateRestDisplay();
    switchView('home');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
