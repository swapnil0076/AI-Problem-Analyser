import { generateFlowchart } from '../src/utils/flowchartGenerator.js';

let _zoomScale = 1.0;

function updateZoom() {
  const wrapper = document.getElementById('dr-canvas-wrapper');
  const val = document.getElementById('dr-zoom-val');
  if (wrapper) {
    wrapper.style.transform = `scale(${_zoomScale})`;
  }
  if (val) {
    val.textContent = `${Math.round(_zoomScale * 100)}%`;
  }
}

function initZoomControls() {
  document.getElementById('dr-zoom-in')?.addEventListener('click', () => {
    _zoomScale = Math.min(2.5, _zoomScale + 0.2);
    updateZoom();
  });

  document.getElementById('dr-zoom-out')?.addEventListener('click', () => {
    _zoomScale = Math.max(0.5, _zoomScale - 0.2);
    updateZoom();
  });

  document.getElementById('dr-zoom-reset')?.addEventListener('click', () => {
    _zoomScale = 1.0;
    updateZoom();
  });
}

function renderDiagramData(data) {
  if (!data) return;

  const titleEl = document.getElementById('dr-problem-title');
  const diffEl = document.getElementById('dr-diff-badge');
  const tagEl = document.getElementById('dr-pattern-tag');
  const svgContainer = document.getElementById('dr-svg-container');
  const stepsGrid = document.getElementById('dr-steps-grid');
  const stepsCount = document.getElementById('dr-steps-count');

  if (titleEl) titleEl.textContent = data.problemTitle || data.titleSlug || 'Logic Flowchart';
  
  if (diffEl && data.difficulty) {
    diffEl.textContent = data.difficulty;
    diffEl.className = `dr-difficulty-badge ${data.difficulty.toLowerCase()}`;
  }

  if (tagEl) {
    tagEl.textContent = data.approach?.name || 'Algorithm Flow';
  }

  // Generate SVG if not cached or use provided
  let svg = data.svg;
  let steps = data.steps;

  if (!svg) {
    const result = generateFlowchart({
      code: data.code || '',
      language: data.language || '',
      pattern: data.approach || {},
      problemData: {
        title: data.problemTitle || data.titleSlug || '',
        difficulty: data.difficulty || '',
      }
    });
    svg = result.svg;
    steps = result.steps;
  }

  if (svgContainer) {
    svgContainer.innerHTML = svg;
  }

  // Render steps grid
  if (stepsGrid && Array.isArray(steps)) {
    stepsGrid.innerHTML = '';
    if (stepsCount) stepsCount.textContent = `${steps.length} steps`;

    steps.forEach(step => {
      const card = document.createElement('div');
      card.className = 'dr-step-card';
      card.dataset.step = step.stepNum;
      card.innerHTML = `
        <span class="dr-step-tag">Step ${step.stepNum}</span>
        <div class="dr-step-title">${step.title}</div>
        ${step.detail ? `<div class="dr-step-detail">${step.detail}</div>` : ''}
      `;

      // Interactive hover link to SVG node
      card.addEventListener('mouseenter', () => {
        svgContainer?.querySelectorAll('.flow-node').forEach(node => {
          node.classList.toggle('active', node.dataset.step === String(step.stepNum) || node.dataset.step === step.id);
        });
      });

      card.addEventListener('mouseleave', () => {
        svgContainer?.querySelectorAll('.flow-node').forEach(node => node.classList.remove('active'));
      });

      stepsGrid.appendChild(card);
    });
  }
}

// ─── Initialize ───────────────────────────────────────────────────────────────
initZoomControls();

// Load diagram payload from storage
chrome.storage.local.get(['latestDiagramReq', 'latestAnalysis'], ({ latestDiagramReq, latestAnalysis }) => {
  const data = latestDiagramReq || latestAnalysis;
  renderDiagramData(data);
});

// Live update listener
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.latestDiagramReq || changes.latestAnalysis)) {
    const data = changes.latestDiagramReq?.newValue || changes.latestAnalysis?.newValue;
    renderDiagramData(data);
  }
});
