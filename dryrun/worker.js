'use strict';

/**
 * worker.js — Web Worker for local step execution & code tracing.
 * Runs in its own sandbox thread. No double-escaping needed.
 *
 * Each step now carries:
 *   { step, type, action, note, condition, conditionValue, vars, ok }
 *
 * type: 'init' | 'assign' | 'condition' | 'loop' | 'return' | 'infinite'
 */

const MAX_STEPS = 40;   // cap steps shown in the visual trace
const MAX_ITERS = 200;  // hard cap on loop iterations (safety)

self.onmessage = function ({ data: { code, input } }) {
  try {
    const result = executeTrace(code, input);
    self.postMessage(result);
  } catch (err) {
    self.postMessage({ error: err.message });
  }
};

// ── Main entry ─────────────────────────────────────────────────────────────────
function executeTrace(code, input) {
  const info = parseCode(code);
  if (!info) {
    return { error: 'Could not parse your code. Make sure it is a valid JavaScript function.' };
  }

  const parsedArgs = parseInput(input);
  const args = getSampleArgs(info.params, parsedArgs);

  const { steps, result, error, infiniteLoop } = runInstrumented(info, args);

  return {
    algorithm: info.funcName || 'Solution',
    input: input || JSON.stringify(args),
    steps,
    infiniteLoop: infiniteLoop || false,
    result: infiniteLoop
      ? '♾️ Infinite Loop Detected'
      : error
        ? ('❌ Runtime Error: ' + error)
        : (result !== undefined ? JSON.stringify(result) : '(no return value)'),
    isCorrect: !error && !infiniteLoop,
    failStep: error ? findFirstFailStep(steps) : null,
  };
}

function getSampleArgs(params, inputArgs) {
  const result = Array.isArray(inputArgs) ? [...inputArgs] : [];
  const defaults = {
    x: 123,
    n: 5,
    num: 123,
    val: 3,
    nums: [2, 7, 11, 15],
    target: 9,
    arr: [1, 8, 6, 2, 5],
    height: [1, 8, 6, 2, 5, 4, 8, 3, 7],
    s: 'leetcode',
    t: 'coding',
    str: 'hello',
    head: [1, 2, 3, 4, 5],
    root: [1, null, 2, 3],
    matrix: [[1, 3, 5], [7, 9, 11]],
  };

  params.forEach((p, idx) => {
    if (result[idx] === undefined) {
      const name = p.toLowerCase();
      result[idx] = defaults[name] ?? defaults[p] ?? 10;
    }
  });

  return result;
}

// ── Code Parser ────────────────────────────────────────────────────────────────
function parseCode(code) {
  let clean = (code || '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '').trim();
  clean = clean.replace(/:\s*[A-Za-z0-9_<>\[\]|]+/g, '');

  let m = clean.match(/(?:var|let|const|this\.)?\s*([a-zA-Z0-9_$]+)\s*=\s*(?:function)?\s*\(([^)]*)\)/);
  if (m && !['if','for','while','switch'].includes(m[1])) {
    const startIdx = clean.indexOf(m[0]);
    return { funcName: m[1], params: splitParams(m[2]), body: extractBody(clean.slice(startIdx)) };
  }

  m = clean.match(/function\s+([a-zA-Z0-9_$]+)\s*\(([^)]*)\)/);
  if (m) {
    const startIdx = clean.indexOf(m[0]);
    return { funcName: m[1], params: splitParams(m[2]), body: extractBody(clean.slice(startIdx)) };
  }

  m = clean.match(/(?:async\s+)?([a-zA-Z0-9_$]+)\s*\(([^)]*)\)\s*\{/);
  if (m && !['if','for','while','switch','catch','function'].includes(m[1])) {
    const startIdx = clean.indexOf(m[0]);
    return { funcName: m[1], params: splitParams(m[2]), body: extractBody(clean.slice(startIdx)) };
  }

  return { funcName: 'Solution', params: ['x', 'nums', 'target'], body: clean };
}

function splitParams(str) {
  return str.split(',').map(s => s.trim()).filter(Boolean);
}

function extractBody(code) {
  const start = code.indexOf('{');
  if (start === -1) return code;
  let depth = 0, i = start;
  for (; i < code.length; i++) {
    if (code[i] === '{') depth++;
    if (code[i] === '}') { depth--; if (depth === 0) break; }
  }
  return code.slice(start + 1, i);
}

