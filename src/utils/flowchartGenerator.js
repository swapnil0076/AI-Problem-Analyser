/**
 * flowchartGenerator.js — Generates SVG Algorithmic Flowcharts & Dry Run Visuals.
 *
 * Renders 2D branching flowcharts matching algorithm visual traces:
 * - Top Node: Loop / Entrypoint
 * - Left Branch: Core computation & Decision Diamond (Yes / No paths)
 * - Right Branch: Loop termination & Loop-back cycle
 * - Terminal nodes for returned values
 */

export function generateFlowchart({ code = '', language = '', pattern = {}, problemData = {} }) {
  const model = buildGraphModel(code, language, pattern, problemData);
  const svg = renderBranchingSvg(model);
  const steps = model.nodes.map((node, i) => ({
    stepNum: i + 1,
    title: node.title,
    detail: node.detail || '',
    type: node.type || 'process'
  }));

  return { svg, steps };
}

/**
 * Builds a 2D layout graph model tailored to the detected pattern.
 */
function buildGraphModel(code, language, pattern, problemData) {
  const patName = (pattern.name || '').toLowerCase();
  const c = code.toLowerCase();

  // 1. Hash Map (Two Sum / Lookups)
  if (patName.includes('hash') || (c.includes('map') && c.includes('target')) || c.includes('twosum') || c.includes('two_sum')) {
    return createModel({
      topTitle: 'Loop through nums, using index i',
      topDetail: 'Iterate through elements 0 ≤ i < n',
      exitTitle: '(Implicit: No solution found, should not happen)',
      exitDetail: 'Loop finishes without finding match',
      bodyTitle: 'Calculate complement = target - nums[i]',
      bodyDetail: 'Compute required difference',
      diamondTitle: 'Check if complement is a key in number_map',
      yesTitle: 'Return [number_map[complement], i]',
      yesDetail: 'Pair found, return solution indices',
      noTitle: 'Add nums[i] and i to number_map',
      noDetail: 'Store current number and continue loop'
    });
  }

  // 2. Binary Search
  if (patName.includes('binary search') || (c.includes('mid') && c.includes('left') && c.includes('right')) || c.includes('search')) {
    return createModel({
      topTitle: 'While low ≤ high',
      topDetail: 'Iterate search bounds',
      exitTitle: 'Target not found in array',
      exitDetail: 'Return -1 (Exhausted search space)',
      bodyTitle: 'Calculate mid = low + (high - low) / 2',
      bodyDetail: 'Inspect element at midpoint',
      diamondTitle: 'Is nums[mid] == target?',
      yesTitle: 'Return mid (Target Found)',
      yesDetail: 'Found target element at index mid',
      noTitle: 'nums[mid] < target ? low = mid + 1 : high = mid - 1',
      noDetail: 'Discard half of the search interval'
    });
  }

  // 3. Two Pointers
  if (patName.includes('two pointers') || (c.includes('left') && c.includes('right')) || c.includes('pointer')) {
    return createModel({
      topTitle: 'Loop: evaluate boundary pointers',
      topDetail: 'Inspect elements at left and right',
      exitTitle: 'Pointers meet / loop finishes',
      exitDetail: 'Return accumulated solution result',
      bodyTitle: 'Evaluate current pointer state',
      bodyDetail: 'Compare elements at left and right',
      diamondTitle: 'Is target condition satisfied?',
      yesTitle: 'Return result or early exit',
      yesDetail: 'Found optimal match or palindrome check passed',
      noTitle: 'Advance pointer: left++ or right--',
      noDetail: 'Adjust pointers inward based on condition'
    });
  }

  // 4. Sliding Window
  if (patName.includes('sliding window') || c.includes('window')) {
    return createModel({
      topTitle: 'Expand window: for right = 0..n-1',
      topDetail: 'Include item[right] into current window',
      exitTitle: 'All elements processed',
      exitDetail: 'Return optimal max/min window size',
      bodyTitle: 'Update window sum / frequency count',
      bodyDetail: 'Track state of active window elements',
      diamondTitle: 'Is window condition violated?',
      yesTitle: 'Shrink window: left++',
      yesDetail: 'Remove item[left] until constraint holds',
      noTitle: 'Update best result = max(best, len)',
      noDetail: 'Record optimal length and continue expand'
    });
  }

  // 5. String / Character Scanning (e.g. Longest Common Prefix)
  if (c.includes('prefix') || c.includes('indexof') || c.includes('charat') || patName.includes('character') || patName.includes('scanning')) {
    return createModel({
      topTitle: 'Loop strings: for i = 1 to strs.length - 1',
      topDetail: 'Compare each string with prefix',
      exitTitle: 'All strings matched prefix',
      exitDetail: 'Return common prefix',
      bodyTitle: 'Check if strs[i] starts with prefix',
      bodyDetail: 'Evaluate substring matching at index 0',
      diamondTitle: 'Does strs[i] match prefix?',
      yesTitle: 'Move to next string (i++)',
      yesDetail: 'Current word matches, advance iteration',
      noTitle: 'Trim prefix: prefix = prefix[0..len-2]',
      noDetail: 'Shorten prefix until matching or empty'
    });
  }

  // 6. General Default 2D Branching Layout
  return createModel({
    topTitle: 'Loop through input elements',
    topDetail: 'Iterate until termination condition',
    exitTitle: 'Loop terminates normally',
    exitDetail: 'Return final accumulated output',
    bodyTitle: 'Process current element / state',
    bodyDetail: 'Perform calculation or transformation',
    diamondTitle: 'Is match or base condition met?',
    yesTitle: 'Return target result value',
    yesDetail: 'Condition satisfied, early return',
    noTitle: 'Update state & advance iteration',
    noDetail: 'Prepare next step and loop back'
  });
}

