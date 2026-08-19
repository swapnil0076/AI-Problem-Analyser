/**
 * dryrun.js — Orchestrates the Dry Run Visualizer page.
 *
 * Flow:
 *  1. Load stored trace data (latestDiagramReq / latestAnalysis) from chrome.storage
 *  2. If the data has a .code field → run live trace via engine.js (runLocalTrace)
 *  3. Pass the steps to visualTrace.js → get an SVG
 *  4. Populate:
 *       - Left panel  : input args + variable state from first step
 *       - Centre      : the SVG flowchart
 *       - Right panel : result value OR infinite-loop banner
 *       - Footer      : execution trace step cards
 *
 * Falls back gracefully to the old static flowchart (flowchartGenerator) when
 * no live trace is available.
 */

import { runLocalTrace }    from './engine.js';
import { renderVisualTrace } from './visualTrace.js';
import { generateFlowchart } from '../src/utils/flowchartGenerator.js';

// ── Zoom State ─────────────────────────────────────────────────────────────────
let _zoomScale = 1.0;

function updateZoom() {
  const wrapper = document.getElementById('dr-canvas-wrapper');
  const val     = document.getElementById('dr-zoom-val');
  if (wrapper) wrapper.style.transform = `scale(${_zoomScale})`;
  if (val)     val.textContent = `${Math.round(_zoomScale * 100)}%`;
}

function initZoomControls() {
  document.getElementById('dr-zoom-in')   ?.addEventListener('click', () => { _zoomScale = Math.min(2.5, _zoomScale + 0.2); updateZoom(); });
  document.getElementById('dr-zoom-out')  ?.addEventListener('click', () => { _zoomScale = Math.max(0.4, _zoomScale - 0.2); updateZoom(); });
  document.getElementById('dr-zoom-reset')?.addEventListener('click', () => { _zoomScale = 1.0; updateZoom(); });
}

// ── Left Panel: Input / Variables ──────────────────────────────────────────────

function renderInputPanel(input, firstVars) {
  const inputBlock = document.getElementById('dr-input-block');
  const varsBlock  = document.getElementById('dr-vars-block');

  // Input args
  if (inputBlock) {
    if (input) {
      inputBlock.innerHTML = buildVarBox(parseInputDisplay(input));
    } else {
      inputBlock.innerHTML = '<div class="dr-var-loading">No input provided</div>';
    }
  }

  // Initial variable snapshot
  if (varsBlock && firstVars) {
    const entries = Object.entries(firstVars);
    if (entries.length > 0) {
      varsBlock.innerHTML = buildVarBox(entries);
    }
  }
}

function parseInputDisplay(input) {
  if (!input) return [];
  try {
    // Try to parse multiple lines as separate args
    const lines = String(input).trim().split('\n').filter(Boolean);
    return lines.map((line, i) => {
      try {
        const v = JSON.parse(line.trim());
        return [`arg${i}`, v];
      } catch (_) {
        return [`arg${i}`, line.trim()];
      }
    });
  } catch (_) {
    return [['input', input]];
  }
}

function buildVarBox(entries) {
  const rows = entries.map(([key, val]) => {
    const valStr = JSON.stringify(val);
    const isArr  = Array.isArray(val);
    const cls    = isArr ? 'dr-var-arr' : 'dr-var-val';
    return `<span class="dr-var-key">${escHtml(key)}</span><span class="dr-var-equals"> = </span><span class="${cls}">${escHtml(valStr)}</span>`;
  }).join('\n');
  return `<div class="dr-var-box">${rows}</div>`;
}

// ── Right Panel: Result ────────────────────────────────────────────────────────

function renderResultPanel(result, infiniteLoop, algorithm, stepsCount) {
  const resultBox    = document.getElementById('dr-result-box');
  const resultVal    = document.getElementById('dr-result-value');
  const infiniteBanner = document.getElementById('dr-infinite-banner');
  const algoEl       = document.getElementById('dr-algo-name');
  const stepsEl      = document.getElementById('dr-steps-count');
  const statusEl     = document.getElementById('dr-status-val');
  const stepsBadge   = document.getElementById('dr-steps-badge');

  if (infiniteLoop) {
    // Show the infinite loop banner + red result box
    if (resultBox)    resultBox.classList.add('is-infinite');
    if (resultVal)    resultVal.textContent = '♾️';
    if (infiniteBanner) infiniteBanner.classList.remove('hidden');
    if (statusEl) {
      statusEl.textContent = 'Infinite Loop';
      statusEl.className   = 'dr-meta-val infinite';
    }
  } else {
    // Normal result
    if (resultVal) {
      const display = String(result || '—').replace(/^"|"$/g, '');
      resultVal.textContent = display.length > 20 ? display.slice(0, 18) + '…' : display;
    }
    if (statusEl) {
      const isError = String(result).startsWith('❌');
      statusEl.textContent = isError ? 'Error' : 'Complete ✓';
      statusEl.className   = `dr-meta-val ${isError ? 'error' : 'ok'}`;
    }
  }

  if (algoEl)    algoEl.textContent   = algorithm || '—';
  if (stepsEl)   stepsEl.textContent  = stepsCount || '—';
  if (stepsBadge) stepsBadge.textContent = stepsCount ? `${stepsCount} steps` : '';
}

