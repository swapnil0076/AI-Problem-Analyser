/**
 * flowchartGenerator.js — Generates SVG Algorithmic Flowcharts & Dry Run Visuals.
 *
 * Converts code logic & patterns into clean, dark-themed SVG flowchart diagrams
 * (Process cards, Decision diamonds, Branching Yes/No paths, and Return terminals).
 * Zero tokens, instant local rendering.
 */

/**
 * Generates an SVG flowchart string and structured execution steps.
 * @param {Object} options
 * @param {string} options.code
 * @param {string} options.language
 * @param {Object} options.pattern  — { name, confidence }
 * @param {Object} options.problemData — { title, difficulty, topicTags }
 * @returns {{ svg: string, steps: Array<{ title: string, detail: string, type: string }> }}
 */
export function generateFlowchart({ code = '', language = '', pattern = {}, problemData = {} }) {
  const nodes = extractFlowNodes(code, language, pattern, problemData);
  const svg = renderSvgFlowchart(nodes);
  const steps = nodes.map((node, i) => ({
    stepNum: i + 1,
    title: node.title,
    detail: node.detail || '',
    type: node.type || 'process'
  }));

  return { svg, steps };
}

/**
 * Extracts flowchart node graph from code & pattern heuristics.
 */
function extractFlowNodes(code, language, pattern, problemData) {
  const patName = (pattern.name || '').toLowerCase();
  const c = code.toLowerCase();

  // 1. Hash Map (Two Sum style)
  if (patName.includes('hash') || (c.includes('map') && c.includes('target'))) {
    return [
      { id: 'init', type: 'process', title: 'Initialize Hash Map', detail: 'number_map = {} to track visited elements & indices' },
      { id: 'loop', type: 'loop', title: 'Loop through elements using index i', detail: 'Iterate 0 ≤ i < nums.length' },
      { id: 'calc', type: 'process', title: 'Calculate Complement', detail: 'complement = target - nums[i]' },
      { id: 'decision', type: 'decision', title: 'Check if complement in map?', detail: 'Does number_map contain complement?', yes: 'return_found', no: 'add_map' },
      { id: 'return_found', type: 'terminal', title: 'Return Pair Indices', detail: 'return [number_map[complement], i]' },
      { id: 'add_map', type: 'process', title: 'Add nums[i] to map', detail: 'number_map[nums[i]] = i and continue loop', loopBackTo: 'loop' },
      { id: 'exit', type: 'terminal', title: 'No Solution Found', detail: 'Return default / empty if loop completes' }
    ];
  }

  // 2. Binary Search
  if (patName.includes('binary search') || (c.includes('mid') && c.includes('left') && c.includes('right'))) {
    return [
      { id: 'init', type: 'process', title: 'Initialize Pointers', detail: 'low = 0, high = nums.length - 1' },
      { id: 'loop', type: 'loop', title: 'While low ≤ high', detail: 'Continue search space reduction' },
      { id: 'mid', type: 'process', title: 'Calculate Midpoint', detail: 'mid = low + (high - low) / 2' },
      { id: 'decision_match', type: 'decision', title: 'nums[mid] == target?', detail: 'Found target at mid?', yes: 'return_mid', no: 'check_branch' },
      { id: 'return_mid', type: 'terminal', title: 'Return Target Index', detail: 'return mid' },
      { id: 'check_branch', type: 'decision', title: 'nums[mid] < target?', detail: 'Is target in the right half?', yes: 'right_half', no: 'left_half' },
      { id: 'right_half', type: 'process', title: 'Narrow to Right Half', detail: 'low = mid + 1', loopBackTo: 'loop' },
      { id: 'left_half', type: 'process', title: 'Narrow to Left Half', detail: 'high = mid - 1', loopBackTo: 'loop' },
      { id: 'exit', type: 'terminal', title: 'Target Not Found', detail: 'return -1 (exhausted search space)' }
    ];
  }

  // 3. Two Pointers
  if (patName.includes('two pointers') || (c.includes('left') && c.includes('right'))) {
    return [
      { id: 'init', type: 'process', title: 'Initialize Pointers', detail: 'left = 0, right = length - 1' },
      { id: 'loop', type: 'loop', title: 'While left < right', detail: 'Iterate towards center from both ends' },
      { id: 'decision_match', type: 'decision', title: 'Target condition met?', detail: 'Evaluate nums[left] and nums[right]', yes: 'return_found', no: 'shift_ptr' },
      { id: 'return_found', type: 'terminal', title: 'Return Result', detail: 'return current pair or result' },
      { id: 'shift_ptr', type: 'process', title: 'Advance Left or Right', detail: 'Adjust left++ or right-- based on comparison', loopBackTo: 'loop' },
      { id: 'exit', type: 'terminal', title: 'Loop Finishes', detail: 'Return default / accumulated answer' }
    ];
  }

  // 4. Sliding Window
  if (patName.includes('sliding window') || c.includes('window')) {
    return [
      { id: 'init', type: 'process', title: 'Initialize Window State', detail: 'left = 0, current_window = {} / 0' },
      { id: 'loop', type: 'loop', title: 'Expand Right Pointer', detail: 'for right = 0 to length - 1' },
      { id: 'add', type: 'process', title: 'Include item[right]', detail: 'Update window sum / frequency count' },
      { id: 'decision_shrink', type: 'decision', title: 'Window invalid / violated?', detail: 'Check if window exceeds constraint', yes: 'shrink', no: 'update_max' },
      { id: 'shrink', type: 'process', title: 'Shrink Left Pointer', detail: 'Remove item[left], left++', loopBackTo: 'decision_shrink' },
      { id: 'update_max', type: 'process', title: 'Update Best Result', detail: 'max_len = Math.max(max_len, right - left + 1)', loopBackTo: 'loop' },
      { id: 'exit', type: 'terminal', title: 'Return Optimal Result', detail: 'return max_len / optimal window state' }
    ];
  }

  // 5. BFS (Queue)
  if (patName.includes('bfs') || c.includes('queue') || c.includes('deque')) {
    return [
      { id: 'init', type: 'process', title: 'Queue & Visited Setup', detail: 'queue = [start_node], visited = {start_node}' },
      { id: 'loop', type: 'loop', title: 'While queue is not empty', detail: 'Process nodes level by level' },
      { id: 'pop', type: 'process', title: 'Dequeue Current Node', detail: 'curr = queue.pop_front()' },
      { id: 'decision_goal', type: 'decision', title: 'Is curr the target?', detail: 'Check goal / target condition', yes: 'return_dist', no: 'expand' },
      { id: 'return_dist', type: 'terminal', title: 'Return Path / Level', detail: 'return distance or found node' },
      { id: 'expand', type: 'process', title: 'Enqueue Unvisited Neighbors', detail: 'For each neighbor of curr: add to queue and mark visited', loopBackTo: 'loop' },
      { id: 'exit', type: 'terminal', title: 'Queue Exhausted', detail: 'Return default / not reachable' }
    ];
  }

  // 6. DFS / Backtracking
  if (patName.includes('dfs') || patName.includes('backtrack') || c.includes('backtrack')) {
    return [
      { id: 'start', type: 'process', title: 'Invoke DFS(state)', detail: 'Initialize path, visited tracking' },
      { id: 'base_case', type: 'decision', title: 'Base Case / Goal Met?', detail: 'Check if leaf node or valid solution', yes: 'record_solution', no: 'explore' },
      { id: 'record_solution', type: 'terminal', title: 'Record Solution', detail: 'Add current path to results and return' },
      { id: 'explore', type: 'process', title: 'Loop Available Choices', detail: 'For each candidate choice from current state' },
      { id: 'recurse', type: 'process', title: 'Make Choice & Recurse', detail: 'Apply choice -> DFS(next_state) -> Undo choice (Backtrack)', loopBackTo: 'explore' },
      { id: 'exit', type: 'terminal', title: 'Return All Collected Paths', detail: 'return results' }
    ];
  }

  // 7. Dynamic Programming
  if (patName.includes('dynamic') || c.includes('dp[') || c.includes('memo')) {
    return [
      { id: 'init', type: 'process', title: 'Initialize DP Table', detail: 'dp = Array(n + 1) with base cases (e.g. dp[0] = 1)' },
      { id: 'loop', type: 'loop', title: 'Iterate Subproblems (i = 1..n)', detail: 'Build solutions bottom-up from smallest subproblem' },
      { id: 'trans', type: 'process', title: 'State Transition Formula', detail: 'dp[i] = optimal(dp[i-1], dp[i-2] + cost[i], ...)' },
      { id: 'loop_check', type: 'decision', title: 'More subproblems?', detail: 'Has loop reached target n?', yes: 'loop', no: 'return_dp' },
      { id: 'return_dp', type: 'terminal', title: 'Return Final State', detail: 'return dp[n] (accumulated optimal solution)' }
    ];
  }

  // 8. String / Prefix scanning (e.g. Longest Common Prefix)
  if (c.includes('prefix') || c.includes('indexof') || c.includes('charat')) {
    return [
      { id: 'init', type: 'process', title: 'Initialize Reference Prefix', detail: 'prefix = strs[0]' },
      { id: 'loop', type: 'loop', title: 'Loop through remaining strings', detail: 'for i = 1 to strs.length - 1' },
      { id: 'decision_match', type: 'decision', title: 'strs[i] starts with prefix?', detail: 'Check prefix match on current word', yes: 'next_word', no: 'trim_prefix' },
      { id: 'next_word', type: 'process', title: 'Word Matches Prefix', detail: 'Proceed to next string in array', loopBackTo: 'loop' },
      { id: 'trim_prefix', type: 'process', title: 'Shorten Prefix by 1 char', detail: 'prefix = prefix.substring(0, len - 1)' },
      { id: 'decision_empty', type: 'decision', title: 'Is prefix now empty?', detail: 'Check if common prefix shrunk to 0 length', yes: 'return_empty', no: 'decision_match' },
      { id: 'return_empty', type: 'terminal', title: 'Return Empty String', detail: 'return "" (no common prefix)' },
      { id: 'exit', type: 'terminal', title: 'Return Common Prefix', detail: 'return prefix (matches all input strings)' }
    ];
  }

  // 9. General Structural Fallback from parsed statements
  return extractGenericFlow(code);
}