function createModel(config) {
  // Geometry coordinates with safe margins — NO overlaps!
  // Canvas width: 620, height: 440
  const topNode = {
    id: 'top',
    type: 'loop',
    title: config.topTitle,
    detail: config.topDetail,
    x: 200, y: 38, width: 250, height: 46
  };

  const exitNode = {
    id: 'exit',
    type: 'terminal',
    title: config.exitTitle,
    detail: config.exitDetail,
    x: 470, y: 130, width: 220, height: 46
  };

  const bodyNode = {
    id: 'body',
    type: 'process',
    title: config.bodyTitle,
    detail: config.bodyDetail,
    x: 140, y: 130, width: 230, height: 46
  };

  const decisionNode = {
    id: 'decision',
    type: 'decision',
    title: config.diamondTitle,
    detail: config.diamondTitle,
    x: 140, y: 245, size: 54
  };

  const yesNode = {
    id: 'yes',
    type: 'terminal',
    title: config.yesTitle,
    detail: config.yesDetail,
    x: 140, y: 365, width: 230, height: 46
  };

  const noNode = {
    id: 'no',
    type: 'process',
    title: config.noTitle,
    detail: config.noDetail,
    x: 440, y: 365, width: 240, height: 46
  };

  return {
    topNode,
    exitNode,
    bodyNode,
    decisionNode,
    yesNode,
    noNode,
    nodes: [
      { id: '1', title: config.topTitle, detail: config.topDetail, type: 'loop' },
      { id: '2', title: config.bodyTitle, detail: config.bodyDetail, type: 'process' },
      { id: '3', title: config.diamondTitle, detail: 'Decision branch', type: 'decision' },
      { id: '4', title: config.yesTitle, detail: config.yesDetail, type: 'terminal' },
      { id: '5', title: config.noTitle, detail: config.noDetail, type: 'process' },
      { id: '6', title: config.exitTitle, detail: config.exitDetail, type: 'terminal' }
    ]
  };
}

/**
 * Renders the full 2D branching SVG with clean math-calculated arrows, labels, and decision diamond.
 */