// ── Centre: SVG ───────────────────────────────────────────────────────────────

function renderSvg(svg) {
  const container = document.getElementById('dr-svg-container');
  if (container) container.innerHTML = svg;
}

function showLoading(visible) {
  const el = document.getElementById('dr-loading');
  if (el) el.style.display = visible ? 'flex' : 'none';
}

// ── Footer: Trace Step Cards ───────────────────────────────────────────────────

function renderStepCards(steps) {
  const grid = document.getElementById('dr-steps-grid');
  if (!grid || !Array.isArray(steps)) return;

  grid.innerHTML = '';

  steps.forEach(step => {
    const card = document.createElement('div');
    card.className = `dr-step-card type-${step.type || 'assign'}`;
    card.dataset.step = step.step;
    card.style.animationDelay = `${step.step * 40}ms`;

    const typeLabel = (step.type || 'step').charAt(0).toUpperCase() + (step.type || 'step').slice(1);
    const varSnap   = step.vars ? Object.entries(step.vars).slice(0, 2).map(([k,v]) => `${k}=${JSON.stringify(v)}`).join(' ') : '';

    card.innerHTML = `
      <span class="dr-step-tag">Step ${step.step} · ${typeLabel}</span>
      <div class="dr-step-title">${escHtml(step.action || '')}</div>
      ${varSnap ? `<div class="dr-step-detail">${escHtml(varSnap)}</div>` : ''}
    `;

    // Highlight corresponding SVG node on hover
    card.addEventListener('mouseenter', () => {
      document.querySelectorAll('.vt-node').forEach(n => n.classList.remove('active'));
      const svgNode = document.querySelector(`.vt-node[data-id="n${step.step - 1}"]`);
      if (svgNode) svgNode.classList.add('active');
    });
    card.addEventListener('mouseleave', () => {
      document.querySelectorAll('.vt-node').forEach(n => n.classList.remove('active'));
    });

    grid.appendChild(card);
  });
}

// ── Main Render ────────────────────────────────────────────────────────────────

async function renderFromData(data) {
  if (!data) return;

  // Update header
  const titleEl = document.getElementById('dr-problem-title');
  const diffEl  = document.getElementById('dr-diff-badge');
  const tagEl   = document.getElementById('dr-pattern-tag');

  if (titleEl) titleEl.textContent = data.problemTitle || data.titleSlug || 'Dry Run Visualizer';
  if (diffEl && data.difficulty) {
    diffEl.textContent  = data.difficulty;
    diffEl.className    = `dr-difficulty-badge ${data.difficulty.toLowerCase()}`;
  }
  if (tagEl) tagEl.textContent = data.approach?.name || 'Execution Trace';

  // ── Case 1: We have code → run live trace ──────────────────────────────────
  if (data.code && (data.language === 'javascript' || data.language === 'typescript' || !data.language)) {
    showLoading(true);

    try {
      const traceResult = await runLocalTrace({
        code:     data.code,
        language: data.language || 'javascript',
        input:    data.input || '',
      });

      showLoading(false);

      const { steps, result, infiniteLoop, algorithm, input } = traceResult;

      // Left panel — input + first vars
      const firstVars = steps.find(s => s.vars && Object.keys(s.vars).length > 0)?.vars;
      renderInputPanel(input || data.input, firstVars);

      // Centre — live trace SVG
      const { svg } = renderVisualTrace(steps);
      renderSvg(svg);

      // Right panel — result / infinite
      renderResultPanel(result, infiniteLoop, algorithm, steps.length);

      // Footer — step cards
      renderStepCards(steps);

    } catch (err) {
      showLoading(false);

      // Show error in result panel
      const resultVal = document.getElementById('dr-result-value');
      if (resultVal) resultVal.textContent = '❌ Trace Error';

      const statusEl = document.getElementById('dr-status-val');
      if (statusEl) { statusEl.textContent = err.message || 'Error'; statusEl.className = 'dr-meta-val error'; }

      // Fallback to static diagram
      renderStaticFallback(data);
    }

  } else {
    // ── Case 2: No code / non-JS → static flowchart fallback ──────────────────
    showLoading(false);
    renderStaticFallback(data);
  }
}

function renderStaticFallback(data) {
  const { svg, steps } = generateFlowchart({
    code:        data.code || '',
    language:    data.language || '',
    pattern:     data.approach || {},
    problemData: { title: data.problemTitle || data.titleSlug || '', difficulty: data.difficulty || '' },
  });

  renderSvg(svg);
  renderStepCards(steps.map((s, i) => ({ ...s, step: i + 1, type: s.type || 'assign', action: s.title })));

  const resultVal = document.getElementById('dr-result-value');
  if (resultVal) resultVal.textContent = 'Static Diagram';
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Bootstrap ──────────────────────────────────────────────────────────────────
initZoomControls();

chrome.storage.local.get(['latestDiagramReq', 'latestAnalysis'], ({ latestDiagramReq, latestAnalysis }) => {
  renderFromData(latestDiagramReq || latestAnalysis);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.latestDiagramReq || changes.latestAnalysis)) {
    renderFromData(changes.latestDiagramReq?.newValue || changes.latestAnalysis?.newValue);
  }
});
