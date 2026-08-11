/**
 * content.js — Injected into https://leetcode.com/problems/* pages.
 *
 * Responsibilities:
 * 1. Extract titleSlug from URL
 * 2. Inject bridge.js into page context to read Monaco editor
 * 3. Inject the floating "Analyze" button into the LeetCode UI
 * 4. Listen for bridge responses (code + language)
 * 5. On Analyze click → send to background service worker
 * 6. Open the Chrome Side Panel for results
 */

(function () {
  'use strict';

  // ─── State ───────────────────────────────────────────────────────────────────
  let latestCode = null;
  let latestLanguage = null;
  let isAnalyzing = false;

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  function getTitleSlug() {
    const match = window.location.pathname.match(/\/problems\/([^/]+)/);
    return match ? match[1] : null;
  }

  function isUnsupportedProblem() {
    // Check if the URL hints at SQL/shell (some problem pages have category in path)
    const slug = getTitleSlug() ?? '';
    const UNSUPPORTED_SLUGS = ['sql', 'bash', 'shell'];
    return UNSUPPORTED_SLUGS.some(s => slug.includes(s));
  }

  // ─── Bridge Injection ─────────────────────────────────────────────────────────
  function injectBridge() {
    const existing = document.getElementById('lc-ai-bridge');
    if (existing) return; // Already injected

    const script = document.createElement('script');
    script.id = 'lc-ai-bridge';
    script.src = chrome.runtime.getURL('src/content/bridge.js');
    script.onload = () => script.remove(); // Clean up after execution
    (document.head || document.documentElement).appendChild(script);
  }

  // ─── Bridge Message Listener ──────────────────────────────────────────────────
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.source !== 'LEETCODE_AI_BRIDGE') return;

    if (event.data.type === 'CODE_EXTRACTED') {
      const { code, language } = event.data.payload;
      latestCode = code;
      latestLanguage = language;
      updateAnalyzeButton(true);
    }

    if (event.data.type === 'EXTRACTION_FAILED') {
      console.warn('[LeetCode AI] Bridge extraction failed:', event.data.payload.reason);
      updateAnalyzeButton(false, 'Editor not detected');
    }
  });

  // ─── Floating Analyze Button ──────────────────────────────────────────────────
  function createAnalyzeButton() {
    if (document.getElementById('lc-ai-analyze-btn')) return;

    const btn = document.createElement('button');
    btn.id = 'lc-ai-analyze-btn';
    btn.setAttribute('aria-label', 'Analyze with AI');
    btn.innerHTML = `
      <span class="lc-ai-btn-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
          <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        </svg>
      </span>
      <span class="lc-ai-btn-text">AI Analyze</span>
    `;

    // Inject styles
    injectButtonStyles();

    btn.addEventListener('click', handleAnalyzeClick);
    document.body.appendChild(btn);
  }

  function injectButtonStyles() {
    if (document.getElementById('lc-ai-styles')) return;
    const style = document.createElement('style');
    style.id = 'lc-ai-styles';
    style.textContent = `
      #lc-ai-analyze-btn {
        position: fixed;
        bottom: 28px;
        right: 28px;
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 18px;
        background: linear-gradient(135deg, #7c3aed, #3b82f6);
        color: #fff;
        border: none;
        border-radius: 50px;
        font-family: 'Inter', system-ui, sans-serif;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 4px 20px rgba(124, 58, 237, 0.5);
        transition: all 0.2s ease;
        letter-spacing: 0.3px;
      }
      #lc-ai-analyze-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 28px rgba(124, 58, 237, 0.65);
      }
      #lc-ai-analyze-btn:active {
        transform: translateY(0);
      }
      #lc-ai-analyze-btn.loading {
        opacity: 0.8;
        cursor: not-allowed;
        pointer-events: none;
      }
      #lc-ai-analyze-btn.loading .lc-ai-btn-icon svg {
        animation: lc-ai-spin 1s linear infinite;
      }
      #lc-ai-analyze-btn.disabled {
        background: linear-gradient(135deg, #374151, #4b5563);
        box-shadow: none;
        cursor: not-allowed;
      }
      @keyframes lc-ai-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }

  function updateAnalyzeButton(ready, errorMsg = null) {
    const btn = document.getElementById('lc-ai-analyze-btn');
    if (!btn) return;

    if (errorMsg) {
      btn.classList.add('disabled');
      btn.querySelector('.lc-ai-btn-text').textContent = errorMsg;
      return;
    }

    btn.classList.remove('disabled', 'loading');
    btn.querySelector('.lc-ai-btn-text').textContent = ready ? 'AI Analyze' : 'Waiting for editor...';
    if (!ready) btn.classList.add('disabled');
  }

  function setButtonLoading(loading) {
    const btn = document.getElementById('lc-ai-analyze-btn');
    if (!btn) return;
    if (loading) {
      btn.classList.add('loading');
      btn.querySelector('.lc-ai-btn-text').textContent = 'Analyzing...';
    } else {
      btn.classList.remove('loading');
      btn.querySelector('.lc-ai-btn-text').textContent = 'AI Analyze';
    }
  }

  // ─── Analyze Handler ──────────────────────────────────────────────────────────
  async function handleAnalyzeClick() {
    if (isAnalyzing) return;

    const titleSlug = getTitleSlug();
    if (!titleSlug) return;

    // Re-request latest code from bridge
    window.postMessage(
      { source: 'LEETCODE_AI_CONTENT', type: 'REQUEST_CODE' },
      window.location.origin
    );

    // Small delay to receive bridge response
    await new Promise(res => setTimeout(res, 300));

    if (!latestCode) {
      showToast('Could not read editor code. Try clicking inside the editor first.');
      return;
    }

    if (isUnsupportedProblem()) {
      chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' });
      chrome.runtime.sendMessage({ type: 'UNSUPPORTED_PROBLEM', payload: { titleSlug } });
      return;
    }

    isAnalyzing = true;
    setButtonLoading(true);

    // Open side panel so user sees the loading state immediately
    chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' });

    // Send analysis request to background SW
    chrome.runtime.sendMessage(
      {
        type: 'ANALYZE_CODE',
        payload: {
          titleSlug,
          code: latestCode,
          language: latestLanguage,
        },
      },
      (response) => {
        isAnalyzing = false;
        setButtonLoading(false);

        if (chrome.runtime.lastError) {
          showToast('Extension error: ' + chrome.runtime.lastError.message);
          return;
        }

        if (!response?.success) {
          showToast(response?.error ?? 'Analysis failed. Check your API key in settings.');
        }
      }
    );
  }

  // ─── Toast Notification ───────────────────────────────────────────────────────
  function showToast(message) {
    const existing = document.getElementById('lc-ai-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'lc-ai-toast';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 80px;
      right: 28px;
      z-index: 10000;
      background: #1f2937;
      color: #e5e7eb;
      padding: 10px 16px;
      border-radius: 8px;
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 13px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      border-left: 3px solid #ef4444;
      max-width: 300px;
      animation: lc-ai-fadein 0.3s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  // ─── Init ─────────────────────────────────────────────────────────────────────
  function init() {
    const titleSlug = getTitleSlug();
    injectBridge();
    createAnalyzeButton();
    // Pre-fetch problem data immediately — it will be cached in background
    // before the user clicks Analyze, eliminating GraphQL latency from hot path.
    if (titleSlug) {
      chrome.runtime.sendMessage({ type: 'PREFETCH_PROBLEM', payload: { titleSlug } });
    }
  }

  // LeetCode is a SPA — re-init on navigation
  let lastUrl = location.href;
  new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      latestCode = null;
      latestLanguage = null;
      isAnalyzing = false;

      if (/\/problems\/[^/]+/.test(currentUrl)) {
        // Re-inject on navigation to a new problem
        const existing = document.getElementById('lc-ai-bridge');
        if (existing) existing.remove();
        setTimeout(init, 1000); // Wait for page to settle
      }
    }
  }).observe(document, { subtree: true, childList: true });

  // Initial load
  init();
})();