function renderBranchingSvg(model) {
  const { topNode, exitNode, bodyNode, decisionNode, yesNode, noNode } = model;
  const viewBoxWidth = 600;
  const viewBoxHeight = 430;

  // Arrow markers and gradients
  const defs = `
    <defs>
      <linearGradient id="card-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#161b22"/>
        <stop offset="100%" stop-color="#0e1217"/>
      </linearGradient>
      <linearGradient id="diamond-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#121820"/>
        <stop offset="100%" stop-color="#0a0f14"/>
      </linearGradient>

      <!-- Arrow Marker -->
      <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#8b949e"/>
      </marker>
      <marker id="arrow-blue" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#38bdf8"/>
      </marker>
    </defs>
  `;

  // Connector Paths
  const connectors = `
    <!-- Top to Body (Left path) -->
    <path d="M ${topNode.x - 30} ${topNode.y + topNode.height / 2} L ${bodyNode.x} ${bodyNode.y - bodyNode.height / 2}" 
          stroke="#8b949e" stroke-width="1.5" fill="none" marker-end="url(#arrow)"/>

    <!-- Top to Exit (Right path) -->
    <path d="M ${topNode.x + topNode.width / 2 - 20} ${topNode.y + topNode.height / 2} L ${exitNode.x - exitNode.width / 2 + 30} ${exitNode.y - exitNode.height / 2}" 
          stroke="#8b949e" stroke-width="1.5" fill="none" marker-end="url(#arrow)"/>
    <!-- Exit Label Badge -->
    <rect x="${(topNode.x + exitNode.x) / 2 - 22}" y="${(topNode.y + exitNode.y) / 2 - 4}" width="62" height="15" rx="3" fill="#21262d" stroke="#30363d" stroke-width="0.8"/>
    <text x="${(topNode.x + exitNode.x) / 2 + 9}" y="${(topNode.y + exitNode.y) / 2 + 7}" fill="#c9d1d9" font-size="8.5" font-family="'Inter', sans-serif" font-weight="600" text-anchor="middle">Loop finishes</text>

    <!-- Body to Decision Diamond -->
    <path d="M ${bodyNode.x} ${bodyNode.y + bodyNode.height / 2} L ${decisionNode.x} ${decisionNode.y - decisionNode.size}" 
          stroke="#8b949e" stroke-width="1.5" fill="none" marker-end="url(#arrow)"/>

    <!-- Decision Diamond to Yes (Bottom) -->
    <path d="M ${decisionNode.x} ${decisionNode.y + decisionNode.size} L ${yesNode.x} ${yesNode.y - yesNode.height / 2}" 
          stroke="#38bdf8" stroke-width="1.5" fill="none" marker-end="url(#arrow-blue)"/>
    <!-- Yes Badge -->
    <rect x="${decisionNode.x - 14}" y="${decisionNode.y + decisionNode.size + 14}" width="28" height="15" rx="3" fill="#0c2340" stroke="#0284c7" stroke-width="0.8"/>
    <text x="${decisionNode.x}" y="${decisionNode.y + decisionNode.size + 25}" fill="#38bdf8" font-size="9" font-family="'Inter', sans-serif" font-weight="700" text-anchor="middle">Yes</text>

    <!-- Decision Diamond to No (Right) -->
    <path d="M ${decisionNode.x + decisionNode.size * 1.3} ${decisionNode.y + 15} L ${noNode.x - noNode.width / 2 + 10} ${noNode.y - noNode.height / 2}" 
          stroke="#8b949e" stroke-width="1.5" fill="none" marker-end="url(#arrow)"/>
    <!-- No Badge -->
    <rect x="${(decisionNode.x + noNode.x) / 2 - 25}" y="${(decisionNode.y + noNode.y) / 2 + 15}" width="24" height="15" rx="3" fill="#21262d" stroke="#30363d" stroke-width="0.8"/>
    <text x="${(decisionNode.x + noNode.x) / 2 - 13}" y="${(decisionNode.y + noNode.y) / 2 + 26}" fill="#8b949e" font-size="9" font-family="'Inter', sans-serif" font-weight="700" text-anchor="middle">No</text>

    <!-- Loop Back: From No-Node (right) smoothly curving up along right margin back to Top Node -->
    <path d="M ${noNode.x + noNode.width / 2 - 20} ${noNode.y - noNode.height / 2} C ${viewBoxWidth - 15} ${noNode.y - 60}, ${viewBoxWidth - 15} 55, ${topNode.x + topNode.width / 2} ${topNode.y}" 
          stroke="#8b949e" stroke-width="1.5" fill="none" marker-end="url(#arrow)"/>
  `;

  // Render SVG Nodes
  const renderRect = (node, borderColor = '#30363d') => `
    <g class="flow-node" data-step="${node.id}" transform="translate(${node.x - node.width / 2}, ${node.y - node.height / 2})">
      <rect width="${node.width}" height="${node.height}" rx="4" fill="url(#card-grad)" stroke="${borderColor}" stroke-width="1.2"/>
      <text x="${node.width / 2}" y="${node.height / 2 + 4}" fill="#e6edf3" font-size="10.5" font-weight="500" font-family="'Inter', sans-serif" text-anchor="middle">${escapeXml(node.title)}</text>
    </g>
  `;

  const renderDiamond = (node) => {
    const s = node.size;
    const w = s * 1.35;
    const [line1, line2] = splitTextIntoTwoLines(node.title, 22);

    return `
      <g class="flow-node node-diamond" data-step="${node.id}" transform="translate(${node.x}, ${node.y})">
        <polygon points="0,-${s} ${w},0 0,${s} -${w},0" fill="url(#diamond-grad)" stroke="#484f58" stroke-width="1.5"/>
        <text x="0" y="${line2 ? -5 : 4}" fill="#e6edf3" font-size="9.5" font-weight="500" text-anchor="middle" font-family="'Inter', sans-serif">${escapeXml(line1)}</text>
        ${line2 ? `<text x="0" y="9" fill="#e6edf3" font-size="9.5" font-weight="500" text-anchor="middle" font-family="'Inter', sans-serif">${escapeXml(line2)}</text>` : ''}
      </g>
    `;
  };

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxWidth} ${viewBoxHeight}" class="flowchart-svg" width="100%" height="auto">
      ${defs}

      <!-- Background Grid Subdued -->
      <rect width="${viewBoxWidth}" height="${viewBoxHeight}" fill="#090d12" rx="8"/>

      <!-- Connectors Layer -->
      <g class="connectors-layer">
        ${connectors}
      </g>

      <!-- Nodes Layer -->
      <g class="nodes-layer">
        ${renderRect(topNode, '#484f58')}
        ${renderRect(exitNode, '#30363d')}
        ${renderRect(bodyNode, '#484f58')}
        ${renderDiamond(decisionNode)}
        ${renderRect(yesNode, '#38bdf8')}
        ${renderRect(noNode, '#484f58')}
      </g>
    </svg>
  `;
}

function splitTextIntoTwoLines(text, maxCharsPerLine = 22) {
  if (!text) return ['', ''];
  const words = text.split(' ');
  let line1 = '';
  let line2 = '';
  for (const w of words) {
    if ((line1 + ' ' + w).trim().length <= maxCharsPerLine) {
      line1 = (line1 + ' ' + w).trim();
    } else {
      line2 = (line2 + ' ' + w).trim();
    }
  }
  return [line1, line2];
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