/**
 * Extracts generic control flow for arbitrary user code.
 */
function extractGenericFlow(code) {
  const nodes = [
    { id: 'start', type: 'process', title: 'Initialize Function Parameters', detail: 'Read inputs and initialize state variables' }
  ];

  if (/for|while/i.test(code)) {
    nodes.push({ id: 'loop', type: 'loop', title: 'Loop Iteration', detail: 'Traverse elements / evaluate loop condition' });
  }

  if (/if\s*\(/i.test(code)) {
    nodes.push({
      id: 'cond',
      type: 'decision',
      title: 'Evaluate Condition',
      detail: 'Check branch condition / target match',
      yes: 'branch_true',
      no: 'branch_false'
    });
    nodes.push({ id: 'branch_true', type: 'process', title: 'Update State / Found Action', detail: 'Execute truthy branch logic' });
  } else {
    nodes.push({ id: 'step', type: 'process', title: 'Process Elements', detail: 'Perform transformation / accumulation' });
  }

  nodes.push({ id: 'ret', type: 'terminal', title: 'Return Final Output', detail: 'Return accumulated solution value' });
  return nodes;
}

/**
 * Renders an interactive, dark-themed SVG flowchart representation.
 */
function renderSvgFlowchart(nodes) {
  const nodeWidth = 240;
  const nodeHeight = 54;
  const diamondSize = 64;
  const gapY = 42;
  const startX = 140;
  let currentY = 24;

  const renderedNodes = [];
  const lines = [];

  // 1. Calculate Positions
  nodes.forEach((node, index) => {
    const isDiamond = node.type === 'decision';
    const h = isDiamond ? diamondSize * 1.3 : nodeHeight;
    const y = currentY;
    renderedNodes.push({ ...node, x: startX, y, width: nodeWidth, height: h, isDiamond });
    currentY += h + gapY;
  });

  const totalHeight = currentY + 30;
  const totalWidth = 360;

  // 2. Generate SVG Elements
  let svgNodes = '';
  let svgConnectors = '';

  // Connecting arrows between consecutive main nodes
  for (let i = 0; i < renderedNodes.length - 1; i++) {
    const from = renderedNodes[i];
    const to = renderedNodes[i + 1];

    if (from.isDiamond) {
      // Connect bottom to next node
      const x1 = from.x;
      const y1 = from.y + from.height / 2;
      const x2 = to.x;
      const y2 = to.y - to.height / 2;
      svgConnectors += `
        <path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="#484f58" stroke-width="1.5" stroke-dasharray="3,3" fill="none" marker-end="url(#arrow)"/>
        <rect x="${x1 - 16}" y="${y1 + 8}" width="32" height="15" rx="3" fill="#161b22" stroke="#30363d" stroke-width="0.8"/>
        <text x="${x1}" y="${y1 + 19}" fill="#8b949e" font-size="9" font-family="'JetBrains Mono', monospace" text-anchor="middle" font-weight="600">Next</text>
      `;
    } else {
      const x1 = from.x;
      const y1 = from.y + from.height / 2;
      const x2 = to.x;
      const y2 = to.y - to.height / 2;
      svgConnectors += `
        <path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="#3b82f6" stroke-width="1.5" fill="none" marker-end="url(#arrow)"/>
      `;
    }
  }

  // Draw loop-back / side connectors
  renderedNodes.forEach(node => {
    if (node.loopBackTo) {
      const target = renderedNodes.find(n => n.id === node.loopBackTo);
      if (target) {
        const fromX = node.x + node.width / 2;
        const fromY = node.y;
        const toX = target.x + target.width / 2 + 18;
        const toY = target.y;
        svgConnectors += `
          <path d="M ${fromX} ${fromY} C ${fromX + 45} ${fromY}, ${toX + 25} ${toY}, ${toX} ${toY}" 
                stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="4,3" fill="none" marker-end="url(#arrow-purple)"/>
        `;
      }
    }
  });

  // Render Node Shapes
  renderedNodes.forEach((node, i) => {
    const { x, y, width, height, isDiamond, type, title, detail } = node;

    if (isDiamond) {
      // Decision Diamond SVG
      const d = diamondSize / 2 + 10;
      svgNodes += `
        <g class="flow-node node-diamond" data-step="${i + 1}" transform="translate(${x}, ${y})">
          <polygon points="0,-${d} ${d * 1.5},0 0,${d} -${d * 1.5},0" 
                   fill="url(#diamond-grad)" stroke="#38bdf8" stroke-width="1.5" filter="url(#glow-blue)"/>
          <text x="0" y="-4" fill="#e6edf3" font-size="10.5" font-weight="600" text-anchor="middle" font-family="'Inter', sans-serif">${escapeXml(title)}</text>
          <text x="0" y="10" fill="#94a3b8" font-size="8.5" text-anchor="middle" font-family="'JetBrains Mono', monospace">${escapeXml(truncate(detail, 28))}</text>
        </g>
      `;
    } else if (type === 'terminal') {
      // Terminal Pill shape
      const rx = 18;
      svgNodes += `
        <g class="flow-node node-terminal" data-step="${i + 1}" transform="translate(${x - width / 2}, ${y - height / 2})">
          <rect width="${width}" height="${height}" rx="${rx}" 
                fill="url(#terminal-grad)" stroke="#10b981" stroke-width="1.5" filter="url(#glow-green)"/>
          <circle cx="18" cy="${height / 2}" r="5" fill="#10b981"/>
          <text x="32" y="${height / 2 - 3}" fill="#f0fdf4" font-size="11" font-weight="700" font-family="'Inter', sans-serif">${escapeXml(title)}</text>
          <text x="32" y="${height / 2 + 11}" fill="#86efac" font-size="9" font-family="'JetBrains Mono', monospace">${escapeXml(truncate(detail, 32))}</text>
        </g>
      `;
    } else if (type === 'loop') {
      // Loop Box with accent badge
      svgNodes += `
        <g class="flow-node node-loop" data-step="${i + 1}" transform="translate(${x - width / 2}, ${y - height / 2})">
          <rect width="${width}" height="${height}" rx="8" 
                fill="url(#loop-grad)" stroke="#8b5cf6" stroke-width="1.5" filter="url(#glow-purple)"/>
          <rect x="10" y="8" width="16" height="16" rx="3" fill="#7c3aed" opacity="0.4"/>
          <text x="18" y="20" fill="#c4b5fd" font-size="10" font-weight="700" text-anchor="middle">⟳</text>
          <text x="34" y="${height / 2 - 3}" fill="#e6edf3" font-size="11" font-weight="600" font-family="'Inter', sans-serif">${escapeXml(title)}</text>
          <text x="34" y="${height / 2 + 11}" fill="#a78bfa" font-size="9" font-family="'JetBrains Mono', monospace">${escapeXml(truncate(detail, 32))}</text>
        </g>
      `;
    } else {
      // Standard Process Card
      svgNodes += `
        <g class="flow-node node-process" data-step="${i + 1}" transform="translate(${x - width / 2}, ${y - height / 2})">
          <rect width="${width}" height="${height}" rx="8" 
                fill="url(#card-grad)" stroke="#30363d" stroke-width="1.2"/>
          <text x="14" y="${height / 2 - 3}" fill="#e6edf3" font-size="11" font-weight="600" font-family="'Inter', sans-serif">${escapeXml(title)}</text>
          <text x="14" y="${height / 2 + 11}" fill="#8b949e" font-size="9" font-family="'JetBrains Mono', monospace">${escapeXml(truncate(detail, 34))}</text>
        </g>
      `;
    }
  });

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}" class="flowchart-svg" width="100%" height="auto">
      <defs>
        <!-- Gradients -->
        <linearGradient id="card-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#161b22"/>
          <stop offset="100%" stop-color="#0f1318"/>
        </linearGradient>
        <linearGradient id="loop-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#1e1838"/>
          <stop offset="100%" stop-color="#130f24"/>
        </linearGradient>
        <linearGradient id="diamond-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0c2340"/>
          <stop offset="100%" stop-color="#091829"/>
        </linearGradient>
        <linearGradient id="terminal-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#062e20"/>
          <stop offset="100%" stop-color="#041f16"/>
        </linearGradient>

        <!-- Filters / Glow -->
        <filter id="glow-blue" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#0284c7" flood-opacity="0.2"/>
        </filter>
        <filter id="glow-purple" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#7c3aed" flood-opacity="0.25"/>
        </filter>
        <filter id="glow-green" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#10b981" flood-opacity="0.3"/>
        </filter>

        <!-- Markers -->
        <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#3b82f6"/>
        </marker>
        <marker id="arrow-purple" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#a78bfa"/>
        </marker>
      </defs>

      <!-- Background Grid -->
      <g stroke="#21262d" stroke-width="0.5" opacity="0.3">
        <line x1="0" y1="40" x2="${totalWidth}" y2="40"/>
        <line x1="0" y1="120" x2="${totalWidth}" y2="120"/>
        <line x1="0" y1="200" x2="${totalWidth}" y2="200"/>
        <line x1="0" y1="280" x2="${totalWidth}" y2="280"/>
      </g>

      <!-- Connectors -->
      <g class="connectors-layer">
        ${svgConnectors}
      </g>

      <!-- Flow Nodes -->
      <g class="nodes-layer">
        ${svgNodes}
      </g>
    </svg>
  `;
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function escapeXml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
