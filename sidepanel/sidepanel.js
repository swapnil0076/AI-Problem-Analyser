/**
 * sidepanel.js — Side panel UI controller.
 *
 * Listens to chrome.storage.onChanged for 'latestAnalysis'
 * (set by background.js) and renders the appropriate state.
 */

'use strict';

// ─── Complexity Color Classifier ──────────────────────────────────────────────
function complexityColor(notation) {
  if (!notation) return 'purple';
  const n = notation.toLowerCase().replace(/\s/g, '');
  if (n === 'o(1)')        return 'green';
  if (n === 'o(logn)')     return 'blue';
  if (n === 'o(n)')        return 'blue';
  if (n === 'o(nlogn)')    return 'amber';
  if (n === 'o(n²)' || n === 'o(n^2)') return 'red';
  if (n.includes('2^n') || n.includes('n!')) return 'red';
  return 'purple';
}

// ─── Rating Tier ─────────────────────────────────────────────────────────────
function ratingTier(score) {
  if (score <= 3) return { cls: 'low',    label: 'Needs significant improvement' };
  if (score <= 5) return { cls: 'medium', label: 'Acceptable but improvable' };
  if (score <= 7) return { cls: 'good',   label: 'Good solution' };
  return               { cls: 'great',  label: 'Excellent — near optimal' };
}

// ─── State Management ─────────────────────────────────────────────────────────
const STATES = ['state-empty', 'state-loading', 'state-unsupported', 'state-error', 'state-results'];

/** Stores current analysis payload so the Dry Run button can reference it */
let _currentAnalysis = null;

function showState(id) {
  STATES.forEach(s => {
    const el = document.getElementById(s);
    if (el) el.classList.toggle('hidden', s !== id);
  });
}

// ─── Render Functions ─────────────────────────────────────────────────────────
function renderLoading(data) {
  // Update header if we know the problem
  if (data.titleSlug) {
    set('problem-title', data.titleSlug.replace(/-/g, ' '));
  }
  showState('state-loading');
}

function renderResults(data) {
  // Header
  set('problem-title', data.problemTitle ?? data.titleSlug?.replace(/-/g, ' ') ?? '—');
  const badge = document.getElementById('difficulty-badge');
  if (badge) {
    const d = (data.difficulty ?? '').toLowerCase();
    badge.textContent = data.difficulty ?? '';
    badge.className = `difficulty-badge ${d}`;
  }

  // Cache indicator
  toggle('cache-badge', !!data._fromCache);

  // Token usage indicator
  const tokenBadge = document.getElementById('token-badge');
  if (tokenBadge && data.usage && data.usage.totalTokens > 0) {
    const { promptTokens, completionTokens, totalTokens } = data.usage;
    tokenBadge.textContent = `⚡ ${totalTokens} tokens`;
    tokenBadge.title = `Prompt: ${promptTokens} tokens | Output: ${completionTokens} tokens | Total: ${totalTokens} tokens`;
    tokenBadge.classList.remove('hidden');
  } else if (tokenBadge) {
    tokenBadge.classList.add('hidden');
  }

  // Approach
  set('approach-name', data.approach?.name ?? '—');
  set('approach-desc', data.approach?.description ?? '');

  // Time complexity
  const tcNotation = data.timeComplexity?.notation ?? '—';
  const tcEl = document.getElementById('tc-notation');
  if (tcEl) {
    tcEl.textContent = tcNotation;
    tcEl.className = `complexity-notation ${complexityColor(tcNotation)}`;
  }
  set('tc-explanation', data.timeComplexity?.explanation ?? '');

  // Space complexity
  const scNotation = data.spaceComplexity?.notation ?? '—';
  const scEl = document.getElementById('sc-notation');
  if (scEl) {
    scEl.textContent = scNotation;
    scEl.className = `complexity-notation ${complexityColor(scNotation)}`;
  }
  set('sc-explanation', data.spaceComplexity?.explanation ?? '');

  // Optimal complexity card (only show if different from user's)
  if (data.optimalComplexity?.time) {
    set('optimal-tc', data.optimalComplexity.time);
    set('optimal-sc', data.optimalComplexity.space ?? '—');
    toggle('card-optimal', false); // show (remove hidden)
    document.getElementById('card-optimal')?.classList.remove('hidden');
  } else {
    document.getElementById('card-optimal')?.classList.add('hidden');
  }

  // Efficiency rating
  const score = Math.min(10, Math.max(1, parseInt(data.efficiencyRating) || 5));
  set('rating-number', `${score}/10`);
  const tier = ratingTier(score);
  set('rating-caption', tier.label);
  const bar = document.getElementById('rating-bar-fill');
  if (bar) {
    bar.className = `rating-bar-fill ${tier.cls}`;
    // Trigger animation with a small delay
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bar.style.width = `${score * 10}%`;
      });
    });
  }

  // Confidence badge
  const confBadge = document.getElementById('confidence-badge');
  if (confBadge && data.confidence) {
    confBadge.textContent = data.confidence;
    confBadge.className = `confidence-badge ${data.confidence.toLowerCase()}`;
  }

  // Suggestions
  const list = document.getElementById('suggestions-list');
  if (list) {
    list.innerHTML = '';
    const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
    suggestions.forEach((s, i) => {
      const li = document.createElement('li');
      li.className = 'suggestion-item';
      li.style.animationDelay = `${i * 80}ms`;
      li.textContent = s;
      list.appendChild(li);
    });
  }

  // Recommendations (from local data/)
  const recCard = document.getElementById('card-recommendations');
  const recList = document.getElementById('rec-list');
  const recCount = document.getElementById('rec-count');
  const recs = Array.isArray(data.recommendations) ? data.recommendations : [];

  if (recCard && recList && recs.length > 0) {
    recList.innerHTML = '';
    if (recCount) recCount.textContent = `${recs.length} problems`;
    recs.forEach((rec, i) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = rec.url;
      a.className = 'rec-item';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.style.animationDelay = `${i * 60}ms`;
      a.innerHTML = `
        <span class="rec-title">${rec.title}</span>
        <span class="rec-diff ${rec.difficulty.toLowerCase()}">${rec.difficulty}</span>
        <span class="rec-ac">${rec.acRate}%</span>
      `;
      li.appendChild(a);
      recList.appendChild(li);
    });
    recCard.classList.remove('hidden');
  } else if (recCard) {
    recCard.classList.add('hidden');
  }

  // Store current analysis for Dry Run button
  _currentAnalysis = data;

  showState('state-results');
}

