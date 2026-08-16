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
    return {
      topNode: {
        id: 'loop',
        type: 'loop',
        title: 'Loop through nums, using index i',
        detail: 'Iterate through elements 0 ≤ i < n',
        x: 240, y: 35, width: 220, height: 48
      },
      exitNode: {
        id: 'exit',
        type: 'terminal',
        title: 'Loop finishes',
        detail: '(Implicit: No solution found, should not happen)',
        x: 400, y: 125, width: 200, height: 48
      },
      bodyNode: {
        id: 'calc',
        type: 'process',
        title: 'Calculate complement = target - nums[i]',
        detail: 'Compute required pair difference',
        x: 130, y: 125, width: 210, height: 48
      },
      decisionNode: {
        id: 'decision',
        type: 'decision',
        title: 'Check if complement is a key in number_map',
        detail: 'Is complement found?',
        x: 130, y: 240, size: 70
      },
      yesNode: {
        id: 'return_found',
        type: 'terminal',
        title: 'Return [number_map[complement], i]',
        detail: 'Pair found, return solution',
        x: 130, y: 360, width: 210, height: 48
      },
      noNode: {
        id: 'add_map',
        type: 'process',
        title: 'Add nums[i] and i to number_map',
        detail: 'Store current number and continue',
        x: 390, y: 360, width: 210, height: 48
      },
      nodes: [
        { id: 'loop', title: 'Loop through nums', detail: 'Using index i (0 ≤ i < n)', type: 'loop' },
        { id: 'calc', title: 'Calculate complement', detail: 'complement = target - nums[i]', type: 'process' },
        { id: 'decision', title: 'Check complement in map', detail: 'number_map.has(complement)?', type: 'decision' },
        { id: 'return_found', title: 'Return solution pair', detail: 'return [number_map[complement], i]', type: 'terminal' },
        { id: 'add_map', title: 'Add nums[i] to map', detail: 'number_map[nums[i]] = i', type: 'process' },
        { id: 'exit', title: 'Fallback exit', detail: 'Loop finishes without pair', type: 'terminal' }
      ]
    };
  }

  // 2. Binary Search
  if (patName.includes('binary search') || (c.includes('mid') && c.includes('left') && c.includes('right')) || c.includes('search')) {
    return {
      topNode: {
        id: 'loop',
        type: 'loop',
        title: 'While low ≤ high',
        detail: 'Evaluate search interval midpoint',
        x: 240, y: 35, width: 220, height: 48
      },
      exitNode: {
        id: 'exit',
        type: 'terminal',
        title: 'Loop finishes',
        detail: 'Return -1 (Target not found in array)',
        x: 400, y: 125, width: 200, height: 48
      },
      bodyNode: {
        id: 'mid',
        type: 'process',
        title: 'Calculate mid = low + (high - low) / 2',
        detail: 'Check element at midpoint',
        x: 130, y: 125, width: 210, height: 48
      },
      decisionNode: {
        id: 'decision',
        type: 'decision',
        title: 'Check if nums[mid] == target',
        detail: 'Is target at midpoint?',
        x: 130, y: 240, size: 70
      },
      yesNode: {
        id: 'return_found',
        type: 'terminal',
        title: 'Return mid (Target Found)',
        detail: 'Found exact match index',
        x: 130, y: 360, width: 210, height: 48
      },
      noNode: {
        id: 'adjust',
        type: 'process',
        title: 'nums[mid] < target ? low = mid + 1 : high = mid - 1',
        detail: 'Discard half of search space',
        x: 390, y: 360, width: 210, height: 48
      },
      nodes: [
        { id: 'loop', title: 'While low ≤ high', detail: 'Iterate search bounds', type: 'loop' },
        { id: 'mid', title: 'Compute midpoint', detail: 'mid = (low + high) / 2', type: 'process' },
        { id: 'decision', title: 'Compare nums[mid] to target', detail: 'Match check', type: 'decision' },
        { id: 'return_found', title: 'Return index', detail: 'return mid', type: 'terminal' },
        { id: 'adjust', title: 'Shift search boundary', detail: 'low = mid + 1 or high = mid - 1', type: 'process' },
        { id: 'exit', title: 'Target not found', detail: 'return -1', type: 'terminal' }
      ]
    };
  }

  // 3. Two Pointers / General Scanning
  if (patName.includes('two pointers') || (c.includes('left') && c.includes('right')) || c.includes('prefix')) {
    return {
      topNode: {
        id: 'loop',
        type: 'loop',
        title: 'Loop: evaluate boundary pointers',
        detail: 'Inspect elements at left and right',
        x: 240, y: 35, width: 220, height: 48
      },
      exitNode: {
        id: 'exit',
        type: 'terminal',
        title: 'Pointers meet / loop finishes',
        detail: 'Return accumulated solution result',
        x: 400, y: 125, width: 200, height: 48
      },
      bodyNode: {
        id: 'inspect',
        type: 'process',
        title: 'Evaluate current pointer state',
        detail: 'Compare elements or prefix match',
        x: 130, y: 125, width: 210, height: 48
      },
      decisionNode: {
        id: 'decision',
        type: 'decision',
        title: 'Target condition or mismatch?',
        detail: 'Check invariant',
        x: 130, y: 240, size: 70
      },
      yesNode: {
        id: 'return_found',
        type: 'terminal',
        title: 'Return result or early exit',
        detail: 'Optimal match found',
        x: 130, y: 360, width: 210, height: 48
      },
      noNode: {
        id: 'shift',
        type: 'process',
        title: 'Advance pointer & update state',
        detail: 'left++ / right-- or trim prefix',
        x: 390, y: 360, width: 210, height: 48
      },
      nodes: [
        { id: 'loop', title: 'Iterate pointers', detail: 'Traverse array from bounds', type: 'loop' },
        { id: 'inspect', title: 'Evaluate condition', detail: 'Check current elements', type: 'process' },
        { id: 'decision', title: 'Decision check', detail: 'Condition satisfied?', type: 'decision' },
        { id: 'return_found', title: 'Return result', detail: 'Return found answer', type: 'terminal' },
        { id: 'shift', title: 'Advance pointer', detail: 'Update left/right', type: 'process' },
        { id: 'exit', title: 'Finish traversal', detail: 'Return final state', type: 'terminal' }
      ]
    };
  }

  // 4. General Default 2D Branching Layout
  return {
    topNode: {
      id: 'loop',
      type: 'loop',
      title: 'Loop through input elements',
      detail: 'Iterate until termination condition',
      x: 240, y: 35, width: 220, height: 48
    },
    exitNode: {
      id: 'exit',
      type: 'terminal',
      title: 'Loop terminates',
      detail: 'Return final accumulated output',
      x: 400, y: 125, width: 200, height: 48
    },
    bodyNode: {
      id: 'step',
      type: 'process',
      title: 'Process current element / state',
      detail: 'Perform transformation or calculation',
      x: 130, y: 125, width: 210, height: 48
    },
    decisionNode: {
      id: 'decision',
      type: 'decision',
      title: 'Check branch / base condition',
      detail: 'Is solution or edge met?',
      x: 130, y: 240, size: 70
    },
    yesNode: {
      id: 'return_found',
      type: 'terminal',
      title: 'Return target result',
      detail: 'Condition met, return value',
      x: 130, y: 360, width: 210, height: 48
    },
    noNode: {
      id: 'update',
      type: 'process',
      title: 'Update state & advance iteration',
      detail: 'Prepare next step and loop back',
      x: 390, y: 360, width: 210, height: 48
    },
    nodes: [
      { id: 'loop', title: 'Loop iteration', detail: 'Iterate input collection', type: 'loop' },
      { id: 'step', title: 'Process element', detail: 'Compute current step', type: 'process' },
      { id: 'decision', title: 'Evaluate condition', detail: 'Branch check', type: 'decision' },
      { id: 'return_found', title: 'Return result', detail: 'Early return if match', type: 'terminal' },
      { id: 'update', title: 'Update state', detail: 'Accumulate and loop back', type: 'process' },
      { id: 'exit', title: 'End traversal', detail: 'Return final result', type: 'terminal' }
    ]
  };
}

