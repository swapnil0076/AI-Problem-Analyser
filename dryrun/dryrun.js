'use strict';

import { runLocalTrace } from './engine.js';

// ─── State ────────────────────────────────────────────────────────────────────
let steps        = [];
let currentStep  = 0;
let playInterval = null;
let playSpeed    = 2000; // ms per step (default: Slow)
let activeReq    = null;

// ─── DOM Refs ─────────────────────────────────────────────────────────────────
const elLoading      = document.getElementById('dr-loading');
const elError        = document.getElementById('dr-error');
const elErrorMsg     = document.getElementById('dr-error-msg');
const elContent      = document.getElementById('dr-content');
const elAlgoName     = document.getElementById('dr-algo-name');
const elCorrectness  = document.getElementById('dr-correctness-badge');
const elInput        = document.getElementById('dr-input');
const elResult       = document.getElementById('dr-result');
const elProgressFill = document.getElementById('dr-progress-fill');
const elStepDots     = document.getElementById('dr-step-dots');
const elStepCard     = document.getElementById('dr-step-card');
const elStepNum      = document.getElementById('dr-step-num');
const elStepTotal    = document.getElementById('dr-step-total');
const elStepBadge    = document.getElementById('dr-step-badge');
const elVarsGrid     = document.getElementById('dr-vars-grid');
const elActionText   = document.getElementById('dr-action-text');
const elNoteBlock    = document.getElementById('dr-note-block');
const elNoteLabel    = document.getElementById('dr-note-label');
const elNoteText     = document.getElementById('dr-note-text');
const elPrevBtn      = document.getElementById('dr-prev-btn');
const elNextBtn      = document.getElementById('dr-next-btn');
const elFirstBtn     = document.getElementById('dr-first-btn');
const elLastBtn      = document.getElementById('dr-last-btn');
const elPlayBtn      = document.getElementById('dr-play-btn');
const elRetryBtn     = document.getElementById('dr-retry-btn');
const elSpeedBtns    = document.querySelectorAll('.dr-speed-btn');

// ─── Show/Hide Sections ───────────────────────────────────────────────────────
function showLoading() {
  elLoading.classList.remove('hidden');
  elError.classList.add('hidden');
  elContent.classList.add('hidden');
}

function showError(msg) {
  elLoading.classList.add('hidden');
  elError.classList.remove('hidden');
  elContent.classList.add('hidden');
  elErrorMsg.textContent = msg ?? 'Something went wrong.';
}

function showContent() {
  elLoading.classList.add('hidden');
  elError.classList.add('hidden');
  elContent.classList.remove('hidden');
}

// ─── Execute Local Trace ──────────────────────────────────────────────────────
async function executeLocalTrace(req) {
  activeReq = req;
  showLoading();

  if (!req || !req.code) {
    showError('No code found for dry run. Try clicking Dry Run from the side panel again.');
    return;
  }

  try {
    const data = await runLocalTrace(req);

    if (data._langError) {
      showError(`Local dry run step-tracing is available for JavaScript & TypeScript. Language detected: "${data._langError}".`);
      return;
    }

    renderDryRun(data);
  } catch (err) {
    showError(err.message || 'Error executing dry run trace.');
  }
}

// ─── Render Dry Run Data ───────────────────────────────────────────────────────
function renderDryRun(data) {
  steps       = Array.isArray(data.steps) ? data.steps : [];
  currentStep = 0;

  if (steps.length === 0) {
    showError('No execution steps were generated. Make sure your function contains executable logic or variable assignments.');
    return;
  }

  // Header
  elAlgoName.textContent = data.algorithm ?? '—';

  if (data.isCorrect === true) {
    elCorrectness.textContent = '✓ Executed Cleanly';
    elCorrectness.className   = 'dr-correctness-badge correct';
  } else if (data.isCorrect === false) {
    elCorrectness.textContent = '✗ Runtime Error';
    elCorrectness.className   = 'dr-correctness-badge wrong';
  } else {
    elCorrectness.textContent = '';
    elCorrectness.className   = 'dr-correctness-badge';
  }

  // IO strip
  elInput.textContent  = data.input  ?? '—';
  elResult.textContent = data.result ?? '—';
  if (data.isCorrect === false) {
    elResult.style.color = '#ef4444';
  } else {
    elResult.style.color = '';
  }

  // Build progress dots
  elStepDots.innerHTML = '';
  steps.forEach((s) => {
    const dot = document.createElement('div');
    dot.className = 'dr-dot';
    if (!s.ok) dot.dataset.fail = '1';
    elStepDots.appendChild(dot);
  });

  showContent();
  renderStep(0);
}

