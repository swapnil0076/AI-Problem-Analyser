'use strict';

/**
 * engine.js — Local code tracer (no AI, no network).
 * Spawns dryrun/worker.js in a Web Worker thread to instrument and trace code.
 */

export function runLocalTrace(req) {
  const lang = (req.language || '').toLowerCase();

  // Only block non-algorithmic languages (SQL, shell) — everything else
  // passes through to the worker which will transpile Java/Python/C++ to JS.
  const BLOCKED = ['mysql', 'mssql', 'oraclesql', 'postgresql', 'bash', 'shell', 'powershell'];
  if (BLOCKED.includes(lang)) {
    return Promise.resolve({
      algorithm: 'Local Trace',
      input: req.input || '—',
      isCorrect: null,
      failStep: null,
      result: '',
      steps: [],
      _langError: req.language,
    });
  }

  return traceJavaScript(req);
}

function traceJavaScript({ code, input, language }) {
  return new Promise((resolve, reject) => {
    let workerUrl;
    try {
      workerUrl = chrome.runtime.getURL('dryrun/worker.js');
    } catch (_) {
      workerUrl = 'worker.js';
    }

    const worker = new Worker(workerUrl);

    // Safety timeout — kill if code takes more than 6 seconds
    const timer = setTimeout(() => {
      worker.terminate();
      // Resolve with an infinite-loop result (graceful, not an error)
      resolve({
        algorithm: 'Solution',
        input: input || '—',
        isCorrect: false,
        failStep: null,
        result: '♾️ Infinite Loop Detected',
        infiniteLoop: true,
        steps: [{
          step: 1,
          vars: {},
          action: '♾️ Infinite Loop Detected',
          note: 'Code execution timed out after 6 seconds',
          ok: false,
          type: 'infinite',
          condition: null,
          conditionValue: null,
        }],
      });
    }, 6000);

    worker.onmessage = ({ data }) => {
      clearTimeout(timer);
      worker.terminate();
      // data.error means a genuine parse/runtime error (not infinite loop)
      if (data.error) reject(new Error(data.error));
      else            resolve(data);
    };

    worker.onerror = (e) => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error(e.message || 'Worker execution error'));
    };

    worker.postMessage({ code, input, language });
  });
}