// ─── Dry Run Button ───────────────────────────────────────────────────────────
document.getElementById('dry-run-btn')?.addEventListener('click', async () => {
  if (!_currentAnalysis) return;

  const { titleSlug, code, language, problemTitle } = _currentAnalysis;
  if (!code || !language) return;

  // Save the request for the dryrun window to pick up and trace locally
  await chrome.storage.local.set({
    latestDryRunReq: {
      titleSlug: titleSlug || '',
      problemTitle: problemTitle || titleSlug || 'Problem',
      code,
      language,
      timestamp: Date.now(),
    }
  });

  // Open the dry run popup window (700 × 720 px)
  const dryRunUrl = chrome.runtime.getURL('dryrun/dryrun.html');
  chrome.windows.create({
    url:    dryRunUrl,
    type:   'popup',
    width:  700,
    height: 720,
  });
});
function renderError(message) {
  set('error-message', message ?? 'An unexpected error occurred.');
  showState('state-error');
}

function renderUnsupported(data) {
  if (data.titleSlug) set('problem-title', data.titleSlug.replace(/-/g, ' '));
  showState('state-unsupported');
}

// ─── DOM Helpers ──────────────────────────────────────────────────────────────
function set(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function toggle(id, hidden) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('hidden', hidden);
}

// ─── Storage Listener ─────────────────────────────────────────────────────────
function handleAnalysisData(data) {
  if (!data) { showState('state-empty'); return; }

  switch (data._status) {
    case 'loading':      renderLoading(data);          break;
    case 'complete':     renderResults(data);          break;
    case 'unsupported':  renderUnsupported(data);      break;
    case 'error':        renderError(data._error);     break;
    default:             showState('state-empty');     break;
  }
}

// Listen for storage changes (primary communication channel from background)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.latestAnalysis) {
    handleAnalysisData(changes.latestAnalysis.newValue);
  }
});

// ─── Settings Link ────────────────────────────────────────────────────────────
document.getElementById('open-settings-link')?.addEventListener('click', (e) => {
  e.preventDefault();
  // Open the extension popup programmatically (not possible directly, so open options)
  chrome.runtime.openOptionsPage?.() ?? window.open(chrome.runtime.getURL('popup/popup.html'));
});

// ─── Init: Load last known state on panel open ────────────────────────────────
chrome.storage.local.get(['latestAnalysis'], ({ latestAnalysis }) => {
  handleAnalysisData(latestAnalysis ?? null);
});