// ── Instrumented Runner ────────────────────────────────────────────────────────
function runInstrumented(info, args) {
  const steps = [];
  let iterCount = 0;
  let infiniteLoop = false;

  /**
   * Push a step into the trace.
   * @param {object} vars     — snapshot of variables
   * @param {string} action   — label shown on the node
   * @param {string} note     — sub-label / value annotation
   * @param {boolean} ok      — whether step succeeded
   * @param {string} type     — 'init'|'assign'|'condition'|'loop'|'return'|'infinite'
   * @param {string} [cond]   — the condition text (for diamonds)
   * @param {*}      [condVal]— evaluated condition result
   */
  function _S(vars, action, note, ok, type, cond, condVal) {
    if (steps.length >= MAX_STEPS) return;
    steps.push({
      step:           steps.length + 1,
      vars:           safeClone(vars),
      action:         String(action),
      note:           String(note || ''),
      ok:             ok !== false,
      type:           type || 'assign',
      condition:      cond  || null,
      conditionValue: condVal !== undefined ? condVal : null,
    });
  }

  function _GUARD() {
    if (++iterCount > MAX_ITERS) {
      if (!infiniteLoop) {
        infiniteLoop = true;
        // Push a sentinel step so the renderer can draw the ♾️ node
        steps.push({
          step:           steps.length + 1,
          vars:           {},
          action:         '♾️ Infinite Loop Detected',
          note:           `Loop ran > ${MAX_ITERS} iterations without terminating`,
          ok:             false,
          type:           'infinite',
          condition:      null,
          conditionValue: null,
        });
      }
      // Throw to unwind the loop — caught below and swallowed
      throw new Error('__INFINITE_LOOP__');
    }
  }

  const transformed = transformBody(info.body, info.params);
  const paramList = info.params.join(', ');
  let result, error;
  try {
    const fn = new Function('_S', '_GUARD', paramList, transformed);
    result = fn(_S, _GUARD, ...args);
  } catch (err) {
    if (err.message === '__INFINITE_LOOP__') {
      // Already pushed the infinite step — just let it fall through
    } else {
      error = err.message;
      if (steps.length > 0) {
        steps[steps.length - 1].ok   = false;
        steps[steps.length - 1].note = '❌ Error: ' + error;
      }
    }
  }

  return { steps, result, error, infiniteLoop };
}

