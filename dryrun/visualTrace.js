/**
 * visualTrace.js — Renders a dry-run execution path as an SVG flowchart.
 *
 * Produces a vertical flowchart matching the reference image style:
 *  - Diamond nodes for conditions (loop / if checks) with TRUE/FALSE branches
 *  - Rectangle nodes for assignments / actions with computed value labels
 *  - Green arrows for TRUE paths, red arrows for FALSE paths
 *  - Loopback curved arrows for loop iterations
 *  - ♾️ Infinite Loop terminal node (glowing red) when detected
 *  - Return node (glowing green) for the final result
 *
 * @param {Array}  steps  — steps array from worker.js
 * @param {string} input  — raw input string (for the left panel)
 * @returns {{ svg: string, nodes: Array }}
 */
export function renderVisualTrace(steps) {
  if (!steps || steps.length === 0) {
    return { svg: emptyStateSvg(), nodes: [] };
  }

  const layout = buildLayout(steps);
  const svg    = buildSvg(layout);
  return { svg, nodes: layout.nodes };
}

// ── Layout Builder ─────────────────────────────────────────────────────────────

const NODE_W    = 210;  // rectangle width
const NODE_H    = 44;   // rectangle height
const DIAM_S    = 38;   // diamond half-size (tip-to-centre)
const COL_X     = 300;  // centre X of the main path
const LOOP_X    = 520;  // X of the right-side loopback rail
const X_SPACING = 80;   // horizontal offset for loopback nodes
const Y_GAP     = 72;   // vertical gap between nodes

function buildLayout(steps) {
  const nodes    = [];
  const edges    = [];
  let   y        = 48;
  let   prevId   = null;
  let   prevType = null;

  // Collect condition nodes so we can draw a loopback from the last one
  const conditionIds = [];
  let   infiniteId   = null;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const id   = 'n' + i;

    if (step.type === 'init') {
      // Small flat rect, slightly de-emphasised
      nodes.push({
        id, type: 'init',
        x: COL_X, y,
        w: NODE_W, h: NODE_H,
        label: formatAction(step.action),
        sub:   formatVars(step.vars),
        ok:    step.ok,
      });
      if (prevId) edges.push({ from: prevId, to: id, fromType: prevType, color: '#4ade80', label: '' });
      prevId = id; prevType = 'rect';
      y += NODE_H + Y_GAP * 0.7;

    } else if (step.type === 'loop' || step.type === 'condition') {
      // Diamond node
      nodes.push({
        id, type: 'diamond',
        x: COL_X, y: y + DIAM_S,
        s: DIAM_S,
        label: step.condition || step.action,
        sub:   formatVars(step.vars),
        ok:    step.ok,
      });
      conditionIds.push(id);
      if (prevId) edges.push({ from: prevId, to: id, fromType: prevType, color: '#94a3b8', label: '' });
      prevId = id; prevType = 'diamond';
      y += DIAM_S * 2 + Y_GAP;

    } else if (step.type === 'assign') {
      nodes.push({
        id, type: 'rect',
        x: COL_X, y,
        w: NODE_W, h: NODE_H,
        label: formatAction(step.action),
        sub:   step.note || '',
        ok:    step.ok,
      });
      if (prevId) {
        const isTrueEdge = prevType === 'diamond';
        edges.push({ from: prevId, to: id, fromType: prevType, color: isTrueEdge ? '#4ade80' : '#94a3b8', label: isTrueEdge ? 'TRUE' : '' });
      }
      prevId = id; prevType = 'rect';
      y += NODE_H + Y_GAP;

    } else if (step.type === 'return') {
      nodes.push({
        id, type: 'return',
        x: COL_X, y,
        w: NODE_W, h: NODE_H,
        label: formatAction(step.action),
        sub:   step.note || '',
        ok:    true,
      });
      edges.push({ from: prevId, to: id, fromType: prevType, color: '#4ade80', label: 'TRUE' });
      prevId = id; prevType = 'return';
      y += NODE_H + Y_GAP;

    } else if (step.type === 'infinite') {
      infiniteId = id;
      nodes.push({
        id, type: 'infinite',
        x: COL_X, y: y + DIAM_S + 10,
        s: DIAM_S + 10,
        label: '♾️ INFINITE LOOP',
        sub:   'Loop did not terminate',
        ok:    false,
      });
      if (prevId) edges.push({ from: prevId, to: id, fromType: prevType, color: '#ef4444', label: 'LOOP' });
      prevId = id; prevType = 'infinite';
      y += (DIAM_S + 10) * 2 + Y_GAP;
    }
  }

  // Add FALSE exit arrows from the last condition node (loop terminates)
  if (conditionIds.length > 0 && !infiniteId) {
    const lastCond = nodes.find(n => n.id === conditionIds[conditionIds.length - 1]);
    if (lastCond) {
      const exitId = 'exit';
      nodes.push({
        id: exitId, type: 'exit',
        x: LOOP_X + 60, y: lastCond.y,
        w: 150, h: NODE_H,
        label: 'Loop Ends',
        sub: 'Condition FALSE',
        ok: true,
      });
      edges.push({ from: lastCond.id, to: exitId, fromType: 'diamond', color: '#ef4444', label: 'FALSE', side: 'right' });
    }
  }

  // Add loopback arrows — from last assign node back to first condition
  if (conditionIds.length > 0) {
    const firstCond = nodes.find(n => n.id === conditionIds[0]);
    const lastAssign = [...nodes].reverse().find(n => n.type === 'rect' || n.type === 'assign');
    if (firstCond && lastAssign) {
      edges.push({
        from: lastAssign.id, to: firstCond.id,
        fromType: 'rect',
        color: '#f59e0b',
        label: 'loop back',
        isLoopback: true,
      });
    }
  }

  const totalH = y + 40;
  return { nodes, edges, width: LOOP_X + 160, height: Math.max(totalH, 300) };
}

