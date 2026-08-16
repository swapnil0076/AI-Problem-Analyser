/**
 * codeAnalyzer.js — Local static analysis agent tools.
 *
 * Runs entirely in the browser extension (zero API cost, zero tokens).
 * Pre-computes pattern, complexity hints, and data structures so the LLM
 * only needs to confirm + format JSON instead of reasoning from scratch.
 *
 * Token savings: ~2,300 reasoning tokens → ~100 (≈10x reduction).
 */

// ─── Tool 1: Pattern Detector ─────────────────────────────────────────────────

/**
 * Detects the algorithm pattern from code structure and LeetCode topic tags.
 * @param {string} code
 * @param {Array<{name: string, slug: string}>} tags  — LeetCode topicTags
 * @returns {{ name: string, confidence: 'high'|'medium'|'low' }}
 */
export function detectPattern(code, tags = []) {
  const c = code.toLowerCase();
  const tagNames = tags.map(t => t.name?.toLowerCase() ?? '');

  const rules = [
    // ── High-signal structural patterns ──────────────────────────────────────
    {
      name: 'Union Find',
      confidence: 'high',
      test: () => /parent\[|\.find\(|\.union\(|find_parent|union_find/i.test(code),
    },
    {
      name: 'Trie',
      confidence: 'high',
      test: () => /trie|trienode|children\[|\.startswith\(/i.test(code),
    },
    {
      name: 'Monotonic Stack',
      confidence: 'high',
      test: () => /(stack|stk).*while.*stack|while.*stack.*pop/i.test(code) &&
                  /next.greater|prev.smaller|largest.rectangle/i.test(c),
    },
    {
      name: 'Binary Search',
      confidence: 'high',
      test: () => /\b(lo|low|left)\s*[+\-]\s*(hi|high|right)\s*(>>|\/)\s*1|\bmid\b.*\b(lo|left)\b|\b(lo|left)\b.*\bmid\b/i.test(code) &&
                  /while\s*\(\s*(lo|low|left)\s*<=?\s*(hi|high|right)/i.test(code),
    },
    {
      name: 'Sliding Window',
      confidence: 'high',
      test: () => /window(start|end|size)|shrink|expand.*window|(left|start)\s*\+\+.*right\+\+/i.test(code),
    },
    {
      name: 'Two Pointers',
      confidence: 'high',
      test: () => /\b(left|lo|i)\s*=\s*0[^;]*\b(right|hi|j)\s*=\s*(n|len|nums\.length|s\.length)\s*[-\d]/i.test(code),
    },
    {
      name: 'Dynamic Programming',
      confidence: 'high',
      test: () => /(memo|cache|dp)\s*[\[=\(]|@lru_cache|functools\.cache/i.test(code),
    },
    {
      name: 'DFS / Backtracking',
      confidence: 'high',
      test: () => /\b(dfs|backtrack)\s*\(|def dfs|function dfs|const dfs/i.test(code),
    },
    {
      name: 'BFS',
      confidence: 'high',
      test: () => /\b(bfs)\s*\(|queue\.(push|append|offer)|deque\(\[|\.shift\(\)|popleft\(\)/i.test(code) &&
                  /while\s*\(\s*(queue|q)\s*\.(length|size)/i.test(code),
    },
    {
      name: 'Heap / Priority Queue',
      confidence: 'high',
      test: () => /priority.?queue|heapq\.|min.?heap|max.?heap|heappush|heappop/i.test(code),
    },
    {
      name: 'Divide and Conquer',
      confidence: 'medium',
      test: () => /merge.?sort|quick.?sort|divide.*conquer/i.test(code),
    },

    // ── Medium-signal patterns ────────────────────────────────────────────────
    {
      name: 'Hash Map',
      confidence: 'medium',
      test: () => /(new Map|HashMap|defaultdict|Counter\(|{}\s*;)/.test(code) &&
                  !/dfs|bfs|dp\[/.test(c),
    },
    {
      name: 'Two Pointers',
      confidence: 'medium',
      test: () => /\b(left|right|lo|hi|slow|fast)\b/.test(c) && countOccurrences(c, 'while') >= 1,
    },

    // ── Tag-based fallbacks (low confidence) ─────────────────────────────────
    {
      name: 'Dynamic Programming',
      confidence: 'low',
      test: () => tagNames.includes('dynamic programming'),
    },
    {
      name: 'Graph',
      confidence: 'low',
      test: () => tagNames.some(t => ['graph', 'topological sort', 'shortest path'].includes(t)),
    },
    {
      name: 'Greedy',
      confidence: 'low',
      test: () => tagNames.includes('greedy'),
    },
    {
      name: 'Recursion',
      confidence: 'low',
      test: () => /function\s+\w+\s*\([^)]*\)\s*\{[^}]*\1\s*\(/m.test(code) || tagNames.includes('recursion'),
    },
  ];

  for (const rule of rules) {
    if (rule.test()) return { name: rule.name, confidence: rule.confidence };
  }

  return { name: 'Iterative / Ad-hoc', confidence: 'low' };
}

// ─── Tool 2: Complexity Estimator ─────────────────────────────────────────────

/**
 * Statically estimates time and space complexity from code structure.
 * @param {string} code
 * @param {string} language
 * @returns {{
 *   time: string, space: string,
 *   loopDepth: number, hasSort: boolean,
 *   hasRecursion: boolean, hasMemo: boolean
 * }}
 */
export function estimateComplexity(code, language) {
  const c = code.toLowerCase();

  const hasSort      = /\.sort\(|collections\.sort|arrays\.sort|sort\.slice|std::sort|sorted\(/i.test(code);
  const hasMemo      = /memo|cache|dp\[|@lru_cache|functools\.cache/i.test(code);
  const hasRecursion = detectRecursion(code);
  const hasBinarySearch =
    /while\s*\(\s*(lo|low|left)\s*<=?\s*(hi|high|right)/i.test(code) &&
    /mid\s*=/.test(code);
  const hasBFS =
    /queue\.(push|append|offer)|\.shift\(\)|popleft\(\)/i.test(code);

  const loopDepth    = getMaxLoopNestingDepth(code);

  // ── Time complexity ────────────────────────────────────────────────────────
  let time;
  if (hasBinarySearch && loopDepth <= 1) {
    time = 'O(log n)';
  } else if (loopDepth === 0 && hasRecursion && hasMemo) {
    time = 'O(n)';           // memoized recursion (typical DP)
  } else if (loopDepth === 0 && hasRecursion && !hasMemo) {
    time = 'O(2^n)';         // plain recursion — likely exponential
  } else if (loopDepth === 1 && hasSort) {
    time = 'O(n log n)';     // sort dominates single loop
  } else if (loopDepth === 1 && hasBFS) {
    time = 'O(V + E)';       // BFS/DFS graph
  } else if (loopDepth === 0) {
    time = 'O(n)';
  } else {
    time = `O(n^${loopDepth})`;   // nested loops
  }

  // ── Space complexity ───────────────────────────────────────────────────────
  const hasHashAlloc   = /(new Map|new Set|HashMap|HashSet|defaultdict|Counter\(|\{\})/i.test(code);
  const hasArrayAlloc  = /(new Array|Array\.from|new int\[|new List|= \[\])/i.test(code);
  const hasRecursiveStack = hasRecursion;

  let space;
  if (hasMemo || hasHashAlloc || hasArrayAlloc) {
    space = 'O(n)';
  } else if (hasRecursiveStack) {
    space = 'O(n)';         // call stack
  } else if (hasBFS) {
    space = 'O(V)';         // BFS queue
  } else {
    space = 'O(1)';
  }

  return { time, space, loopDepth, hasSort, hasRecursion, hasMemo };
}

// ─── Tool 3: Data Structure Detector ──────────────────────────────────────────

/**
 * Identifies data structures used in the code.
 * @param {string} code
 * @returns {string[]}  e.g. ["HashMap", "Stack", "Heap"]
 */
export function detectDataStructures(code) {
  const found = [];

  const checks = [
    { name: 'HashMap / Dictionary', pattern: /new Map\(|HashMap|defaultdict|Counter\(|\{\}\s*[;=]/ },
    { name: 'Set',                  pattern: /new Set\(|HashSet|set\(\)|Set\(\)/ },
    { name: 'Stack',                pattern: /\bstack\b|\bstk\b/ },
    { name: 'Queue / Deque',        pattern: /\bqueue\b|\bdeque\b|ArrayDeque|LinkedList/ },
    { name: 'Heap / PriorityQueue', pattern: /heapq\.|PriorityQueue|MinHeap|MaxHeap|heappush/ },
    { name: 'Trie',                 pattern: /Trie|TrieNode|\.children\[/ },
    { name: 'Graph (adjacency)',    pattern: /adj(acency)?\[|graph\[|neighbors/ },
    { name: 'Array / List',         pattern: /new Array\(|Array\.from\(|= \[\]|\[\]\.append/ },
    { name: 'Linked List',          pattern: /ListNode|\.next\s*=|next\.val/ },
    { name: 'Binary Tree',          pattern: /TreeNode|\.left\s*=|\.right\s*=/ },
  ];

  for (const { name, pattern } of checks) {
    if (pattern.test(code)) found.push(name);
  }

  return found.length > 0 ? found : ['Array / List'];
}

// ─── Public Aggregator ────────────────────────────────────────────────────────

/**
 * Runs all three tools and returns a combined hints object.
 * @param {string} code
 * @param {string} language
 * @param {Array<{name:string,slug:string}>} tags
 * @returns {{ pattern, complexity, structures }}
 */
export function analyzeCode(code, language, tags = []) {
  return {
    pattern:    detectPattern(code, tags),
    complexity: estimateComplexity(code, language),
    structures: detectDataStructures(code),
  };
}

// ─── Private Helpers ──────────────────────────────────────────────────────────

function countOccurrences(str, sub) {
  return (str.match(new RegExp(sub, 'g')) ?? []).length;
}

/**
 * Returns the maximum nesting depth of for/while loops.
 * Walks character-by-character tracking brace depth changes after loop keywords.
 */
function getMaxLoopNestingDepth(code) {
  // Strip strings and comments to avoid false positives
  const stripped = code
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""');

  const loopKeyword = /\b(for|while)\b/g;
  let maxDepth = 0;
  let depth    = 0;
  let lastIdx  = 0;
  let match;

  // Collect brace positions and loop keyword positions in one pass
  const events = []; // { idx, type: 'loop'|'open'|'close' }
  loopKeyword.lastIndex = 0;
  while ((match = loopKeyword.exec(stripped)) !== null) {
    events.push({ idx: match.index, type: 'loop' });
  }
  for (let i = 0; i < stripped.length; i++) {
    if (stripped[i] === '{') events.push({ idx: i, type: 'open' });
    if (stripped[i] === '}') events.push({ idx: i, type: 'close' });
  }
  events.sort((a, b) => a.idx - b.idx);

  let loopDepth   = 0;
  let braceStack  = []; // tracks whether each open-brace belongs to a loop

  for (const ev of events) {
    if (ev.type === 'loop') {
      loopDepth++;           // next '{' will be counted as a loop brace
    } else if (ev.type === 'open') {
      if (loopDepth > 0) {
        braceStack.push('loop');
        loopDepth = Math.max(0, loopDepth - 1);
      } else {
        braceStack.push('other');
      }
      const currentNest = braceStack.filter(b => b === 'loop').length;
      if (currentNest > maxDepth) maxDepth = currentNest;
    } else if (ev.type === 'close') {
      braceStack.pop();
    }
  }

  // Fallback for Python / languages without braces: count indentation levels
  if (maxDepth === 0 && /\bfor\b|\bwhile\b/.test(stripped)) {
    maxDepth = estimatePythonLoopDepth(stripped);
  }

  return maxDepth;
}

/** Estimate loop depth for Python-style indent-based code */
function estimatePythonLoopDepth(code) {
  const lines = code.split('\n');
  let maxDepth = 0, depth = 0;
  for (const line of lines) {
    const indent = line.match(/^(\s*)/)[1].length;
    const isLoop = /^\s*(for|while)\s/.test(line);
    if (isLoop) {
      depth = Math.floor(indent / 4) + 1;
      if (depth > maxDepth) maxDepth = depth;
    }
  }
  return maxDepth;
}

/** Detect if the code has a recursive call (function calls itself by name) */
function detectRecursion(code) {
  // Match: function/def declarations, then check if that name appears in the body
  const fnMatch = code.match(
    /(?:function\s+(\w+)|def\s+(\w+)|const\s+(\w+)\s*=\s*(?:function|\())/
  );
  if (!fnMatch) return false;
  const fnName = fnMatch[1] ?? fnMatch[2] ?? fnMatch[3];
  if (!fnName) return false;
  // Count occurrences of fnName — more than 1 means it's called inside itself
  return countOccurrences(code, `\\b${fnName}\\b`) > 1;
}
