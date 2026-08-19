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
 * Extracts real structural elements from the code:
 *  - while/for loop condition
 *  - First if condition (main decision diamond)
 *  - Variable computation (e.g. mid = ...)
 *  - Return values (early exit vs final)
 */
function extractCodeFlow(code) {
  // Strip comments for cleaner matching
  const clean = code
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Strip Java class wrapper for analysis
    .replace(/^\s*(?:public\s+)?class\s+\w+[^{]*\{/, '')
    .replace(/\}\s*$/, '');

  // While / for loop condition
  const whileMatch = clean.match(/\bwhile\s*\(([^)]+)\)/);
  const forMatch   = clean.match(/\bfor\s*\([^;]*;\s*([^;]+);/);
  const loopCond   = (whileMatch?.[1] ?? forMatch?.[1] ?? '').trim() || null;

  // First if condition inside loop body (main decision)
  const ifMatches = [...clean.matchAll(/\bif\s*\(([^)]+)\)/g)].map(m => m[1].trim());
  const mainCond  = ifMatches[0] ?? null;
  const altCond   = ifMatches[1] ?? null;

  // Variable computation line (mid / m / pointer updates)
  const computeMatch = clean.match(/\b(?:let|var|const|int|long)\s+(\w+)\s*=\s*([^\n;{}]+)/);
  const computeVar   = computeMatch?.[1] ?? '';
  const computeExpr  = (computeMatch?.[2] ?? '').trim().slice(0, 36);

  // Return statements — find early positive return and final/default return
  const returns = [...clean.matchAll(/\breturn\s+([^;\n{}]+)/g)].map(m => m[1].trim());
  const earlyRet = returns.find(r => !r.match(/^-?\s*1$|^null$|^false$|^-1$/));
  const finalRet = returns.find(r =>  r.match(/^-?\s*1$|^null$|^false$|^-1$/)) ?? returns[returns.length - 1];

  return {
    loopCond,
    mainCond,
    altCond,
    computeLabel: computeVar && computeExpr ? `${computeVar} = ${computeExpr}` : null,
    earlyReturn:  earlyRet ? `return ${earlyRet}` : 'return result',
    finalReturn:  finalRet ? `return ${finalRet}` : 'loop terminates',
    ifMatches,
  };
}

/**
 * Builds a 2D layout graph model.
 * Priority: extract real conditions from code → fall back to pattern templates.
 */
function buildGraphModel(code, language, pattern, problemData) {
  const patName = (pattern.name || '').toLowerCase();
  const c = code.toLowerCase();

  // ── Extract real conditions from the actual code ──────────────────────────
  const flow = extractCodeFlow(code);

  // If we got meaningful conditions from the code, use them directly
  if (flow.loopCond && flow.mainCond) {
    return createModel({
      topTitle:     flow.loopCond,
      topDetail:    `Loop condition`,
      exitTitle:    flow.finalReturn,
      exitDetail:   'Loop exits — condition false',
      bodyTitle:    flow.computeLabel || 'Process element',
      bodyDetail:   flow.altCond ? `Check: ${flow.altCond.slice(0, 40)}` : '',
      diamondTitle: flow.mainCond,
      yesTitle:     flow.earlyReturn,
      yesDetail:    'Condition met',
      noTitle:      flow.altCond
                      ? `${flow.altCond.slice(0, 38)}…`
                      : 'Update state & continue',
      noDetail:     'Advance iteration',
    });
  }

  // ── Pattern-based fallbacks (when code can't be parsed) ───────────────────

  // Binary Search
  if (patName.includes('binary search') || (c.includes('mid') && c.includes('left') && c.includes('right'))) {
    return createModel({
      topTitle: 'while l <= r',
      topDetail: 'Iterate search bounds',
      exitTitle: 'return -1',
      exitDetail: 'Target not found — exhausted search space',
      bodyTitle: 'm = l + (r - l) / 2',
      bodyDetail: 'Inspect element at midpoint',
      diamondTitle: 'nums[m] == target?',
      yesTitle: 'return m',
      yesDetail: 'Found target at index m',
      noTitle: 'l = m+1  or  r = m-1',
      noDetail: 'Discard half of search interval',
    });
  }

  // Hash Map
  if (patName.includes('hash') || (c.includes('map') && c.includes('target'))) {
    return createModel({
      topTitle: 'for i in nums',
      topDetail: 'Iterate through elements',
      exitTitle: '(No solution found)',
      exitDetail: 'Loop finishes without match',
      bodyTitle: 'complement = target - nums[i]',
      bodyDetail: 'Compute required difference',
      diamondTitle: 'complement in map?',
      yesTitle: 'return [map[complement], i]',
      yesDetail: 'Pair found',
      noTitle: 'map[nums[i]] = i',
      noDetail: 'Store current number',
    });
  }

  // Two Pointers
  if (patName.includes('two pointer') || (c.includes('left') && c.includes('right'))) {
    return createModel({
      topTitle: 'while left < right',
      topDetail: 'Evaluate boundary pointers',
      exitTitle: 'return result',
      exitDetail: 'Pointers met — loop done',
      bodyTitle: 'Evaluate pointer state',
      bodyDetail: 'Compare elements at left & right',
      diamondTitle: 'Target condition met?',
      yesTitle: 'return result / early exit',
      yesDetail: 'Optimal match found',
      noTitle: 'left++  or  right--',
      noDetail: 'Adjust pointers inward',
    });
  }

  // Sliding Window
  if (patName.includes('sliding window') || c.includes('window')) {
    return createModel({
      topTitle: 'for right = 0..n-1',
      topDetail: 'Expand window right',
      exitTitle: 'return best result',
      exitDetail: 'All elements processed',
      bodyTitle: 'Update window state',
      bodyDetail: 'Track active window elements',
      diamondTitle: 'Window constraint violated?',
      yesTitle: 'left++ (shrink)',
      yesDetail: 'Remove left element until valid',
      noTitle: 'best = max(best, size)',
      noDetail: 'Record optimal length',
    });
  }

  // Generic default
  return createModel({
    topTitle:     flow.loopCond || 'Loop through input',
    topDetail:    'Iterate until termination condition',
    exitTitle:    flow.finalReturn || 'return result',
    exitDetail:   'Return final accumulated output',
    bodyTitle:    flow.computeLabel || 'Process current element',
    bodyDetail:   'Perform calculation or transformation',
    diamondTitle: flow.mainCond || 'Condition met?',
    yesTitle:     flow.earlyReturn || 'return result',
    yesDetail:    'Condition satisfied — early return',
    noTitle:      'Update state & advance',
    noDetail:     'Prepare next step and loop back',
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
