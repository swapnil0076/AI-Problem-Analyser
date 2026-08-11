/**
 * recommendations.js — Local problem database utility for the extension.
 *
 * Reads from bundled data/ files (scraped once by scripts/scrape-leetcode.js).
 * Used by background.js to power the "Recommended Questions" feature.
 *
 * Strategy: given a problem's tags + difficulty, find the most relevant
 * free problems the user hasn't likely solved yet (sorted by acceptance rate).
 */

const DATA_BASE_URL = (typeof chrome !== 'undefined' && chrome.runtime?.getURL) 
  ? chrome.runtime.getURL('data/') 
  : './data/';

// ─── Cache (in-memory, per service worker lifetime) ───────────────────────────
let _index = null;        // slug → { title, difficulty, acRate, tags }
let _byTag = {};          // tag-slug → [problem]
let _meta  = null;

// ─── Loaders ──────────────────────────────────────────────────────────────────

async function loadIndex() {
  if (_index) return _index;
  try {
    const resp = await fetch(`${DATA_BASE_URL}index.json`);
    _index = await resp.json();
  } catch {
    _index = {};
  }
  return _index;
}

async function loadTagFile(tagSlug) {
  if (!tagSlug) return [];
  if (_byTag[tagSlug]) return _byTag[tagSlug];
  try {
    const resp = await fetch(`${DATA_BASE_URL}by-tag/${tagSlug}.json`);
    if (!resp.ok) return [];
    _byTag[tagSlug] = await resp.json();
  } catch {
    _byTag[tagSlug] = [];
  }
  return _byTag[tagSlug];
}

export async function loadMeta() {
  if (_meta) return _meta;
  try {
    const resp = await fetch(`${DATA_BASE_URL}meta.json`);
    _meta = await resp.json();
  } catch {
    _meta = null;
  }
  return _meta;
}

// ─── Main API ─────────────────────────────────────────────────────────────────

/**
 * Get recommended problems for a given problem.
 *
 * @param {string}   currentSlug  - e.g. "two-sum"
 * @param {any[]}    inputTags    - topic tags (strings or objects with slug/name)
 * @param {string}   inputDifficulty - "Easy" | "Medium" | "Hard"
 * @param {number}   limit        - max results to return (default 6)
 * @returns {Promise<RecommendedProblem[]>}
 */
export async function getRecommendations(currentSlug, inputTags = [], inputDifficulty = '', limit = 6) {
  const index = await loadIndex();
  const indexedProblem = index[currentSlug];

  // Extract tags: try inputTags first, fallback to index.json for currentSlug
  let tags = [];
  if (Array.isArray(inputTags) && inputTags.length > 0) {
    tags = inputTags
      .map(t => {
        if (!t) return null;
        if (typeof t === 'string') return t.toLowerCase().trim().replace(/\s+/g, '-');
        if (t.slug) return t.slug;
        if (t.name) return t.name.toLowerCase().trim().replace(/\s+/g, '-');
        return null;
      })
      .filter(Boolean);
  }

  if (tags.length === 0 && indexedProblem?.tags) {
    tags = indexedProblem.tags;
  }

  const difficulty = inputDifficulty || indexedProblem?.difficulty || 'Easy';

  // Score each candidate problem across all relevant tags
  const scores = new Map(); // slug → { problem, score }

  for (const tag of tags) {
    const tagProblems = await loadTagFile(tag);
    for (const p of tagProblems) {
      if (p.slug === currentSlug) continue; // exclude current problem
      if (!scores.has(p.slug)) {
        scores.set(p.slug, { problem: p, score: 0 });
      }
      const entry = scores.get(p.slug);
      entry.score += 1; // tag match
      if (p.difficulty === difficulty) entry.score += 2;
    }
  }

  let candidates = Array.from(scores.values());

  // Fallback: if we don't have enough candidates from tags, fill from same difficulty
  if (candidates.length < limit) {
    const diffProblems = await getProblemsByDifficulty(difficulty, limit * 3);
    for (const p of diffProblems) {
      if (p.slug === currentSlug || scores.has(p.slug)) continue;
      scores.set(p.slug, { problem: p, score: 0 });
    }
    candidates = Array.from(scores.values());
  }

  return candidates
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.problem.acRate - a.problem.acRate;
    })
    .slice(0, limit)
    .map(e => ({
      title:      e.problem.title,
      slug:       e.problem.slug,
      difficulty: e.problem.difficulty,
      acRate:     e.problem.acRate,
      url:        `https://leetcode.com/problems/${e.problem.slug}/`,
    }));
}

/**
 * Look up a single problem's metadata from local index.
 * Faster than making a GraphQL call.
 */
export async function lookupProblem(slug) {
  const idx = await loadIndex();
  return idx[slug] ?? null;
}

/**
 * Get problems by difficulty from local data.
 * Used for the "Practice more Easy/Medium/Hard" feature.
 */
export async function getProblemsByDifficulty(difficulty = 'Easy', limit = 10) {
  try {
    const diffKey = (difficulty || 'easy').toLowerCase();
    const resp = await fetch(`${DATA_BASE_URL}by-difficulty/${diffKey}.json`);
    if (!resp.ok) return [];
    const problems = await resp.json();
    return shuffleSample(problems, limit);
  } catch {
    return [];
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function shuffleSample(arr, n) {
  if (!Array.isArray(arr)) return [];
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}
