'use strict';

// ─── Model Definitions ────────────────────────────────────────────────────────
const MODELS = {
  inferx: [
    { value: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash (fast, default)' },
    { value: 'deepseek-v3',       label: 'DeepSeek V3' },
  ],
  openai: [
    { value: 'gpt-4o-mini',  label: 'GPT-4o Mini (fast, cheap)' },
    { value: 'gpt-4o',       label: 'GPT-4o (best quality)' },
    { value: 'gpt-4-turbo',  label: 'GPT-4 Turbo' },
  ],
  gemini: [
    { value: 'gemini-1.5-flash',  label: 'Gemini 1.5 Flash (fast)' },
    { value: 'gemini-1.5-pro',    label: 'Gemini 1.5 Pro (best quality)' },
    { value: 'gemini-2.0-flash',  label: 'Gemini 2.0 Flash' },
  ],
};

const API_KEY_LINKS = {
  inferx: 'https://inferx.net',
  openai: 'https://platform.openai.com/api-keys',
  gemini: 'https://aistudio.google.com/app/apikey',
};

const API_KEY_PLACEHOLDERS = {
  inferx: 'ix_...',
  openai: 'sk-...',
  gemini: 'AIza...',
};

const API_KEY_PREFIXES = {
  inferx: 'ix_',
  openai: 'sk-',
  gemini: 'AIza',
};

// ─── State ────────────────────────────────────────────────────────────────────
let currentProvider = 'inferx';

// ─── DOM References ───────────────────────────────────────────────────────────
const providerBtns   = document.querySelectorAll('.provider-btn');
const modelSelect    = document.getElementById('model-select');
const apiKeyInput    = document.getElementById('api-key-input');
const toggleKeyBtn   = document.getElementById('toggle-key-visibility');
const getKeyLink     = document.getElementById('get-key-link');
const saveBtn        = document.getElementById('save-btn');
const statusMsg      = document.getElementById('status-msg');
const tabBtns        = document.querySelectorAll('.tab-btn');
const historyList    = document.getElementById('history-list');
const historyEmpty   = document.getElementById('history-empty');
const clearHistoryBtn = document.getElementById('clear-history-btn');

// ─── Provider Switching ───────────────────────────────────────────────────────
function setProvider(provider) {
  currentProvider = provider;

  providerBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.provider === provider);
  });

  populateModelSelect(provider);

  if (getKeyLink) {
    getKeyLink.href = API_KEY_LINKS[provider] ?? '#';
    const providerLabel = { inferx: 'InferX', openai: 'OpenAI', gemini: 'Gemini' }[provider] ?? provider;
    getKeyLink.textContent = `Get a ${providerLabel} API key →`;
  }

  if (apiKeyInput) {
    apiKeyInput.placeholder = API_KEY_PLACEHOLDERS[provider] ?? 'API key...';
  }
}

function populateModelSelect(provider) {
  if (!modelSelect) return;
  modelSelect.innerHTML = '';
  (MODELS[provider] ?? []).forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.value;
    opt.textContent = m.label;
    modelSelect.appendChild(opt);
  });
}

providerBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    setProvider(btn.dataset.provider);
    // Clear API key field when switching providers
    if (apiKeyInput) apiKeyInput.value = '';
  });
});

// ─── Key Visibility Toggle ────────────────────────────────────────────────────
toggleKeyBtn?.addEventListener('click', () => {
  if (!apiKeyInput) return;
  const isHidden = apiKeyInput.type === 'password';
  apiKeyInput.type = isHidden ? 'text' : 'password';
  toggleKeyBtn.setAttribute('aria-label', isHidden ? 'Hide API key' : 'Show API key');
});

// ─── Tab Switching ────────────────────────────────────────────────────────────
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    document.querySelectorAll('.tab-content').forEach(tc => tc.classList.add('hidden'));
    const target = document.getElementById(`content-${btn.dataset.tab}`);
    target?.classList.remove('hidden');

    if (btn.dataset.tab === 'history') loadHistory();
  });
});

