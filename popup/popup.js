'use strict';

// ─── PASTE YOUR OPENROUTER API KEY HERE ──────────────────────────────────────
// Get your free key at: https://openrouter.ai/keys
// It starts with "sk-or-v1-"
const DEFAULT_OPENROUTER_KEY = ''; // Add your key here or enter it in the popup
// ─────────────────────────────────────────────────────────────────────────────

// ─── Model Definitions ────────────────────────────────────────────────────────
const MODELS = [
  { value: 'dots-studio/dots-3-note-preview:free', label: 'DoTS-3 Note Preview (free)' },
  { value: 'google/gemma-4-26b-a4b-it:free', label: 'Google Gemma 4 26B (free)' },
  { value: 'liquid/lfm-2.5-2.6b:free', label: 'LiquidAI LFM 2.5 (free)' },
  { value: 'nvidia/nemotron-3.5-lightning:free', label: 'NVIDIA Nemotron 3.5 (free)' },
];

// ─── DOM References ───────────────────────────────────────────────────────────
const modelSelect = document.getElementById('model-select');
const apiKeyInput = document.getElementById('api-key-input');
const toggleKeyBtn = document.getElementById('toggle-key-visibility');
const saveBtn = document.getElementById('save-btn');
const statusMsg = document.getElementById('status-msg');
const tabBtns = document.querySelectorAll('.tab-btn');
const historyList = document.getElementById('history-list');
const historyEmpty = document.getElementById('history-empty');
const clearHistoryBtn = document.getElementById('clear-history-btn');

// ─── Populate Model Dropdown ──────────────────────────────────────────────────
function populateModelSelect() {
  if (!modelSelect) return;
  modelSelect.innerHTML = '';
  MODELS.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.value;
    opt.textContent = m.label;
    modelSelect.appendChild(opt);
  });
}

populateModelSelect();

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
  const model = modelSelect?.value;

  if (!apiKey) {
    showStatus('Please enter an OpenRouter API key.', 'error');
    return;
  }

  if (!apiKey.startsWith('sk-or-v1-')) {
    showStatus('OpenRouter keys start with "sk-or-v1-". Check your key.', 'error');
    return;
  }

  chrome.storage.local.set(
    { apiKey, provider: 'openrouter', model },
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
    const avgEl = document.getElementById('stat-avg-tokens');
    const totalEl = document.getElementById('stat-total-tokens');
    const callsEl = document.getElementById('stat-total-calls');

    if (avgEl) avgEl.textContent = tokenLoggerStats.avgTokens ? `${tokenLoggerStats.avgTokens}t` : '0t';
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
  { apiKey: '', provider: 'openrouter', model: 'dots-studio/dots-3-note-preview:free' },
  ({ apiKey, model }) => {
    const validModelValues = MODELS.map(m => m.value);
    if (!validModelValues.includes(model)) {
      model = 'dots-studio/dots-3-note-preview:free';
      chrome.storage.local.set({ model });
    }
    if (modelSelect && model) modelSelect.value = model;

    // If no key is saved yet, auto-persist the default so the background
    // script always has a key — fixes "Missing Authentication header" on first run.
    if (!apiKey) {
      apiKey = DEFAULT_OPENROUTER_KEY;
      chrome.storage.local.set({ apiKey, provider: 'openrouter' });
    }

    if (apiKeyInput) apiKeyInput.value = apiKey;
    loadTokenStats();
  }
);
