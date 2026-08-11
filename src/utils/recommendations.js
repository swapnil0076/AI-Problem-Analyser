/**
 * recommendations.js — Local problem database utility for the extension.
 *
 * Reads from bundled data/ files (scraped once by scripts/scrape-leetcode.js).
 * Used by background.js to power the "Recommended Questions" feature.
 *
 * Strategy: given a problem's tags + difficulty, find the most relevant
 * free problems the user hasn't likely solved yet (sorted by acceptance rate).
 */

const DATA_BASE_URL = chrome.runtime.getURL('data/');

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
 * @param {string[]} tags         - topic tag slugs from GraphQL (e.g. ["array","hash-table"])
 * @param {string}   difficulty   - "Easy" | "Medium" | "Hard"
 * @param {number}   limit        - max results to return (default 6)
 * @returns {Promise<RecommendedProblem[]>}
 */
export async function getRecommendations(currentSlug, tags = [], difficulty = '', limit = 6) {
  if (!tags.length) return [];

  // Score each candidate problem across all relevant tags
  const scores = new Map(); // slug → { problem, score }

  for (const tag of tags) {
    const tagProblems = await loadTagFile(tag);
    for (const p of tagProblems) {
      if (p.slug === currentSlug) continue; // exclude current problem
      if (!scores.has(p.slug)) {
        scores.set(p.slug, { problem: p, score: 0 });
      }
      // Score: +2 for same difficulty, +1 for tag overlap, weighted by acRate proximity
      const entry = scores.get(p.slug);
      entry.score += 1; // tag match
      if (p.difficulty === difficulty) entry.score += 2;
    }
  }

  // Sort: highest score first, then by acceptance rate (most accessible first)
  const sorted = Array.from(scores.values())
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

  return sorted;
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
export async function getProblemsByDifficulty(difficulty, limit = 10) {
  try {
    const resp = await fetch(`${DATA_BASE_URL}by-difficulty/${difficulty.toLowerCase()}.json`);
    const problems = await resp.json();
    // Return a random sample for variety
    return shuffleSample(problems, limit);
  } catch {
    return [];
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function shuffleSample(arr, n) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}