// ─── Save Settings ────────────────────────────────────────────────────────────
saveBtn?.addEventListener('click', () => {
  const apiKey = apiKeyInput?.value.trim();
  const model  = modelSelect?.value;

  if (!apiKey) {
    showStatus('Please enter an API key.', 'error');
    return;
  }

  // Basic format validation
  const expectedPrefix = API_KEY_PREFIXES[currentProvider];
  if (expectedPrefix && !apiKey.startsWith(expectedPrefix)) {
    const providerLabel = { inferx: 'InferX', openai: 'OpenAI', gemini: 'Gemini' }[currentProvider] ?? currentProvider;
    showStatus(`${providerLabel} keys start with "${expectedPrefix}". Check your key.`, 'error');
    return;
  }

  chrome.storage.local.set(
    { apiKey, provider: currentProvider, model },
    () => {
      showStatus('✓ Settings saved!', 'success');
      setTimeout(() => statusMsg?.classList.add('hidden'), 2500);
    }
  );
});

// ─── History ──────────────────────────────────────────────────────────────────
function loadHistory() {
  chrome.storage.local.get({ analysisHistory: [] }, ({ analysisHistory }) => {
    if (!historyList || !historyEmpty || !clearHistoryBtn) return;

    if (analysisHistory.length === 0) {
      historyEmpty.classList.remove('hidden');
      historyList.classList.add('hidden');
      clearHistoryBtn.classList.add('hidden');
      return;
    }

    historyEmpty.classList.add('hidden');
    historyList.classList.remove('hidden');
    clearHistoryBtn.classList.remove('hidden');

    historyList.innerHTML = '';
    analysisHistory.forEach(entry => {
      const li = document.createElement('li');
      li.className = 'history-item';
      li.innerHTML = `
        <div class="history-item-title">${entry.problemTitle ?? entry.titleSlug?.replace(/-/g, ' ') ?? '—'}</div>
        <div class="history-item-meta">
          <span class="history-meta-tag">${entry.language ?? '—'}</span>
          ${entry.timeComplexity ? `<span class="history-meta-tag">T: ${entry.timeComplexity}</span>` : ''}
          ${entry.spaceComplexity ? `<span class="history-meta-tag">S: ${entry.spaceComplexity}</span>` : ''}
          ${entry.efficiencyRating ? `<span class="history-meta-tag">${entry.efficiencyRating}/10</span>` : ''}
          ${entry.usage?.totalTokens ? `<span class="history-meta-tag">⚡ ${entry.usage.totalTokens}t</span>` : ''}
        </div>
        <div class="history-item-date">${formatDate(entry.timestamp)}</div>
      `;
      historyList.appendChild(li);
    });
  });
}

clearHistoryBtn?.addEventListener('click', () => {
  if (confirm('Clear all analysis history?')) {
    chrome.storage.local.set({ analysisHistory: [] }, loadHistory);
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function showStatus(message, type) {
  if (!statusMsg) return;
  statusMsg.textContent = message;
  statusMsg.className = `status-msg ${type}`;
  statusMsg.classList.remove('hidden');
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// ─── Token Logger Stats ──────────────────────────────────────────────────────
function loadTokenStats() {
  chrome.storage.local.get({
    tokenLoggerStats: { totalTokens: 0, totalAnalyses: 0, avgTokens: 0 }
  }, ({ tokenLoggerStats }) => {
    const avgEl   = document.getElementById('stat-avg-tokens');
    const totalEl = document.getElementById('stat-total-tokens');
    const callsEl = document.getElementById('stat-total-calls');

    if (avgEl)   avgEl.textContent   = tokenLoggerStats.avgTokens ? `${tokenLoggerStats.avgTokens}t` : '0t';
    if (totalEl) totalEl.textContent = tokenLoggerStats.totalTokens > 999 
      ? `${(tokenLoggerStats.totalTokens / 1000).toFixed(1)}k` 
      : `${tokenLoggerStats.totalTokens}t`;
    if (callsEl) callsEl.textContent = tokenLoggerStats.totalAnalyses ?? 0;
  });
}

// Listen for tokenLoggerStats changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.tokenLoggerStats) {
    loadTokenStats();
  }
});

// ─── Load Saved Settings on Open ─────────────────────────────────────────────
chrome.storage.local.get(
  { apiKey: '', provider: 'inferx', model: 'deepseek-v4-flash' },
  ({ apiKey, provider, model }) => {
    setProvider(provider);
    if (modelSelect && model) modelSelect.value = model;
    if (apiKeyInput && apiKey) apiKeyInput.value = apiKey;
    loadTokenStats();
  }
);
