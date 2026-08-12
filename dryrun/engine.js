'use strict';

/**
 * engine.js — Local code tracer (no AI, no network).
 * Spawns dryrun/worker.js in a Web Worker thread to instrument and trace code.
 */

export function runLocalTrace(req) {
  const { language } = req;

  if (language !== 'javascript' && language !== 'typescript') {
    return Promise.resolve({
      algorithm: 'Local Trace',
      input: req.input || '—',
      isCorrect: null,
      failStep: null,
      result: '',
      steps: [],
      _langError: language,
    });
  }

  return traceJavaScript(req);
}

function traceJavaScript({ code, input }) {
  return new Promise((resolve, reject) => {
    let workerUrl;
    try {
      workerUrl = chrome.runtime.getURL('dryrun/worker.js');
    } catch (_) {
      workerUrl = 'worker.js';
    }

    const worker = new Worker(workerUrl);

    // Safety timeout — kill if code takes more than 4 seconds
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('Execution timed out. Your code may contain an infinite loop.'));
    }, 4000);

    worker.onmessage = ({ data }) => {
      clearTimeout(timer);
      worker.terminate();
      if (data.error) reject(new Error(data.error));
      else             resolve(data);
    };

    worker.onerror = (e) => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error(e.message || 'Worker execution error'));
    };

    worker.postMessage({ code, input });
  });
}