// ─── Render a Single Step ─────────────────────────────────────────────────────
function renderStep(idx) {
  if (idx < 0 || idx >= steps.length) return;
  currentStep = idx;

  const step = steps[idx];
  const isBug = step.ok === false;

  // Progress bar
  const pct = steps.length <= 1 ? 100 : (idx / (steps.length - 1)) * 100;
  elProgressFill.style.width = `${pct}%`;

  // Dots
  const dots = elStepDots.querySelectorAll('.dr-dot');
  dots.forEach((dot, i) => {
    dot.classList.remove('active', 'done', 'fail');
    if (i < idx)       dot.classList.add(dot.dataset.fail ? 'fail' : 'done');
    else if (i === idx) dot.classList.add('active');
  });

  // Step card class
  elStepCard.classList.toggle('bug-step', isBug);

  // Re-trigger animation
  elStepCard.style.animation = 'none';
  void elStepCard.offsetHeight; // force reflow
  elStepCard.style.animation = '';

  // Step counter
  elStepNum.textContent   = `Step ${idx + 1}`;
  elStepTotal.textContent = `of ${steps.length}`;

  // Status badge
  if (isBug) {
    elStepBadge.textContent = '⚠ Error here';
    elStepBadge.className   = 'dr-step-badge bug';
  } else {
    elStepBadge.textContent = '✓ OK';
    elStepBadge.className   = 'dr-step-badge ok';
  }

  // Variable pills
  elVarsGrid.innerHTML = '';
  const vars = step.vars ?? {};
  Object.entries(vars).forEach(([k, v], i) => {
    const pill       = document.createElement('div');
    pill.className   = 'dr-var-pill';
    pill.style.animationDelay = `${i * 40}ms`;

    const nameEl     = document.createElement('span');
    nameEl.className = 'dr-var-name';
    nameEl.textContent = k;

    const valEl      = document.createElement('span');
    valEl.className  = 'dr-var-val';
    valEl.textContent = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);

    pill.appendChild(nameEl);
    pill.appendChild(valEl);
    elVarsGrid.appendChild(pill);
  });

  // Action
  elActionText.textContent = step.action ?? '—';

  // Note
  const note = step.note ?? '';
  if (note) {
    elNoteBlock.classList.remove('hidden');
    elNoteText.textContent  = note;
    elNoteLabel.textContent = isBug ? '❌ Error Details' : 'Note';
    elNoteLabel.className   = isBug ? 'dr-note-label bug-label' : 'dr-note-label';
  } else {
    elNoteBlock.classList.add('hidden');
  }

  // Nav buttons
  elPrevBtn.disabled  = idx === 0;
  elFirstBtn.disabled = idx === 0;
  elNextBtn.disabled  = idx === steps.length - 1;
  elLastBtn.disabled  = idx === steps.length - 1;
}

// ─── Playback ─────────────────────────────────────────────────────────────────
function startPlay() {
  if (currentStep >= steps.length - 1) {
    renderStep(0);
  }
  elPlayBtn.textContent = '⏸ Pause';
  elPlayBtn.classList.add('playing');

  playInterval = setInterval(() => {
    if (currentStep >= steps.length - 1) {
      stopPlay();
      return;
    }
    renderStep(currentStep + 1);
  }, playSpeed);
}

function stopPlay() {
  clearInterval(playInterval);
  playInterval = null;
  elPlayBtn.textContent = '▶ Play';
  elPlayBtn.classList.remove('playing');
}

function togglePlay() {
  if (playInterval) stopPlay();
  else startPlay();
}

// ─── Controls ─────────────────────────────────────────────────────────────────
elPrevBtn.addEventListener('click',  () => { stopPlay(); renderStep(currentStep - 1); });
elNextBtn.addEventListener('click',  () => { stopPlay(); renderStep(currentStep + 1); });
elFirstBtn.addEventListener('click', () => { stopPlay(); renderStep(0); });
elLastBtn.addEventListener('click',  () => { stopPlay(); renderStep(steps.length - 1); });
elPlayBtn.addEventListener('click',  togglePlay);

// Keyboard navigation
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft')  { stopPlay(); renderStep(currentStep - 1); }
  if (e.key === 'ArrowRight') { stopPlay(); renderStep(currentStep + 1); }
  if (e.key === ' ')          { e.preventDefault(); togglePlay(); }
  if (e.key === 'Home')       { stopPlay(); renderStep(0); }
  if (e.key === 'End')        { stopPlay(); renderStep(steps.length - 1); }
});

// Speed buttons
elSpeedBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    elSpeedBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    playSpeed = parseInt(btn.dataset.ms, 10);
    if (playInterval) { stopPlay(); startPlay(); }
  });
});

// Retry button
elRetryBtn.addEventListener('click', () => {
  if (activeReq) executeLocalTrace(activeReq);
});

// ─── Storage Listener ─────────────────────────────────────────────────────────
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.latestDryRunReq) {
    executeLocalTrace(changes.latestDryRunReq.newValue);
  }
});

// ─── Init: Read request on window open ────────────────────────────────────────
chrome.storage.local.get(['latestDryRunReq'], ({ latestDryRunReq }) => {
  executeLocalTrace(latestDryRunReq ?? null);
});
