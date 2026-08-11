/**
 * bridge.js — Runs in PAGE CONTEXT (not isolated extension world).
 *
 * This script has access to window.monaco which is unavailable in
 * content scripts due to Chrome's isolated world architecture.
 *
 * Communication back to content.js is via window.postMessage.
 */

(function () {
  'use strict';

  const MAX_WAIT_MS = 10000;
  const POLL_INTERVAL_MS = 250;
  let elapsed = 0;

  /**
   * Find the primary code model in Monaco. LeetCode may load multiple
   * models (e.g. read-only testcase models), so we filter for the
   * user-editable one by checking for code-like URIs or language IDs.
   */
  function findEditorModel() {
    if (typeof monaco === 'undefined') return null;

    const models = monaco.editor.getModels();
    if (!models || models.length === 0) return null;

    // Prefer a model with a programming language (not plain text)
    const SKIP_LANGS = ['plaintext', 'json', 'markdown'];
    const codeModel = models.find(m => !SKIP_LANGS.includes(m.getLanguageId()));
    return codeModel ?? models[0];
  }

  /**
   * Extract code and language from Monaco, post back to content script.
   */
  function extractAndPost() {
    const model = findEditorModel();
    if (!model) return false;

    const code = model.getValue();
    const language = model.getLanguageId();

    // Only post if there's actual code (not just the default stub or empty)
    if (!code || code.trim().length < 5) return false;

    window.postMessage(
      {
        source: 'LEETCODE_AI_BRIDGE',
        type: 'CODE_EXTRACTED',
        payload: { code, language },
      },
      window.location.origin
    );

    return true;
  }

  /**
   * Poll until Monaco is ready, then extract.
   * Uses MutationObserver as a secondary signal for editor init.
   */
  function waitForMonacoAndExtract() {
    const interval = setInterval(() => {
      elapsed += POLL_INTERVAL_MS;

      if (extractAndPost()) {
        clearInterval(interval);
        return;
      }

      if (elapsed >= MAX_WAIT_MS) {
        clearInterval(interval);
        window.postMessage(
          {
            source: 'LEETCODE_AI_BRIDGE',
            type: 'EXTRACTION_FAILED',
            payload: { reason: 'Monaco editor not found within timeout' },
          },
          window.location.origin
        );
      }
    }, POLL_INTERVAL_MS);
  }

  // Also listen for re-extraction requests from content.js
  // (e.g. user clicked Analyze — we re-read latest editor state)
  window.addEventListener('message', (event) => {
    if (
      event.origin !== window.location.origin ||
      event.data?.source !== 'LEETCODE_AI_CONTENT' ||
      event.data?.type !== 'REQUEST_CODE'
    ) {
      return;
    }
    extractAndPost();
  });

  // Kick off initial extraction
  waitForMonacoAndExtract();
})();
