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

self.onmessage = function ({ data: { code, input, language } }) {
  try {
    const result = executeTrace(code, input, language);
    self.postMessage(result);
  } catch (err) {
    self.postMessage({ error: err.message });
  }
};

// ── Main entry ─────────────────────────────────────────────────────────────────
function executeTrace(rawCode, input, language) {
  // Transpile non-JS code to JavaScript before parsing
  const code = transpileToJS(rawCode, language);

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

// ── Multi-Language Transpiler ──────────────────────────────────────────────

/**
 * Route code to the correct transpiler based on language.
 * JS/TS pass through unchanged.
 */
function transpileToJS(code, language) {
  const lang = (language || '').toLowerCase();
  if (lang === 'java')                        return transpileJava(code);
  if (lang === 'python' || lang === 'python3') return transpilePython(code);
  if (lang === 'cpp' || lang === 'c++')        return transpileCpp(code);
  return code; // javascript, typescript — no transformation
}

/**
 * Java → JavaScript transpiler for LeetCode-style solutions.
 *
 * Handles:
 *  - class Solution { } wrapper removal
 *  - Method signature conversion: public int f(int[] a, int b) → function f(a, b)
 *  - Typed variable declarations: int x = → let x =
 *  - Integer division floor: l + (r-l)/2 → Math.floor(l + (r-l)/2)
 *  - Common Java APIs: Arrays.sort, new int[], System.out.println
 */
function transpileJava(code) {
  let js = code;

  // 1. Remove outer class { ... } wrapper
  js = js.replace(/^\s*(?:(?:public|private|abstract)\s+)?class\s+\w+(?:\s+(?:extends|implements)\s+[\w ,<>]+)?\s*\{/, '');
  // Remove the final matching } (class closing brace) — find the last one
  const lastClose = js.lastIndexOf('}');
  if (lastClose > js.length * 0.4) js = js.slice(0, lastClose) + '\n' + js.slice(lastClose + 1);

  // 2. Convert method signatures
  //    "public int search(int[] nums, int target) {" → "function search(nums, target) {"
  js = js.replace(
    /\b(?:public|private|protected)\s+(?:static\s+)?(?:(?:int|long|short|boolean|double|float|void|char|String|Integer|Long|Boolean|List|Map|Set|ArrayList|LinkedList|HashMap|TreeMap|int\[\]|long\[\])(?:<[^>]+>)?(?:\[\])?)\s+(\w+)\s*\(([^)]*)\)/g,
    (_, name, params) => {
      const cleanParams = params
        .split(',')
        .map(p => {
          const t = p.trim();
          // Take the last word as the variable name (after removing the type)
          const lastSpace = t.lastIndexOf(' ');
          return lastSpace >= 0 ? t.slice(lastSpace + 1).trim() : t;
        })
        .filter(Boolean)
        .join(', ');
      return `function ${name}(${cleanParams})`;
    }
  );

  // 3. Typed local variable declarations: "int x = ...", "long count = ..."
  js = js.replace(
    /\b(?:int|long|short|byte|double|float|boolean|char|String|Integer|Long|Boolean)(?:\[\])?\s+([a-zA-Z_]\w*)/g,
    'let $1'
  );

  // 4. Integer division — wrap /.../2 or /\d with Math.floor
  //    Pattern: anything = expr / integer_literal
  //    Most common: let m = l + ((r - l) / 2)
  js = js.replace(
    /(let\s+\w+\s*=\s*)([^;\n]+?\/\s*\d+)([;\n])/g,
    (match, decl, expr, end) => {
      if (expr.includes('Math.floor')) return match;
      return `${decl}Math.floor(${expr.trim()})${end}`;
    }
  );
  // Also handle re-assignment: m = expr / 2;
  js = js.replace(
    /^(\s*(?!\/\/)([a-zA-Z_]\w*)\s*=\s*)([^=;\n][^;\n]*?\/\s*\d+)(;)/gm,
    (match, assign, varName, expr, semi) => {
      if (['let','const','var'].includes(varName.trim())) return match;
      if (expr.includes('Math.floor')) return match;
      return `${assign}Math.floor(${expr.trim()})${semi}`;
    }
  );

  // 5. Common Java APIs
  js = js.replace(/Arrays\.sort\((\w+)\)/g, '$1.sort((a,b)=>a-b)');
  js = js.replace(/Collections\.sort\((\w+)\)/g, '$1.sort((a,b)=>a-b)');
  js = js.replace(/System\.out\.println\s*\(/g, 'console.log(');
  js = js.replace(/new\s+int\[([^\]]+)\]/g, 'new Array($1).fill(0)');
  js = js.replace(/new\s+boolean\[([^\]]+)\]/g, 'new Array($1).fill(false)');
  js = js.replace(/new\s+(?:ArrayList|LinkedList)(?:<[^>]+>)?\(\)/g, '[]');
  js = js.replace(/new\s+(?:HashMap|TreeMap|HashSet|LinkedHashMap)(?:<[^>]+>)?\(\)/g, 'new Map()');
  js = js.replace(/\.size\(\)/g, '.size');
  js = js.replace(/\.get\(/g, '.get(');

  // 6. Remove remaining Java-only keywords
  js = js.replace(/\b(?:static|final|abstract|synchronized|volatile|transient)\s+/g, '');

  return js.trim();
}

/**
 * Python 3 → JavaScript transpiler.
 * Handles: def, typed hints, range, print, len, append.
 */
function transpilePython(code) {
  let js = code;

  // class Solution: wrapper removal
  js = js.replace(/^class\s+Solution\s*:\s*/m, '');

  // def methodName(self, params) → function methodName(params)
  js = js.replace(
    /def\s+(\w+)\s*\(self(?:,\s*)?([^)]*)\)\s*(?:->\s*[^:]+)?:/g,
    (_, name, params) => {
      // Remove type annotations: "nums: List[int], target: int" → "nums, target"
      const cleanParams = params
        .split(',')
        .map(p => p.trim().replace(/:\s*[^,=]+/, '').replace(/=\s*[^,]+/, '').trim())
        .filter(Boolean)
        .join(', ');
      return `function ${name}(${cleanParams}) {`;
    }
  );

  // Convert Python indented blocks to braced blocks (very basic)
  // This is simplified — handles common cases only
  js = js.replace(/:\s*\n/g, ' {\n');
  js = js.replace(/\bTrue\b/g, 'true');
  js = js.replace(/\bFalse\b/g, 'false');
  js = js.replace(/\bNone\b/g, 'null');
  js = js.replace(/\blen\(([^)]+)\)/g, '$1.length');
  js = js.replace(/\brange\((\d+),\s*(\w+)\)/g, 'Array.from({length:$2-$1},(_,i)=>i+$1)');
  js = js.replace(/\brange\((\w+)\)/g, 'Array.from({length:$1},(_,i)=>i)');
  js = js.replace(/\.append\(/g, '.push(');
  js = js.replace(/\bprint\(/g, 'console.log(');
  js = js.replace(/\bint\(([^)]+)\)/g, 'Math.floor($1)');
  js = js.replace(/\bself\./g, 'this.');
  js = js.replace(/\bor\b/g, '||');
  js = js.replace(/\band\b/g, '&&');
  js = js.replace(/\bnot\s+/g, '!');

  return js;
}

/** C++ → JS: minimal — handles simple array/loop patterns */
function transpileCpp(code) {
  let js = code;
  // Remove class Solution and public:
  js = js.replace(/class\s+Solution\s*\{[\s\S]*?public:/g, '');
  js = js.replace(/\b(?:int|long|bool|double|float|auto|vector<[^>]+>|string)\s+([a-zA-Z_]\w*)/g, 'let $1');
  js = js.replace(/\bstd::vector<[^>]+>\s*([a-zA-Z_]\w*)/g, 'let $1');
  js = js.replace(/\.size\(\)/g, '.length');
  js = js.replace(/\.push_back\(/g, '.push(');
  js = js.replace(/cout\s*<<\s*/g, 'console.log(');
  js = js.replace(/::/g, '.');
  js = js.replace(/true/g, 'true').replace(/false/g, 'false');
  return js.trim();
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