// ── SVG Builder ────────────────────────────────────────────────────────────────

function buildSvg({ nodes, edges, width, height }) {
  const defs = buildDefs();
  const edgesStr = edges.map(e => renderEdge(e, nodes)).join('\n');
  const nodesStr = nodes.map((n, i) => renderNode(n, i)).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 ${width} ${height}"
    class="vt-flowchart"
    width="100%" height="auto">
    ${defs}
    <rect width="${width}" height="${height}" fill="#090d12" rx="10"/>
    <g class="vt-edges">${edgesStr}</g>
    <g class="vt-nodes">${nodesStr}</g>
  </svg>`;
}

function buildDefs() {
  return `<defs>
    <!-- Arrow markers -->
    <marker id="arr-grey"  viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#6b7280"/>
    </marker>
    <marker id="arr-green" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#4ade80"/>
    </marker>
    <marker id="arr-red"   viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#ef4444"/>
    </marker>
    <marker id="arr-amber" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#f59e0b"/>
    </marker>

    <!-- Glow filters -->
    <filter id="glow-green" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="glow-red" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="glow-blue" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="2" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>

    <!-- Gradients -->
    <linearGradient id="grad-node" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="#1e2530"/>
      <stop offset="100%" stop-color="#141a22"/>
    </linearGradient>
    <linearGradient id="grad-return" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="#052e16"/>
      <stop offset="100%" stop-color="#14532d" stop-opacity="0.7"/>
    </linearGradient>
    <linearGradient id="grad-infinite" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="#450a0a"/>
      <stop offset="100%" stop-color="#7f1d1d" stop-opacity="0.7"/>
    </linearGradient>
    <linearGradient id="grad-diamond" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e2030"/>
    </linearGradient>
  </defs>`;
}

// ── Node Renderers ─────────────────────────────────────────────────────────────

function renderNode(node, index) {
  const delay = index * 80;
  const animStyle = `style="animation-delay:${delay}ms"`;
  const cls = `vt-node vt-node-${node.type}`;

  if (node.type === 'diamond' || node.type === 'infinite') {
    return renderDiamond(node, cls, animStyle, delay);
  }
  return renderRect(node, cls, animStyle, delay);
}

function renderRect(node, cls, animStyle, delay) {
  const { id, type, x, y, w, h, label, sub } = node;
  const rx = x - w / 2;
  const ry = y;

  let fill   = 'url(#grad-node)';
  let stroke = '#30363d';
  let textClr = '#e6edf3';
  let subClr  = '#6b7280';
  let glow    = '';

  if (type === 'return') {
    fill   = 'url(#grad-return)';
    stroke = '#16a34a';
    textClr = '#4ade80';
    subClr  = '#86efac';
    glow    = 'filter="url(#glow-green)"';
  } else if (type === 'exit') {
    fill   = '#0f172a';
    stroke = '#ef4444';
    textClr = '#fca5a5';
    subClr  = '#7f1d1d';
    glow    = 'filter="url(#glow-red)"';
  } else if (type === 'init') {
    fill   = '#0d1117';
    stroke = '#21262d';
    textClr = '#c9d1d9';
    subClr  = '#484f58';
  }

  const [l1, l2] = splitLabel(label, 28);
  const hasTwo = Boolean(l2);

  return `
  <g class="${cls}" data-id="${id}" ${animStyle} ${glow}>
    <rect x="${rx}" y="${ry}" width="${w}" height="${h}" rx="5"
          fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>
    <text x="${x}" y="${ry + (hasTwo ? h/2 - 4 : h/2 + 5)}"
          fill="${textClr}" font-size="10.5" font-weight="600"
          font-family="'JetBrains Mono','Fira Code',monospace"
          text-anchor="middle">${escXml(l1)}</text>
    ${hasTwo ? `<text x="${x}" y="${ry + h/2 + 9}"
          fill="${textClr}" font-size="10.5" font-weight="600"
          font-family="'JetBrains Mono','Fira Code',monospace"
          text-anchor="middle">${escXml(l2)}</text>` : ''}
    ${sub ? `<text x="${x}" y="${ry + h - 6}"
          fill="${subClr}" font-size="8.5"
          font-family="'Inter',sans-serif"
          text-anchor="middle">${escXml(truncate(sub, 36))}</text>` : ''}
  </g>`;
}

function renderDiamond(node, cls, animStyle, delay) {
  const { id, type, x, y, s, label, sub } = node;
  const ww = Math.round(s * 1.7);

  let fill   = 'url(#grad-diamond)';
  let stroke = '#4b5563';
  let textClr = '#e2e8f0';
  let subClr  = '#6b7280';
  let glow    = '';

  if (type === 'infinite') {
    fill   = 'url(#grad-infinite)';
    stroke = '#ef4444';
    textClr = '#fca5a5';
    glow    = 'filter="url(#glow-red)"';
    subClr  = '#f87171';
  }

  const [l1, l2] = splitLabel(label, 18);
  const hasTwo = Boolean(l2);
  const ty1 = hasTwo ? -6 : 5;
  const ty2 = 9;

  return `
  <g class="${cls}" data-id="${id}" ${animStyle} ${glow}>
    <polygon points="0,${-s} ${ww},0 0,${s} ${-ww},0"
             fill="${fill}" stroke="${stroke}" stroke-width="1.6"
             transform="translate(${x},${y})"/>
    <text x="${x}" y="${y + ty1}"
          fill="${textClr}" font-size="9.5" font-weight="700"
          font-family="'JetBrains Mono','Fira Code',monospace"
          text-anchor="middle">${escXml(l1)}</text>
    ${hasTwo ? `<text x="${x}" y="${y + ty2}"
          fill="${textClr}" font-size="9.5" font-weight="700"
          font-family="'JetBrains Mono','Fira Code',monospace"
          text-anchor="middle">${escXml(l2)}</text>` : ''}
    ${sub ? `<text x="${x}" y="${y + s + 14}"
          fill="${subClr}" font-size="8"
          font-family="'Inter',sans-serif"
          text-anchor="middle">${escXml(truncate(sub, 30))}</text>` : ''}
  </g>`;
}

// ── Edge Renderers ─────────────────────────────────────────────────────────────

function renderEdge(edge, nodes) {
  const fromNode = nodes.find(n => n.id === edge.from);
  const toNode   = nodes.find(n => n.id === edge.to);
  if (!fromNode || !toNode) return '';

  const color  = edge.color || '#6b7280';
  const marker = markerFor(color);

  // Loopback arrow — curves right around all nodes
  if (edge.isLoopback) {
    const fx = bottomX(fromNode);
    const fy = bottomY(fromNode);
    const tx = rightX(toNode) + 4;
    const ty = midY(toNode);
    const rx = LOOP_X + 30;

    return `
    <path d="M ${fx} ${fy} C ${fx} ${fy+30}, ${rx} ${fy+30}, ${rx} ${(fy+ty)/2} S ${rx} ${ty}, ${tx} ${ty}"
          stroke="${color}" stroke-width="1.5" fill="none"
          stroke-dasharray="5,3"
          marker-end="url(#${marker})"/>
    ${edgeLabel(rx + 18, (fy + ty) / 2, '↩ loop back', color)}`;
  }

  // Right-side FALSE exit from diamond
  if (edge.side === 'right') {
    const fx = rightX(fromNode) + (fromNode.type === 'diamond' ? fromNode.s * 1.7 : fromNode.w / 2);
    const fy = midY(fromNode);
    const tx = toNode.x - toNode.w / 2;
    const ty = midY(toNode);

    return `
    <path d="M ${fx} ${fy} L ${tx} ${ty}"
          stroke="${color}" stroke-width="1.5" fill="none"
          marker-end="url(#${marker})"/>
    ${badge((fx + tx) / 2, (fy + ty) / 2 - 10, 'FALSE', '#ef4444')}`;
  }

  // Standard straight downward arrow
  const fx = bottomX(fromNode);
  const fy = bottomY(fromNode);
  const tx = topX(toNode);
  const ty = topY(toNode) - 2;

  if (Math.abs(fx - tx) < 8) {
    // Straight vertical
    return `
    <line x1="${fx}" y1="${fy}" x2="${tx}" y2="${ty}"
          stroke="${color}" stroke-width="1.5"
          marker-end="url(#${marker})"/>
    ${edge.label ? badge((fx + tx) / 2 + 14, (fy + ty) / 2, edge.label, color) : ''}`;
  } else {
    // Slight curve
    const cy = (fy + ty) / 2;
    return `
    <path d="M ${fx} ${fy} C ${fx} ${cy}, ${tx} ${cy}, ${tx} ${ty}"
          stroke="${color}" stroke-width="1.5" fill="none"
          marker-end="url(#${marker})"/>
    ${edge.label ? badge((fx + tx) / 2 + 14, cy - 4, edge.label, color) : ''}`;
  }
}

// ── Geometry Helpers ───────────────────────────────────────────────────────────

function topX(n)    { return n.x; }
function topY(n)    { return n.type === 'diamond' || n.type === 'infinite' ? n.y - n.s : n.y; }
function bottomX(n) { return n.x; }
function bottomY(n) { return n.type === 'diamond' || n.type === 'infinite' ? n.y + n.s : n.y + n.h; }
function midY(n)    { return n.type === 'diamond' || n.type === 'infinite' ? n.y : n.y + n.h / 2; }
function rightX(n)  { return n.type === 'diamond' || n.type === 'infinite' ? n.x + n.s * 1.7 : n.x + n.w / 2; }

function markerFor(color) {
  if (color === '#4ade80') return 'arr-green';
  if (color === '#ef4444') return 'arr-red';
  if (color === '#f59e0b') return 'arr-amber';
  return 'arr-grey';
}

function badge(x, y, text, color) {
  const w = text.length * 6.2 + 8;
  const bg = color + '22';
  return `
  <rect x="${x - w/2}" y="${y - 9}" width="${w}" height="14" rx="3"
        fill="${bg}" stroke="${color}" stroke-width="0.8"/>
  <text x="${x}" y="${y + 2}"
        fill="${color}" font-size="8.5" font-weight="700"
        font-family="'Inter',sans-serif" text-anchor="middle">${escXml(text)}</text>`;
}

function edgeLabel(x, y, text, color) {
  return `<text x="${x}" y="${y}"
    fill="${color}" font-size="8" font-family="'Inter',sans-serif">${escXml(text)}</text>`;
}

// ── Text Utilities ─────────────────────────────────────────────────────────────

function formatAction(action) {
  if (!action) return '';
  // Remove worker prefixes for cleaner labels
  return action
    .replace(/^Init:\s*/i, '')
    .replace(/^Function started/i, 'Start')
    .replace(/^Loop:\s*/i, '')
    .replace(/^For:\s*/i, '')
    .replace(/^Check:\s*/i, '')
    .trim();
}

function formatVars(vars) {
  if (!vars || typeof vars !== 'object') return '';
  const entries = Object.entries(vars).slice(0, 4);
  return entries.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join('  ');
}

function splitLabel(text, maxChars = 24) {
  if (!text || text.length <= maxChars) return [text || '', ''];
  const words = text.split(' ');
  let line1 = '', line2 = '';
  for (const w of words) {
    if ((line1 + ' ' + w).trim().length <= maxChars) {
      line1 = (line1 + ' ' + w).trim();
    } else {
      line2 = (line2 + ' ' + w).trim();
    }
  }
  return [line1, line2 ? truncate(line2, maxChars) : ''];
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function escXml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function emptyStateSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width="100%" height="auto">
    <rect width="400" height="200" fill="#090d12" rx="8"/>
    <text x="200" y="90" fill="#484f58" font-size="14" font-family="'Inter',sans-serif"
          text-anchor="middle" font-weight="600">No trace data available</text>
    <text x="200" y="112" fill="#30363d" font-size="11" font-family="'Inter',sans-serif"
          text-anchor="middle">Run a dry run to see the execution path</text>
  </svg>`;
}
