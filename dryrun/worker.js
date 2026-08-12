'use strict';

/**
 * worker.js — Web Worker for local step execution & code tracing.
 * Runs in its own sandbox thread. No double-escaping needed.
 */

const MAX_STEPS  = 30;  // cap steps shown
const MAX_ITERS  = 500; // hard cap on loop iterations (safety)

self.onmessage = function({ data: { code, input } }) {
  try {
    const result = executeTrace(code, input);
    self.postMessage(result);
  } catch (err) {
    self.postMessage({ error: err.message });
  }
};

// ── Main entry ─────────────────────────────────────────────────────────────────
function executeTrace(code, input) {
  // 1. Parse and transform the user's code
  const info = parseCode(code);
  if (!info) {
    return { error: 'Could not parse your code. Make sure it is a valid JavaScript function.' };
  }

  // 2. Parse example input or generate sensible defaults
  const parsedArgs = parseInput(input);
  const args = getSampleArgs(info.params, parsedArgs);

  // 3. Build the instrumented executor
  const { steps, result, error } = runInstrumented(info, args);

  return {
    algorithm: info.funcName || 'Solution',
    input: input || JSON.stringify(args),
    steps,
    result: error
      ? ('❌ Runtime Error: ' + error)
      : (result !== undefined ? JSON.stringify(result) : '(no return value)'),
    isCorrect: !error,
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
  // Strip block and line comments
  let clean = (code || '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '').trim();

  // Strip basic TypeScript type annotations (e.g. x: number, : number)
  clean = clean.replace(/:\s*[A-Za-z0-9_<>\[\]|]+/g, '');

  // 1. Match var/let/const name = function(params) or var name = (params) =>
  let m = clean.match(/(?:var|let|const|this\.)\s*([a-zA-Z0-9_$]+)\s*=\s*(?:function)?\s*\(([^)]*)\)/);
  if (m) {
    const startIdx = clean.indexOf(m[0]);
    return { funcName: m[1], params: splitParams(m[2]), body: extractBody(clean.slice(startIdx)) };
  }

  // 2. Match standard function declaration: function name(params)
  m = clean.match(/function\s+([a-zA-Z0-9_$]+)\s*\(([^)]*)\)/);
  if (m) {
    const startIdx = clean.indexOf(m[0]);
    return { funcName: m[1], params: splitParams(m[2]), body: extractBody(clean.slice(startIdx)) };
  }

  // 3. Match class method or shorthand: reverse(params) { or name: function(params)
  m = clean.match(/(?:async\s+)?([a-zA-Z0-9_$]+)\s*\(([^)]*)\)\s*\{/);
  if (m && !['if','for','while','switch','catch','function'].includes(m[1])) {
    const startIdx = clean.indexOf(m[0]);
    return { funcName: m[1], params: splitParams(m[2]), body: extractBody(clean.slice(startIdx)) };
  }

  // 4. Fallback: Use full clean snippet as body
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

  function _S(vars, action, note, ok) {
    if (steps.length >= MAX_STEPS) return;
    steps.push({
      step:   steps.length + 1,
      vars:   safeClone(vars),
      action: String(action),
      note:   String(note || ''),
      ok:     ok !== false,
    });
  }

  function _GUARD() {
    if (++iterCount > MAX_ITERS) throw new Error(`Loop exceeded ${MAX_ITERS} iterations (infinite loop?)`);
  }

  const transformed = transformBody(info.body, info.params);

  const paramList = info.params.join(', ');
  let result, error;
  try {
    const fn = new Function('_S', '_GUARD', paramList, transformed);
    result = fn(_S, _GUARD, ...args);
  } catch (err) {
    error = err.message;
    if (steps.length > 0) {
      steps[steps.length - 1].ok   = false;
      steps[steps.length - 1].note = '❌ Error: ' + error;
    }
  }

  return { steps, result, error };
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
      if (name && !['let','const','var'].includes(name)) {
        declared.add(name);
      }
    });
  }

  const trackedNames = [...declared].filter(n =>
    n && n.length > 0 && !/^(true|false|null|undefined|Infinity|NaN)$/.test(n)
  );

  const lines = body.split('\n');
  const out   = [];

  const initSnap = '{' + params.map(p => p + ': (typeof ' + p + ' !== "undefined" ? ' + p + ' : undefined)').join(', ') + '}';
  out.push('_S(' + initSnap + ', "Function started", "Input parameters initialized", true);');

  for (let i = 0; i < lines.length; i++) {
    const raw  = lines[i];
    const trim = raw.trim();

    if (!trim || trim.startsWith('//') || trim.startsWith('/*') || trim.startsWith('*')) {
      out.push(raw);
      continue;
    }

    if (/^(?:let|var|const)\s/.test(trim)) {
      out.push(raw);
      const names = [];
      const nm = trim.match(/\b([a-zA-Z_$][\w$]*)\s*=/g) || [];
      nm.forEach(n => { const v = n.replace(/[\s=]/g, ''); if (v && !['let','var','const'].includes(v)) names.push(v); });
      if (names.length > 0) {
        const initSnap = '{' + names.map(n => n + ': (typeof ' + n + ' !== "undefined" ? ' + n + ' : undefined)').join(', ') + '}';
        out.push('_S(' + initSnap + ', "Initialize: ' + names.join(', ') + '", "", true);');
      }
      continue;
    }

    if (/^while\s*\(/.test(trim)) {
      const condMatch = trim.match(/^while\s*\((.+)\)\s*\{?$/);
      const cond = condMatch ? condMatch[1] : '...';
      out.push(raw);
      out.push('_GUARD();');
      out.push('_S(_snapVars([' + trackedNames.map(n => JSON.stringify(n)).join(',') + '], {' +
        trackedNames.map(n => n + ': (typeof ' + n + ' !== "undefined" ? ' + n + ' : undefined)').join(', ') +
        '}), "Loop: ' + escStr(cond) + '", "", true);');
      continue;
    }

    if (/^for\s*\(/.test(trim)) {
      out.push(raw);
      out.push('_GUARD();');
      out.push('_S(_snapVars([' + trackedNames.map(n => JSON.stringify(n)).join(',') + '], {' +
        trackedNames.map(n => n + ': (typeof ' + n + ' !== "undefined" ? ' + n + ' : undefined)').join(', ') +
        '}), "For loop iteration", "", true);');
      continue;
    }

    if (/\b[a-zA-Z_$][\w$]*\s*(?:\+\+|--)/.test(trim) && !trim.startsWith('if') && !trim.startsWith('while')) {
      out.push(raw);
      const varMatch = trim.match(/\b([a-zA-Z_$][\w$]*)\s*(?:\+\+|--)/);
      if (varMatch) {
        const vn = varMatch[1];
        out.push('_S({' + vn + ': ' + vn + '}, "' + escStr(trim.replace(/;$/, '')) + '", "", true);');
      }
      continue;
    }

    if (/^[a-zA-Z_$][\w$ .\[\]]*\s*(?:\+|-|\*|\/)?=(?!=|>)/.test(trim) || /^\+\+[a-zA-Z]|^--[a-zA-Z]/.test(trim)) {
      out.push(raw);
      const varMatch = trim.match(/^([a-zA-Z_$][\w$]*)/);
      if (varMatch) {
        const vn = varMatch[1];
        out.push('_S({' + vn + ': (typeof ' + vn + ' !== "undefined" ? ' + vn + ' : undefined)}, "' + escStr(trim.replace(/;$/, '')) + '", "", true);');
      }
      continue;
    }

    if (/^return\b/.test(trim)) {
      out.push('_S(_snapVars([' + trackedNames.map(n => JSON.stringify(n)).join(',') + '], {' +
        trackedNames.map(n => n + ': (typeof ' + n + ' !== "undefined" ? ' + n + ' : undefined)').join(', ') +
        '}), "return", "Function complete", true);');
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
    try {
      return JSON.parse(t);
    } catch (_) {
      return t.replace(/^"|"$/g, '');
    }
  });
}

function safeClone(obj) {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (_) {
    return {};
  }
}

function findFirstFailStep(steps) {
  const f = steps.find(s => !s.ok);
  return f ? f.step : null;
}