/**
 * Renders the full 2D branching SVG with arrows, labels, and decision diamond.
 */
function renderBranchingSvg(model) {
  const { topNode, exitNode, bodyNode, decisionNode, yesNode, noNode } = model;
  const viewBoxWidth = 530;
  const viewBoxHeight = 430;

  // Arrow markers and gradients
  const defs = `
    <defs>
      <linearGradient id="card-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#161b22"/>
        <stop offset="100%" stop-color="#0f1318"/>
      </linearGradient>
      <linearGradient id="diamond-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#141c26"/>
        <stop offset="100%" stop-color="#0b121a"/>
      </linearGradient>
      <linearGradient id="terminal-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#062e20"/>
        <stop offset="100%" stop-color="#041f16"/>
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
    <path d="M ${topNode.x - 40} ${topNode.y + topNode.height / 2} L ${bodyNode.x} ${bodyNode.y - bodyNode.height / 2}" 
          stroke="#8b949e" stroke-width="1.5" fill="none" marker-end="url(#arrow)"/>

    <!-- Top to Exit (Right path) -->
    <path d="M ${topNode.x + 40} ${topNode.y + topNode.height / 2} L ${exitNode.x} ${exitNode.y - exitNode.height / 2}" 
          stroke="#8b949e" stroke-width="1.5" fill="none" marker-end="url(#arrow)"/>
    <!-- Exit Label Badge -->
    <rect x="${(topNode.x + exitNode.x) / 2 - 28}" y="${(topNode.y + exitNode.y) / 2 - 5}" width="58" height="15" rx="3" fill="#21262d" stroke="#30363d" stroke-width="0.8"/>
    <text x="${(topNode.x + exitNode.x) / 2 + 1}" y="${(topNode.y + exitNode.y) / 2 + 6}" fill="#c9d1d9" font-size="8.5" font-family="'Inter', sans-serif" font-weight="600" text-anchor="middle">Loop finishes</text>

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
    <path d="M ${decisionNode.x + decisionNode.size * 1.3} ${decisionNode.y + 20} L ${noNode.x - noNode.width / 2 + 10} ${noNode.y - noNode.height / 2}" 
          stroke="#8b949e" stroke-width="1.5" fill="none" marker-end="url(#arrow)"/>
    <!-- No Badge -->
    <rect x="${decisionNode.x + decisionNode.size + 30}" y="${decisionNode.y + 48}" width="24" height="15" rx="3" fill="#21262d" stroke="#30363d" stroke-width="0.8"/>
    <text x="${decisionNode.x + decisionNode.size + 42}" y="${decisionNode.y + 59}" fill="#8b949e" font-size="9" font-family="'Inter', sans-serif" font-weight="700" text-anchor="middle">No</text>

    <!-- Loop Back: From No-Node (right) all the way back to Top Node -->
    <path d="M ${noNode.x + noNode.width / 2 - 20} ${noNode.y - noNode.height / 2} C ${viewBoxWidth - 25} ${noNode.y - 40}, ${viewBoxWidth - 25} 60, ${topNode.x + topNode.width / 2} ${topNode.y + 5}" 
          stroke="#8b949e" stroke-width="1.5" fill="none" marker-end="url(#arrow)"/>
  `;

  // Render SVG Nodes
  const renderRect = (node, borderColor = '#30363d', glow = '') => `
    <g class="flow-node" data-step="${node.id}" transform="translate(${node.x - node.width / 2}, ${node.y - node.height / 2})">
      <rect width="${node.width}" height="${node.height}" rx="4" fill="url(#card-grad)" stroke="${borderColor}" stroke-width="1.2"/>
      <text x="${node.width / 2}" y="${node.height / 2 + 4}" fill="#e6edf3" font-size="10.5" font-weight="500" font-family="'Inter', sans-serif" text-anchor="middle">${escapeXml(node.title)}</text>
    </g>
  `;

  const renderDiamond = (node) => {
    const s = node.size;
    const w = s * 1.35;
    return `
      <g class="flow-node node-diamond" data-step="${node.id}" transform="translate(${node.x}, ${node.y})">
        <polygon points="0,-${s} ${w},0 0,${s} -${w},0" fill="url(#diamond-grad)" stroke="#484f58" stroke-width="1.5"/>
        <text x="0" y="-6" fill="#e6edf3" font-size="10" font-weight="500" text-anchor="middle" font-family="'Inter', sans-serif">Check if complement is a</text>
        <text x="0" y="8" fill="#e6edf3" font-size="10" font-weight="500" text-anchor="middle" font-family="'Inter', sans-serif">key in number_map</text>
      </g>
    `;
  };

  const renderTerminal = (node) => `
    <g class="flow-node node-terminal" data-step="${node.id}" transform="translate(${node.x - node.width / 2}, ${node.y - node.height / 2})">
      <rect width="${node.width}" height="${node.height}" rx="4" fill="url(#card-grad)" stroke="#30363d" stroke-width="1.2"/>
      <text x="${node.width / 2}" y="${node.height / 2 + 4}" fill="#e6edf3" font-size="10.5" font-weight="500" font-family="'Inter', sans-serif" text-anchor="middle">${escapeXml(node.title)}</text>
    </g>
  `;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxWidth} ${viewBoxHeight}" class="flowchart-svg" width="100%" height="auto">
      ${defs}

      <!-- Background Grid Subdued -->
      <rect width="${viewBoxWidth}" height="${viewBoxHeight}" fill="#0d1117" rx="8"/>

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
        ${renderTerminal(yesNode)}
        ${renderRect(noNode, '#484f58')}
      </g>
    </svg>
  `;
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