// ── Code Transformer ───────────────────────────────────────────────────────────
function transformBody(body, params) {
  const declared = new Set(params);
  const varDeclRe = /\b(?:let|var|const)\s+((?:[a-zA-Z_$][\w$]*\s*=?\s*[^,;\n{]*,?\s*)+)/g;
  let m;
  while ((m = varDeclRe.exec(body)) !== null) {
    const names = m[1].match(/\b([a-zA-Z_$][\w$]*)\s*(?:=|,|$)/g) || [];
    names.forEach(n => {
      const name = n.replace(/[\s=,]/g, '');
      if (name && !['let','const','var'].includes(name)) declared.add(name);
    });
  }

  const trackedNames = [...declared].filter(n =>
    n && n.length > 0 && !/^(true|false|null|undefined|Infinity|NaN)$/.test(n)
  );

  const lines = body.split('\n');
  const out   = [];

  const initSnap = '{' + params.map(p => p + ': (typeof ' + p + ' !== "undefined" ? ' + p + ' : undefined)').join(', ') + '}';
  out.push('_S(' + initSnap + ', "Function started", "Input parameters initialized", true, "init");');

  for (let i = 0; i < lines.length; i++) {
    const raw  = lines[i];
    const trim = raw.trim();

    if (!trim || trim.startsWith('//') || trim.startsWith('/*') || trim.startsWith('*')) {
      out.push(raw);
      continue;
    }

    // ── Variable declarations ──────────────────────────────────────────────────
    if (/^(?:let|var|const)\s/.test(trim)) {
      out.push(raw);
      const names = [];
      const nm = trim.match(/\b([a-zA-Z_$][\w$]*)\s*=/g) || [];
      nm.forEach(n => { const v = n.replace(/[\s=]/g, ''); if (v && !['let','var','const'].includes(v)) names.push(v); });
      if (names.length > 0) {
        const snap = '{' + names.map(n => n + ': (typeof ' + n + ' !== "undefined" ? ' + n + ' : undefined)').join(', ') + '}';
        out.push('_S(' + snap + ', "Init: ' + escStr(names.join(', ')) + '", "", true, "init");');
      }
      continue;
    }

    // ── While loop ────────────────────────────────────────────────────────────
    if (/^while\s*\(/.test(trim)) {
      const condMatch = trim.match(/^while\s*\((.+)\)\s*\{?$/);
      const cond = condMatch ? condMatch[1] : '...';
      // Inject before the while — record the condition check each iteration
      // We patch it so after each loop header we record condition + current values
      out.push(raw);
      out.push('_GUARD();');
      const snap = '_snapVars([' + trackedNames.map(n => JSON.stringify(n)).join(',') + '], {' +
        trackedNames.map(n => n + ': (typeof ' + n + ' !== "undefined" ? ' + n + ' : undefined)').join(', ') +
        '})';
      out.push('_S(' + snap + ', "Loop: ' + escStr(cond) + '", "", true, "loop", ' + JSON.stringify(cond) + ', true);');
      continue;
    }

    // ── For loop ──────────────────────────────────────────────────────────────
    if (/^for\s*\(/.test(trim)) {
      const condMatch = trim.match(/^for\s*\(([^;]*);([^;]*);([^)]*)\)/);
      const cond = condMatch ? condMatch[2].trim() : '...';
      out.push(raw);
      out.push('_GUARD();');
      const snap = '_snapVars([' + trackedNames.map(n => JSON.stringify(n)).join(',') + '], {' +
        trackedNames.map(n => n + ': (typeof ' + n + ' !== "undefined" ? ' + n + ' : undefined)').join(', ') +
        '})';
      out.push('_S(' + snap + ', "For: ' + escStr(cond) + '", "", true, "loop", ' + JSON.stringify(cond) + ', true);');
      continue;
    }

    // ── if/else-if condition ───────────────────────────────────────────────────
    if (/^if\s*\(|^else\s+if\s*\(/.test(trim)) {
      const condMatch = trim.match(/^(?:else\s+)?if\s*\((.+)\)\s*\{?$/);
      const cond = condMatch ? condMatch[1] : '...';
      out.push(raw);
      const snap = '_snapVars([' + trackedNames.map(n => JSON.stringify(n)).join(',') + '], {' +
        trackedNames.map(n => n + ': (typeof ' + n + ' !== "undefined" ? ' + n + ' : undefined)').join(', ') +
        '})';
      out.push('_S(' + snap + ', "Check: ' + escStr(cond) + '", "", true, "condition", ' + JSON.stringify(cond) + ');');
      continue;
    }

    // ── Increment / decrement ─────────────────────────────────────────────────
    if (/\b[a-zA-Z_$][\w$]*\s*(?:\+\+|--)/.test(trim) && !trim.startsWith('if') && !trim.startsWith('while')) {
      out.push(raw);
      const varMatch = trim.match(/\b([a-zA-Z_$][\w$]*)\s*(?:\+\+|--)/);
      if (varMatch) {
        const vn = varMatch[1];
        out.push('_S({' + vn + ': ' + vn + '}, "' + escStr(trim.replace(/;$/, '')) + '", String(' + vn + '), true, "assign");');
      }
      continue;
    }

    // ── Assignment ────────────────────────────────────────────────────────────
    if (/^[a-zA-Z_$][\w$ .\[\]]*\s*(?:\+|-|\*|\/)?=(?!=|>)/.test(trim) || /^\+\+[a-zA-Z]|^--[a-zA-Z]/.test(trim)) {
      out.push(raw);
      const varMatch = trim.match(/^([a-zA-Z_$][\w$]*)/);
      if (varMatch) {
        const vn = varMatch[1];
        out.push('_S({' + vn + ': (typeof ' + vn + ' !== "undefined" ? ' + vn + ' : undefined)}, "' +
          escStr(trim.replace(/;$/, '')) + '", (typeof ' + vn + ' !== "undefined" ? String(' + vn + ') : ""), true, "assign");');
      }
      continue;
    }

    // ── Return ────────────────────────────────────────────────────────────────
    if (/^return\b/.test(trim)) {
      const snap = '_snapVars([' + trackedNames.map(n => JSON.stringify(n)).join(',') + '], {' +
        trackedNames.map(n => n + ': (typeof ' + n + ' !== "undefined" ? ' + n + ' : undefined)').join(', ') +
        '})';
      out.push('_S(' + snap + ', "' + escStr(trim.replace(/;$/, '')) + '", "Function complete", true, "return");');
      out.push(raw);
      continue;
    }

    out.push(raw);
  }

  const helper = `
function _snapVars(names, obj) {
  const result = {};
  names.forEach(n => { if (obj[n] !== undefined && typeof obj[n] !== 'function') result[n] = obj[n]; });
  return result;
}
`;
  return helper + '\n' + out.join('\n');
}

function escStr(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
}

function parseInput(raw) {
  if (!raw) return [];
  const lines = raw.trim().split('\n').filter(Boolean);
  return lines.map(line => {
    const t = line.trim();
    try { return JSON.parse(t); } catch (_) { return t.replace(/^"|"$/g, ''); }
  });
}

function safeClone(obj) {
  try { return JSON.parse(JSON.stringify(obj)); } catch (_) { return {}; }
}

function findFirstFailStep(steps) {
  const f = steps.find(s => !s.ok);
  return f ? f.step : null;
}
